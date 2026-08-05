import { EventEmitter } from 'node:events'
import { resolveClaudeHome } from './claude-home'
import { discoverSessions, groupByProject, getDisplayName, truncate } from './session-discovery'
import { getRunningBySessionId } from './running-session-registry'
import { stopRunningSession } from './running-session-terminator'
import { loadPinnedSessionIds, savePinnedSessionIds } from './pinned-sessions-store'
import { liveSessionManager, defaultModelValue, defaultPermissionMode, defaultEffortValue } from './live-sessions'
import type { ClaudeSession, SessionsSnapshot } from '../shared/session-types'
import type { LiveSessionRowUpdate, StartLiveSessionResult, ResumeLiveSessionResult } from '../shared/live-session-types'

const pollIntervalMs = 6_000

export type StopOutcome = 'stopped' | 'not-running' | 'failed'

class SessionsState extends EventEmitter {
  private readonly home = resolveClaudeHome()
  private sessions: ClaudeSession[] = []
  private projects: SessionsSnapshot['projects'] = []
  private pinnedIds = new Set<string>()
  private refreshing = false
  private pollTimer: NodeJS.Timeout | null = null

  async init(): Promise<void> {
    this.pinnedIds = await loadPinnedSessionIds()
    this.pollTimer = setInterval(() => void this.pollRunningStatus(), pollIntervalMs)
    liveSessionManager.on('sessionRowChanged', (update: LiveSessionRowUpdate) => this.applyLiveRowUpdate(update))
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
  }

  snapshot(): SessionsSnapshot {
    return { sessions: this.sessions, projects: this.projects, pinnedSessionIds: [...this.pinnedIds] }
  }

  async refresh(): Promise<SessionsSnapshot> {
    if (this.refreshing) return this.snapshot()

    this.refreshing = true
    try {
      const discovered = await discoverSessions(this.home)
      this.sessions = this.reconcileLiveSessions(discovered)
      this.projects = groupByProject(this.sessions)
      return this.snapshot()
    } finally {
      this.refreshing = false
      this.emit('changed', this.snapshot())
    }
  }

  async togglePinned(sessionId: string): Promise<string[]> {
    const key = sessionId.toLowerCase()
    if (!this.pinnedIds.delete(key)) this.pinnedIds.add(key)

    await savePinnedSessionIds(this.pinnedIds)
    this.emit('changed', this.snapshot())
    return [...this.pinnedIds]
  }

  getClaudePath(): string | null {
    return liveSessionManager.getClaudePath()
  }

  /** The one-click entry point for starting a session in a known project. */
  startNewSessionInProject(
    projectPath: string,
    permissionMode: string = defaultPermissionMode,
    model: string = defaultModelValue,
    effort: string = defaultEffortValue
  ): StartLiveSessionResult {
    return liveSessionManager.startNew(projectPath, permissionMode, model, effort)
  }

  async resumeSession(
    sessionId: string,
    projectPath: string,
    transcriptPath: string,
    permissionMode: string = defaultPermissionMode,
    model: string = defaultModelValue,
    effort: string = defaultEffortValue
  ): Promise<ResumeLiveSessionResult> {
    return liveSessionManager.resume(sessionId, projectPath, transcriptPath, permissionMode, model, effort)
  }

  async sendLiveMessage(key: string, text: string, images?: Array<{ mediaType: string; base64Data: string }>): Promise<void> {
    await liveSessionManager.sendMessage(key, text, images)
  }

  async setLiveModel(key: string, model: string): Promise<void> {
    await liveSessionManager.setModel(key, model)
  }

  async setLivePermissionMode(key: string, mode: string): Promise<void> {
    await liveSessionManager.setPermissionMode(key, mode)
  }

  async setLiveEffort(key: string, level: string): Promise<void> {
    await liveSessionManager.setEffort(key, level)
  }

  /** Stops whatever claude.exe is behind a session, whether this app spawned it or not — a live
   * process is stopped through its own handle (its 'exited' event clears the running flag),
   * anything else by the pid the CLI registered in ~/.claude/sessions. */
  async stopSession(sessionId: string): Promise<{ outcome: StopOutcome; error?: string }> {
    if (liveSessionManager.isLiveAndRunning(sessionId)) {
      liveSessionManager.stop(sessionId)
      return { outcome: 'stopped' }
    }

    const session = this.sessions.find((s) => s.sessionId.toLowerCase() === sessionId.toLowerCase())
    if (!session?.running) return { outcome: 'not-running' }

    const result = await stopRunningSession(session.running)
    if (result.outcome === 'failed') return result

    // Re-find rather than mutate the pre-await reference: a refresh() or live-session row update
    // can replace `this.sessions` with a new array while stopRunningSession's kill+verify is in
    // flight, which would otherwise mutate an object no longer reachable from `this.sessions`.
    const current = this.sessions.find((s) => s.sessionId.toLowerCase() === sessionId.toLowerCase())
    if (current) current.running = undefined
    this.projects = groupByProject(this.sessions)
    this.emit('changed', this.snapshot())
    return result
  }

  /** After a full disk rescan, re-stamp Running status for sessions this app is actively
   * live-driving — a fresh discoverSessions() only knows about ~/.claude/sessions/*.json, which a
   * `-p` process may not register in, so without this the "running" badge would flicker off on
   * every explicit refresh even though the in-app conversation is still live. */
  private reconcileLiveSessions(discovered: ClaudeSession[]): ClaudeSession[] {
    const result = [...discovered]

    for (const live of liveSessionManager.getReconciliationInfo()) {
      const match = result.find((s) => s.sessionId.toLowerCase() === live.key.toLowerCase())
      const runningInfo = { pid: live.processId, sessionId: live.key, cwd: live.workingDirectory, status: 'live' }

      if (match) {
        match.running = runningInfo
      } else {
        result.unshift({
          sessionId: live.key,
          projectPath: live.workingDirectory,
          projectDisplayName: getDisplayName(live.workingDirectory),
          title: truncate(live.firstUserMessageText) ?? 'New session',
          transcriptPath: '',
          lastActivityUtc: new Date().toISOString(),
          running: runningInfo
        })
      }
    }

    return result
  }

  /** Targeted patch driven by a single live-session event (placeholder->real-id swap, the
   * first-message title reveal, or process exit) — deliberately not a full rescan, keeping
   * these frequent, cheap updates separate from a full refresh(). */
  private applyLiveRowUpdate(update: LiveSessionRowUpdate): void {
    if (update.previousKey) {
      const lowerPrevious = update.previousKey.toLowerCase()
      this.sessions = this.sessions.filter((s) => s.sessionId.toLowerCase() !== lowerPrevious)
    }

    const lowerKey = update.key.toLowerCase()
    const existing = this.sessions.find((s) => s.sessionId.toLowerCase() === lowerKey)

    if (existing) {
      existing.running = update.running ?? undefined
      if (update.title) existing.title = update.title
    } else {
      this.sessions = [
        {
          sessionId: update.key,
          projectPath: update.workingDirectory,
          projectDisplayName: getDisplayName(update.workingDirectory),
          title: update.title ?? 'New session',
          transcriptPath: '',
          lastActivityUtc: new Date().toISOString(),
          running: update.running ?? undefined
        },
        ...this.sessions
      ]
    }

    this.projects = groupByProject(this.sessions)
    this.emit('changed', this.snapshot())
  }

  private async pollRunningStatus(): Promise<void> {
    try {
      const running = await getRunningBySessionId(this.home)

      const knownIds = new Set(this.sessions.map((s) => s.sessionId.toLowerCase()))
      const hasNewSession = [...running.keys()].some((id) => !knownIds.has(id))
      if (hasNewSession) {
        await this.refresh()
        return
      }

      let changed = false
      for (const session of this.sessions) {
        // A session this app itself is live-driving isn't necessarily in the file-based registry
        // (a `-p` process may not register there the way an interactive one does) — its running
        // flag is maintained directly by the live-session event handlers, so the file registry
        // must not overwrite it here.
        if (liveSessionManager.isLiveAndRunning(session.sessionId)) continue

        const info = running.get(session.sessionId.toLowerCase())
        const wasRunning = !!session.running
        const isRunning = !!info
        // Pid is compared too, not just the running flag: the same session id can come back
        // under a new process (ended and --resumed between two ticks) with an unchanged status.
        if (isRunning !== wasRunning || (isRunning && (session.running?.status !== info!.status || session.running?.pid !== info!.pid))) {
          session.running = info
          changed = true
        }
      }

      if (changed) this.emit('changed', this.snapshot())
    } catch {
      // Best-effort background poll — a transient failure just waits for the next tick.
    }
  }
}

export const sessionsState = new SessionsState()
