import { EventEmitter } from 'node:events'
import { resolveClaudeHome } from './claude-home'
import { discoverSessions, groupByProject } from './session-discovery'
import { getRunningBySessionId } from './running-session-registry'
import { loadPinnedSessionIds, savePinnedSessionIds } from './pinned-sessions-store'
import type { ClaudeSession, SessionsSnapshot } from '../shared/session-types'

const pollIntervalMs = 6_000

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
      this.sessions = await discoverSessions(this.home)
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
