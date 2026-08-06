import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// How far the OS's own start time for a pid may sit from the startedAt the CLI wrote into
// ~/.claude/sessions/{pid}.json before we conclude they're different processes. Generous because
// the two are recorded by different clocks at slightly different moments (process creation vs.
// the CLI getting far enough to write its registry entry); a recycled pid is hours or days off,
// not seconds.
const startTimeToleranceMs = 5 * 60 * 1000

async function getProcessStartTime(pid: number): Promise<Date | null> {
  // Thin wrapper over the batched lookup so there's a single implementation of the per-platform
  // start-time probe. Swallows tool-unavailability as null — the terminator relies on that to
  // report a graceful 'failed' rather than throwing when it can't inspect the pid.
  try {
    return (await getProcessStartTimes([pid])).get(pid) ?? null
  } catch {
    return null
  }
}

/** Whether the process now holding the pid is plausibly the one the registry entry was written
 *  for. An entry without a startedAt can't be checked this way — treated as a match, since every
 *  entry the CLI writes has one and refusing outright would make the button dead. */
export function isRegisteredProcess(registeredStartUtc: string | undefined, actualStartUtc: Date): boolean {
  if (!registeredStartUtc) return true
  const registered = new Date(registeredStartUtc).getTime()
  return Math.abs(actualStartUtc.getTime() - registered) <= startTimeToleranceMs
}

export { getProcessStartTime }

/**
 * Start times for a batch of pids in a single subprocess call — one `Get-Process` on Windows, one
 * `ps` elsewhere — rather than one spawn per pid. Returns only the pids that still exist and are
 * queryable; a pid missing from the map has either exited or can't be inspected. Throws if the
 * underlying tool itself can't be run, so the caller can fall back to a weaker liveness signal
 * rather than silently reporting every candidate as dead.
 */
export async function getProcessStartTimes(pids: number[]): Promise<Map<number, Date>> {
  const result = new Map<number, Date>()
  if (pids.length === 0) return result

  if (process.platform === 'win32') {
    const list = pids.join(',')
    // `Get-Process -Id <missing>` is a terminating error; with several pids in one call a single
    // dead one (a candidate that exited between our isProcessAlive check and here) would fail the
    // whole batch. So each pid is resolved under its own try/catch — missing pids are simply absent
    // from the output instead of aborting the lookup, and the process still exits 0.
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ids = ${list} -split ','; $ids | ForEach-Object { try { $p = Get-Process -Id $_ -ErrorAction Stop; "$($p.Id)|$($p.StartTime.ToUniversalTime().ToString('o'))" } catch {} }`
    ])
    for (const line of stdout.split(/\r?\n/)) {
      const sep = line.indexOf('|')
      if (sep <= 0) continue
      const pid = parseInt(line.slice(0, sep), 10)
      const start = new Date(line.slice(sep + 1).trim())
      if (!Number.isNaN(pid) && !Number.isNaN(start.getTime())) result.set(pid, start)
    }
    return result
  }

  // List every process and filter in JS rather than `ps -p a,b,c`: like Get-Process, `ps` with a
  // missing pid in its `-p` list exits non-zero, which would fail the whole batch whenever a
  // candidate exited between our isProcessAlive check and here. `-e` (all processes) always exits 0.
  const wanted = new Set(pids)
  const { stdout } = await execFileAsync('ps', ['-e', '-o', 'pid=,etimes='])
  for (const line of stdout.split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [pidStr, etimesStr] = trimmed.split(/\s+/)
    const pid = parseInt(pidStr, 10)
    if (!wanted.has(pid)) continue
    const etimes = parseInt(etimesStr, 10)
    if (!Number.isNaN(etimes)) result.set(pid, new Date(Date.now() - etimes * 1000))
  }
  return result
}
