import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ClaudeHome } from './claude-home'
import { getProcessStartTimes, isRegisteredProcess } from './process-identity'
import type { RunningProcessInfo } from '../shared/session-types'

// process.kill with signal 0 sends no actual signal; it just probes whether the pid exists
// (ESRCH if not) — works cross-platform, including Windows, without listing every process.
export function isProcessAlive(pid: number): boolean {
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
// the entries whose original process is still alive. Keyed by lowercased session id.
//
// Liveness alone (process.kill pid-0) isn't enough: the CLI never deletes these files, so once a
// claude.exe exits its pid is free to be recycled by an unrelated process (another terminal, a
// shell, even this app). A naive isProcessAlive check then reports the stale entry as running —
// the very bug where a killed session keeps its green dot. So every live-looking pid is also
// identity-checked against the startedAt the CLI recorded: same start time (within tolerance) is
// the real process, a different one is a recycled pid and the entry is treated as stale.
export async function getRunningBySessionId(home: ClaudeHome): Promise<Map<string, RunningProcessInfo>> {
  const result = new Map<string, RunningProcessInfo>()

  let entries: string[]
  try {
    entries = await fs.readdir(home.sessionsDir)
  } catch {
    return result
  }

  const candidates: RunningProcessInfo[] = []
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
    candidates.push(info)
  }

  if (candidates.length === 0) return result

  // One subprocess for every candidate, not one per candidate. If the tool itself can't run we
  // fall back to the isProcessAlive result above rather than silently hiding real sessions — a
  // false "running" is annoying, but hiding a genuinely live one breaks attach/stop.
  let startTimes: Map<number, Date> | null
  try {
    startTimes = await getProcessStartTimes(candidates.map((c) => c.pid))
  } catch {
    startTimes = null
  }

  for (const info of candidates) {
    if (startTimes !== null) {
      const actual = startTimes.get(info.pid)
      if (!actual || !isRegisteredProcess(info.startedAtUtc, actual)) continue // pid gone or recycled
    }
    result.set(info.sessionId.toLowerCase(), info)
  }

  return result
}
