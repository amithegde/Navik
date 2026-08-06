import { killProcessTree } from './kill-process-tree'
import { isProcessAlive } from './running-session-registry'
import { getProcessStartTime, isRegisteredProcess } from './process-identity'
import type { RunningProcessInfo } from '../shared/session-types'

export type StopSessionOutcome = 'stopped' | 'not-running' | 'failed'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
