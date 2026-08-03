import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export interface LaunchRequest {
  workingDirectory: string
  resumeSessionId?: string
  sessionName?: string
}

/**
 * Launches a real, full-fidelity claude CLI session in an external terminal — deliberately not a
 * reimplementation of the interactive TUI. This is a fallback path only (no in-app control over
 * the resulting process); ClaudeLiveSession is the primary mechanism.
 */
export function tryLaunchExternal(claudeExecutablePath: string, request: LaunchRequest): { success: boolean; error?: string } {
  const args = buildClaudeArgs(request)

  if (process.platform === 'win32') return launchWindows(claudeExecutablePath, args, request.workingDirectory)
  if (process.platform === 'darwin') return launchMac(claudeExecutablePath, args, request.workingDirectory)
  return launchLinux(claudeExecutablePath, args, request.workingDirectory)
}

function buildClaudeArgs(request: LaunchRequest): string[] {
  const args: string[] = []
  if (request.resumeSessionId) args.push('--resume', request.resumeSessionId)
  if (request.sessionName) args.push('--name', request.sessionName)
  return args
}

// Prefers Windows Terminal (sessions land in tabs); falls back to `cmd /c start`, which opens a
// plain new console window for the child (the standard way to detach a console app from the
// launching process's own console on Windows).
function launchWindows(claudePath: string, claudeArgs: string[], cwd: string): { success: boolean; error?: string } {
  const wt = findOnPath('wt.exe')
  if (wt) {
    try {
      spawn(wt, ['-d', cwd, claudePath, ...claudeArgs], { detached: true, stdio: 'ignore' }).unref()
      return { success: true }
    } catch {
      // Fall through to the plain-console path below.
    }
  }

  try {
    spawn('cmd.exe', ['/c', 'start', '""', claudePath, ...claudeArgs], { cwd, detached: true, stdio: 'ignore' }).unref()
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

function launchMac(claudePath: string, claudeArgs: string[], cwd: string): { success: boolean; error?: string } {
  const command = [quoteForShell(claudePath), ...claudeArgs.map(quoteForShell)].join(' ')
  const script = `cd ${quoteForShell(cwd)} && ${command}`
  const appleScript = `tell application "Terminal" to do script "${script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

  try {
    spawn('osascript', ['-e', appleScript], { detached: true, stdio: 'ignore' }).unref()
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

const linuxTerminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']

function launchLinux(claudePath: string, claudeArgs: string[], cwd: string): { success: boolean; error?: string } {
  for (const terminal of linuxTerminals) {
    const bin = findOnPath(terminal)
    if (!bin) continue

    try {
      spawn(bin, ['-e', claudePath, ...claudeArgs], { cwd, detached: true, stdio: 'ignore' }).unref()
      return { success: true }
    } catch {
      // Try the next terminal emulator on the list.
    }
  }

  return { success: false, error: 'No terminal emulator found on PATH.' }
}

function findOnPath(exeName: string): string | null {
  const pathVar = process.env.PATH ?? ''
  for (const dir of pathVar.split(path.delimiter).filter((d) => d.length > 0)) {
    const candidate = path.join(dir.replace(/^"|"$/g, ''), exeName)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function quoteForShell(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}
