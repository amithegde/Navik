import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Node has no built-in "kill entire process tree" primitive. On Windows, `taskkill /T` walks
// the tree itself. On POSIX, killing the negated pid targets the whole process group — which
// only works because the child is spawned with `detached: true`, making it its own group
// leader (pid === pgid).
export async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F'])
    } catch {
      // Already gone, or not ours to kill any more.
    }
    return
  }

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone, or not ours to kill any more.
    }
  }
}
