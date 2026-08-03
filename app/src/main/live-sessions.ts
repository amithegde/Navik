import { EventEmitter } from 'node:events'
import { ClaudeLiveSession } from './claude-live-session'
import { mergeToolResults } from './transcript-entry-merger'
import { readTranscript } from './session-transcript-reader'
import { locateClaudeCli } from './claude-cli-locator'
import { truncate } from './session-discovery'
import type { TranscriptEntry, ImageAttachment, LiveTurnSummary } from '../shared/transcript-types'
import type { RunningProcessInfo } from '../shared/session-types'
import type { LiveConversationState, LiveSessionRowUpdate } from '../shared/live-session-types'

export const defaultPermissionMode = 'auto'
export const defaultModelValue = 'default'

interface LiveSessionRecord {
  placeholderId: string
  hasKnownSessionId: boolean
  process: ClaudeLiveSession
  workingDirectory: string
  permissionMode: string
  model: string
  entries: TranscriptEntry[]
  firstUserMessageText: string | null
  pendingTurnCount: number
  hasExited: boolean
  errorMessage: string | null
  totalCostUsd: number
}

function currentKey(live: LiveSessionRecord): string {
  return live.process.sessionId ?? live.placeholderId
}

function toRunningInfo(live: LiveSessionRecord): RunningProcessInfo {
  return { pid: live.process.processId, sessionId: currentKey(live), cwd: live.workingDirectory, status: 'live' }
}

/**
 * Holds every in-app live claude conversation this app itself is driving, talking to claude.exe
 * over the same stream-json protocol the VS Code extension uses — not a spawned terminal window.
 *
 * Emits two distinct event streams, separating the sidebar's Sessions list (touched only on a
 * handful of targeted moments) from the detail pane's own turn-by-turn rendering:
 *  - 'conversationChanged' (LiveConversationState) — every turn/busy/cost/model change, for the
 *    detail pane and composer.
 *  - 'sessionRowChanged' (LiveSessionRowUpdate) — only on placeholder->real-id resolution, the
 *    first-message title reveal, and process exit — for sessions-state.ts to patch its sessions
 *    list without a full disk rescan.
 */
class LiveSessionManager extends EventEmitter {
  private readonly sessions: LiveSessionRecord[] = []
  private readonly claudePath = locateClaudeCli()

  getClaudePath(): string | null {
    return this.claudePath
  }

  findByKey(key: string | null | undefined): LiveSessionRecord | undefined {
    if (!key) return undefined
    const lower = key.toLowerCase()
    return this.sessions.find((l) => l.placeholderId.toLowerCase() === lower || l.process.sessionId?.toLowerCase() === lower)
  }

  isLiveAndRunning(sessionId: string): boolean {
    const live = this.findByKey(sessionId)
    return !!live && !live.hasExited
  }

  /** Snapshot of every still-running live session, for the discovery-refresh reconciliation pass
   * — a `-p` process may not register in ~/.claude/sessions the way an interactive one does, so a
   * fresh disk scan alone would miss it. */
  getReconciliationInfo(): Array<{ key: string; workingDirectory: string; firstUserMessageText: string | null; processId: number }> {
    return this.sessions
      .filter((l) => !l.hasExited)
      .map((l) => ({
        key: currentKey(l),
        workingDirectory: l.workingDirectory,
        firstUserMessageText: l.firstUserMessageText,
        processId: l.process.processId
      }))
  }

  startNew(workingDirectory: string, permissionMode = defaultPermissionMode, model = defaultModelValue): { success: boolean; error?: string; placeholderId?: string } {
    if (!this.claudePath) return { success: false, error: 'Could not find claude.exe on PATH or in ~/.local/bin.' }

    let child: ClaudeLiveSession
    try {
      child = ClaudeLiveSession.start(this.claudePath, workingDirectory, { permissionMode, model })
    } catch (err) {
      return { success: false, error: `Failed to launch: ${(err as Error).message}` }
    }

    const placeholderId = crypto.randomUUID()
    const live: LiveSessionRecord = {
      placeholderId,
      hasKnownSessionId: false,
      process: child,
      workingDirectory,
      permissionMode,
      model,
      entries: [],
      firstUserMessageText: null,
      pendingTurnCount: 0,
      hasExited: false,
      errorMessage: null,
      totalCostUsd: 0
    }
    this.sessions.push(live)
    this.attachEvents(live)

    this.emit('sessionRowChanged', this.rowUpdateFor(live))
    return { success: true, placeholderId }
  }

  async resume(
    sessionId: string,
    workingDirectory: string,
    transcriptPath: string,
    permissionMode = defaultPermissionMode,
    model = defaultModelValue
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.claudePath) return { success: false, error: 'Could not find claude.exe on PATH or in ~/.local/bin.' }

    const existing = this.findByKey(sessionId)
    if (existing && !existing.hasExited) return { success: true } // already live

    let priorEntries: TranscriptEntry[] = []
    if (transcriptPath) {
      try {
        priorEntries = await readTranscript(transcriptPath)
      } catch {
        // Transcript unreadable/mid-write — resume anyway with empty prior history rather than
        // blocking the takeover on it.
      }
    }

    // The read above is the only await — a second resume click could have already gone live for
    // this session while we were reading. Re-check right before spawning.
    const stillExisting = this.findByKey(sessionId)
    if (stillExisting && !stillExisting.hasExited) return { success: true }

    let child: ClaudeLiveSession
    try {
      child = ClaudeLiveSession.start(this.claudePath, workingDirectory, { permissionMode, resumeSessionId: sessionId, model })
    } catch (err) {
      return { success: false, error: `Failed to launch: ${(err as Error).message}` }
    }

    const live: LiveSessionRecord = {
      placeholderId: sessionId,
      hasKnownSessionId: true,
      process: child,
      workingDirectory,
      permissionMode,
      model,
      entries: priorEntries,
      firstUserMessageText: null,
      pendingTurnCount: 0,
      hasExited: false,
      errorMessage: null,
      totalCostUsd: 0
    }

    if (stillExisting) {
      const index = this.sessions.indexOf(stillExisting)
      if (index >= 0) this.sessions.splice(index, 1)
    }
    this.sessions.push(live)
    this.attachEvents(live)

    this.emit('sessionRowChanged', this.rowUpdateFor(live))
    return { success: true }
  }

  /** Sending while a prior turn is still in flight is intentional, not a race to guard against:
   * it queues on the CLI's own stdin, the same way the VS Code extension lets you send a
   * follow-up message while Claude is still working. */
  async sendMessage(key: string, text: string, images?: ImageAttachment[]): Promise<void> {
    const live = this.findByKey(key)
    if (!live) return

    const hasImages = !!images && images.length > 0
    if ((!text.trim() && !hasImages) || live.hasExited) return

    // The first message is the only thing that can turn a "New session" placeholder into a
    // real-looking title before the CLI reports a session id or a disk rescan happens.
    if (!live.hasKnownSessionId && live.firstUserMessageText === null && text.trim()) {
      live.firstUserMessageText = text
      this.emit('sessionRowChanged', this.rowUpdateFor(live))
    }

    live.errorMessage = null
    live.pendingTurnCount++
    this.emitConversationChanged(live)

    try {
      await live.process.sendUserMessage(text, images)
    } catch (err) {
      live.pendingTurnCount--
      live.errorMessage = `Failed to send: ${(err as Error).message}`
      this.emitConversationChanged(live)
    }
  }

  stop(key: string): void {
    this.findByKey(key)?.process.stop()
  }

  async setModel(key: string, model: string): Promise<void> {
    const live = this.findByKey(key)
    if (!live || live.hasExited || live.model === model) return

    const previous = live.model
    live.model = model
    this.emitConversationChanged(live)

    try {
      await live.process.setModel(model)
    } catch (err) {
      live.model = previous
      this.emitConversationChanged(live)
      throw err
    }
  }

  async setPermissionMode(key: string, mode: string): Promise<void> {
    const live = this.findByKey(key)
    if (!live || live.hasExited || live.permissionMode === mode) return

    const previous = live.permissionMode
    live.permissionMode = mode
    this.emitConversationChanged(live)

    try {
      await live.process.setPermissionMode(mode)
    } catch (err) {
      live.permissionMode = previous
      this.emitConversationChanged(live)
      throw err
    }
  }

  snapshot(key: string): LiveConversationState | null {
    const live = this.findByKey(key)
    return live ? this.toConversationState(live) : null
  }

  private toConversationState(live: LiveSessionRecord): LiveConversationState {
    return {
      key: currentKey(live),
      hasKnownSessionId: live.hasKnownSessionId,
      resolvedSessionId: live.process.sessionId,
      workingDirectory: live.workingDirectory,
      permissionMode: live.permissionMode,
      model: live.model,
      entries: mergeToolResults(live.entries),
      pendingTurnCount: live.pendingTurnCount,
      isBusy: live.pendingTurnCount > 0,
      hasExited: live.hasExited,
      errorMessage: live.errorMessage,
      totalCostUsd: live.totalCostUsd,
      processId: live.process.processId
    }
  }

  private rowUpdateFor(live: LiveSessionRecord, previousKey?: string): LiveSessionRowUpdate {
    return {
      key: currentKey(live),
      previousKey,
      workingDirectory: live.workingDirectory,
      title: truncate(live.firstUserMessageText) ?? undefined,
      running: live.hasExited ? null : toRunningInfo(live)
    }
  }

  private emitConversationChanged(live: LiveSessionRecord): void {
    this.emit('conversationChanged', this.toConversationState(live))
  }

  private attachEvents(live: LiveSessionRecord): void {
    live.process.on('sessionIdResolved', (id: string) => this.onSessionIdResolved(live, id))

    live.process.on('turnReceived', (entry: TranscriptEntry) => {
      live.entries.push(entry)
      this.emitConversationChanged(live)
    })

    live.process.on('turnCompleted', (summary: LiveTurnSummary) => {
      if (live.pendingTurnCount > 0) live.pendingTurnCount--
      live.totalCostUsd += summary.totalCostUsd ?? 0
      if (summary.isError) live.errorMessage = summary.resultText ?? 'The turn ended with an error.'
      this.emitConversationChanged(live)
    })

    live.process.on('exited', () => this.onProcessEnded(live))
    live.process.on('faulted', (err: Error) => {
      live.errorMessage = err.message
      this.onProcessEnded(live)
    })
  }

  private onProcessEnded(live: LiveSessionRecord): void {
    live.hasExited = true
    live.pendingTurnCount = 0
    this.emitConversationChanged(live)
    this.emit('sessionRowChanged', this.rowUpdateFor(live))
  }

  private onSessionIdResolved(live: LiveSessionRecord, sessionId: string): void {
    if (live.placeholderId.toLowerCase() === sessionId.toLowerCase()) {
      // Resuming an already-known session — its row is already correctly keyed.
      this.emit('sessionRowChanged', this.rowUpdateFor(live))
      return
    }

    // A brand-new session: the CLI has now told us its real id, different from the local
    // placeholder id selected on immediately. `currentKey()` already resolves through
    // `live.process.sessionId` (set before this event fires), so the row update carries the new
    // key; `previousKey` tells sessions-state.ts which placeholder-keyed row to drop.
    this.emit('sessionRowChanged', this.rowUpdateFor(live, live.placeholderId))
  }
}

export const liveSessionManager = new LiveSessionManager()
