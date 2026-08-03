import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ClaudeHome } from './claude-home'
import type { RunningProcessInfo } from '../shared/session-types'

// process.kill with signal 0 sends no actual signal; it just probes whether the pid exists
// (ESRCH if not) — works cross-platform, including Windows, without listing every process.
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function parseRunningInfo(root: unknown): RunningProcessInfo | null {
  if (typeof root !== 'object' || root === null) return null
  const r = root as Record<string, unknown>
  if (typeof r.pid !== 'number' || typeof r.sessionId !== 'string') return null

  return {
    pid: r.pid,
    sessionId: r.sessionId,
    cwd: typeof r.cwd === 'string' ? r.cwd : '',
    name: typeof r.name === 'string' ? r.name : undefined,
    status: typeof r.status === 'string' ? r.status : undefined,
    kind: typeof r.kind === 'string' ? r.kind : undefined,
    entrypoint: typeof r.entrypoint === 'string' ? r.entrypoint : undefined,
    startedAtUtc: typeof r.startedAt === 'number' ? new Date(r.startedAt).toISOString() : undefined,
    updatedAtUtc: typeof r.updatedAt === 'number' ? new Date(r.updatedAt).toISOString() : undefined
  }
}

// Reads ~/.claude/sessions/{pid}.json — the registry Claude Code itself writes for every running
// instance, whether started from a terminal, the VS Code extension, or this app — and keeps only
// the entries whose process is still alive. Keyed by lowercased session id.
export async function getRunningBySessionId(home: ClaudeHome): Promise<Map<string, RunningProcessInfo>> {
  const result = new Map<string, RunningProcessInfo>()

  let entries: string[]
  try {
    entries = await fs.readdir(home.sessionsDir)
  } catch {
    return result
  }

  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    const file = path.join(home.sessionsDir, name)

    let info: RunningProcessInfo | null
    try {
      const raw = await fs.readFile(file, 'utf-8')
      info = parseRunningInfo(JSON.parse(raw))
    } catch {
      continue // file mid-write or malformed; skip this poll cycle
    }

    if (!info || !isProcessAlive(info.pid)) continue
    result.set(info.sessionId.toLowerCase(), info)
  }

  return result
}
