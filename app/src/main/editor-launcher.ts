import { spawn } from 'node:child_process'

// On Windows, `code`/`code-insiders` resolve to a .cmd shim — Node's spawn refuses to exec those
// directly (EINVAL; only .exe is spawnable without a shell), so route it through cmd.exe /c
// instead. That keeps args passed through Node's normal (non-shell) argv escaping — no manual
// string concatenation, so folderPath doesn't need sanitizing.
export function openInEditor(executablePath: string, folderPath: string): { success: boolean; error?: string } {
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', executablePath, folderPath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn(executablePath, [folderPath], { detached: true, stdio: 'ignore' }).unref()
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
