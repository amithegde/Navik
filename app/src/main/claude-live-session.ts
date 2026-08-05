import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import readline from 'node:readline'
import { tryParseTurn } from './claude-turn-parser'
import { killProcessTree } from './kill-process-tree'
import type { ImageAttachment, LiveTurnSummary } from '../shared/transcript-types'

// How long to wait for a control_response before giving up on it. Generous: the CLI answers
// these in milliseconds, so this only ever fires for a CLI that silently ignores the request
// rather than rejecting it.
const controlResponseTimeoutMs = 15_000

export const defaultModelValue = 'default'

export type LiveSessionState = 'starting' | 'ready' | 'busy' | 'exited' | 'faulted'

export interface ClaudeLiveSessionOptions {
  permissionMode?: string
  resumeSessionId?: string
  model?: string
  effort?: string
}

interface PendingControlRequest {
  resolve: (error: string | null) => void
  timeout: NodeJS.Timeout
}

type JsonRecord = Record<string, unknown>

/**
 * Drives a real `claude -p --input-format stream-json --output-format stream-json` process for a
 * fully interactive, in-app conversation — the same protocol the VS Code extension itself uses to
 * talk to claude.exe, rather than a terminal window or a reimplementation of the CLI's TUI. One
 * process serves the whole multi-turn conversation; sendUserMessage writes one more line to its
 * stdin per turn, and 'turnReceived'/'turnCompleted' report what comes back.
 *
 * Emits: 'sessionIdResolved' (id), 'turnReceived' (TranscriptEntry), 'turnCompleted'
 * (LiveTurnSummary), 'exited' (code), 'faulted' (Error).
 */
export class ClaudeLiveSession extends EventEmitter {
  readonly workingDirectory: string
  readonly processId: number
  sessionId: string | null = null
  state: LiveSessionState = 'starting'

  private readonly child: ChildProcessWithoutNullStreams
  private readonly pendingControlRequests = new Map<string, PendingControlRequest>()
  private controlRequestCounter = 0
  private stopRequested = false

  private constructor(child: ChildProcessWithoutNullStreams, workingDirectory: string) {
    super()
    this.child = child
    this.workingDirectory = workingDirectory
    this.processId = child.pid!
  }

  static start(claudeExecutablePath: string, workingDirectory: string, options: ClaudeLiveSessionOptions): ClaudeLiveSession {
    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      // Without this, the CLI never echoes the user's own message back over stdout, so a sent
      // message reaches the model fine but never appears in 'turnReceived' / the live transcript.
      '--replay-user-messages',
      '--permission-mode',
      options.permissionMode ?? 'acceptEdits'
    ]

    // "default" is the catalog's name for "this account's own default", which is exactly what the
    // CLI does when --model is absent — passing it through would just be a slower way of saying
    // nothing.
    if (options.model && options.model !== defaultModelValue) {
      args.push('--model', options.model)
    }

    // An empty/absent effort means "Auto" — let the model use its own default effort, which is
    // what the CLI does with no --effort flag.
    if (options.effort && options.effort.trim()) {
      args.push('--effort', options.effort.trim())
    }

    if (options.resumeSessionId) {
      args.push('--resume', options.resumeSessionId)
    }

    const child = spawn(claudeExecutablePath, args, {
      cwd: workingDirectory,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const session = new ClaudeLiveSession(child, workingDirectory)
    session.state = 'ready'

    child.on('exit', (code) => {
      session.state = 'exited'
      session.failPendingControlRequests('the session ended before the CLI answered')
      session.emit('exited', code)
    })
    child.on('error', (err) => {
      session.state = 'faulted'
      session.emit('faulted', err)
    })

    session.startReadLoop()
    session.startErrorDrain()
    return session
  }

  private startReadLoop(): void {
    const rl = readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity })
    rl.on('line', (line) => {
      if (line.length > 0) this.handleLine(line)
    })
  }

  // Must keep pulling from stderr for the process's whole lifetime: a pipe that nobody reads
  // fills up once the child has written enough to it (Node deprecation warnings, MCP server logs,
  // hook output), and the child then blocks on its next stderr write forever — silently wedging
  // the whole conversation since stdout stops too.
  private startErrorDrain(): void {
    const rl = readline.createInterface({ input: this.child.stderr, crlfDelay: Infinity })
    rl.on('line', () => {
      // Discarded: stderr is diagnostic noise from the CLI/MCP servers, not conversation content.
    })
  }

  async sendUserMessage(text: string, images?: ImageAttachment[]): Promise<void> {
    const hasImages = !!images && images.length > 0
    if (!text.trim() && !hasImages) return

    // Images before the caption text, matching how Claude reads a message that refers to an
    // attached image — and how Claude Code's own stream-json senders (e.g. the VS Code extension)
    // order pasted attachments.
    const content: unknown[] = []
    if (hasImages) {
      for (const image of images) {
        content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64Data } })
      }
    }
    if (text.trim()) content.push({ type: 'text', text })

    const payload = JSON.stringify({ type: 'user', message: { role: 'user', content } })
    this.state = 'busy'
    this.writeLine(payload)
  }

  /**
   * Switches the model for the rest of this conversation without restarting the process — the
   * CLI's own `set_model` control request, the same one the VS Code extension sends from its
   * model picker. Resolves only once the CLI has acknowledged it, and throws if the CLI rejects
   * it, so the caller never shows a switch that didn't happen.
   */
  async setModel(model: string): Promise<void> {
    if (!model.trim()) return
    await this.sendControlRequest('navik-set-model', { subtype: 'set_model', model })
  }

  /** Mirrors setModel: the CLI's own `set_permission_mode` control request. */
  async setPermissionMode(mode: string): Promise<void> {
    if (!mode.trim()) return
    await this.sendControlRequest('navik-set-mode', { subtype: 'set_permission_mode', mode })
  }

  /**
   * Changes effort for the running session. Unlike setModel/setPermissionMode there is no
   * `set_effort` control subtype — the CLI exposes this as the `/effort` slash command instead
   * (verified: it answers with a zero-cost `result`, "Set effort level to … (this session only)").
   * So this writes one user-turn line; the normal `result`/turnCompleted path accounts for it,
   * which is why the caller bumps pendingTurnCount alongside this call.
   */
  async setEffort(level: string): Promise<void> {
    const trimmed = level.trim()
    if (!trimmed) return
    const payload = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: `/effort ${trimmed}` }] }
    })
    this.state = 'busy'
    this.writeLine(payload)
  }

  private async sendControlRequest(prefix: string, request: JsonRecord): Promise<void> {
    const requestId = `${prefix}-${++this.controlRequestCounter}`
    const payload = JSON.stringify({ type: 'control_request', request_id: requestId, request })

    // A CLI too old to know this subtype answers with an error verdict; one that ignores it
    // entirely would leave this hanging, hence the timeout.
    const error = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingControlRequests.delete(requestId)
        resolve('Timed out waiting for the CLI to respond.')
      }, controlResponseTimeoutMs)
      this.pendingControlRequests.set(requestId, { resolve, timeout })
      this.writeLine(payload)
    })

    if (error !== null) throw new Error(error)
  }

  // A single write() call enqueues its whole line atomically relative to any other write() call —
  // Node's stream write queue preserves call order — so unlike the CLR's WriteLineAsync+FlushAsync
  // pair (two separate awaits a second caller could interleave with), no explicit stdin lock is
  // needed here.
  private writeLine(payload: string): void {
    this.child.stdin.write(payload + '\n')
  }

  private handleLine(line: string): void {
    let root: unknown
    try {
      root = JSON.parse(line)
    } catch {
      return // a stray non-JSON line (e.g. interleaved stderr) shouldn't kill the session
    }

    if (typeof root !== 'object' || root === null) return
    const rootRecord = root as JsonRecord
    const type = typeof rootRecord.type === 'string' ? rootRecord.type : null

    switch (type) {
      case 'system':
        if (rootRecord.subtype === 'init' && typeof rootRecord.session_id === 'string') {
          this.sessionId = rootRecord.session_id
          this.emit('sessionIdResolved', rootRecord.session_id)
        }
        break

      case 'assistant':
      case 'user': {
        const entry = tryParseTurn(rootRecord)
        if (entry) this.emit('turnReceived', entry)
        break
      }

      case 'result': {
        this.state = 'ready'
        const summary: LiveTurnSummary = {
          isError: rootRecord.is_error === true,
          resultText: typeof rootRecord.result === 'string' ? rootRecord.result : undefined,
          stopReason: typeof rootRecord.stop_reason === 'string' ? rootRecord.stop_reason : undefined,
          totalCostUsd: typeof rootRecord.total_cost_usd === 'number' ? rootRecord.total_cost_usd : undefined
        }
        this.emit('turnCompleted', summary)
        break
      }

      case 'control_response':
        this.handleControlResponse(rootRecord)
        break
    }
  }

  // Hands the verdict to whoever is awaiting that request id — null for success, the error text
  // otherwise. Responses to requests this session didn't send are ignored.
  private handleControlResponse(root: JsonRecord): void {
    const response = root.response
    if (typeof response !== 'object' || response === null) return
    const responseRecord = response as JsonRecord

    const requestId = responseRecord.request_id
    if (typeof requestId !== 'string') return

    const pending = this.pendingControlRequests.get(requestId)
    if (!pending) return
    this.pendingControlRequests.delete(requestId)
    clearTimeout(pending.timeout)

    if (responseRecord.subtype === 'success') {
      pending.resolve(null)
      return
    }

    const error = typeof responseRecord.error === 'string' && responseRecord.error.length > 0 ? responseRecord.error : 'the CLI rejected the request'
    pending.resolve(error)
  }

  // Nothing will ever answer a control request once the process is gone — fail the waiters now
  // instead of leaving them to time out one by one.
  private failPendingControlRequests(reason: string): void {
    for (const pending of this.pendingControlRequests.values()) {
      clearTimeout(pending.timeout)
      pending.resolve(reason)
    }
    this.pendingControlRequests.clear()
  }

  /**
   * Terminates the underlying process immediately. There is no graceful mid-turn cancel over this
   * protocol yet, so stop() is a hard kill — acceptable for a user-initiated "stop generating",
   * not something to call routinely.
   */
  stop(): void {
    if (this.stopRequested) return
    this.stopRequested = true
    if (this.child.exitCode === null && !this.child.killed) {
      void killProcessTree(this.processId)
    }
  }

  async dispose(): Promise<void> {
    this.stop()
  }
}
