import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { killProcessTree } from './kill-process-tree'
import { isProcessAlive } from './running-session-registry'
import type { RunningProcessInfo } from '../shared/session-types'

const execFileAsync = promisify(execFile)

// How far the OS's own start time for a pid may sit from the startedAt the CLI wrote into
// ~/.claude/sessions/{pid}.json before we conclude they're different processes. Generous because
// the two are recorded by different clocks at slightly different moments (process creation vs.
// the CLI getting far enough to write its registry entry); a recycled pid is hours or days off,
// not seconds.
const startTimeToleranceMs = 5 * 60 * 1000

export type StopSessionOutcome = 'stopped' | 'not-running' | 'failed'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getProcessStartTime(pid: number): Promise<Date | null> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`
      ])
      const parsed = new Date(stdout.trim())
      return Number.isNaN(parsed.getTime()) ? null : parsed
    } catch {
      return null
    }
  }

  // `etimes` (elapsed seconds since start) is supported by both GNU and BSD/macOS `ps`, unlike
  // `lstart`'s locale-dependent date format — 1-second resolution is plenty for a 5-minute tolerance.
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'etimes=', '-p', String(pid)])
    const etimes = parseInt(stdout.trim(), 10)
    return Number.isNaN(etimes) ? null : new Date(Date.now() - etimes * 1000)
  } catch {
    return null
  }
}

/** Whether the process now holding the pid is plausibly the one the registry entry was written
 * for. An entry without a startedAt can't be checked this way — treated as a match, since every
 * entry the CLI writes has one and refusing outright would make the button dead. */
export function isRegisteredProcess(registeredStartUtc: string | undefined, actualStartUtc: Date): boolean {
  if (!registeredStartUtc) return true
  const registered = new Date(registeredStartUtc).getTime()
  return Math.abs(actualStartUtc.getTime() - registered) <= startTimeToleranceMs
}

/**
 * Kills the claude.exe behind a session this app didn't spawn — one discovered through the
 * running-session registry (a terminal, the VS Code extension). Sessions this app drives itself
 * are stopped through their own ClaudeLiveSession instead, which owns the process handle.
 *
 * Registry entries are not deleted when a claude instance exits, so a stale entry plus a recycled
 * pid can look alive — hence the start-time check before killing anything. Getting that wrong
 * means killing an unrelated process, so this refuses rather than guesses whenever it can't
 * confirm the identity.
 */
export async function stopRunningSession(info: RunningProcessInfo): Promise<{ outcome: StopSessionOutcome; error?: string }> {
  if (!isProcessAlive(info.pid)) return { outcome: 'not-running' }

  const actualStartUtc = await getProcessStartTime(info.pid)
  if (actualStartUtc === null) {
    // Couldn't read the start time — either it exited between the check and here, or we can't
    // inspect it (permissions, or it's being torn down). Re-check liveness to tell those apart
    // rather than reporting a scary failure for a session that's simply already gone.
    return isProcessAlive(info.pid) ? { outcome: 'failed', error: `Could not inspect process ${info.pid}.` } : { outcome: 'not-running' }
  }

  if (!isRegisteredProcess(info.startedAtUtc, actualStartUtc)) return { outcome: 'not-running' }

  try {
    await killProcessTree(info.pid)
  } catch (err) {
    return { outcome: 'failed', error: (err as Error).message }
  }

  // Give the OS a brief moment to finish tearing the tree down, then confirm the outcome rather
  // than trusting the kill command's own exit code (taskkill/kill signal delivery isn't always
  // synchronous with the process actually exiting).
  await delay(150)
  return isProcessAlive(info.pid) ? { outcome: 'failed', error: 'The process could not be stopped.' } : { outcome: 'stopped' }
}
