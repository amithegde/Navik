import { ipcMain, BrowserWindow } from 'electron'
import { spawn, type IPty } from 'node-pty'
import os from 'node:os'
import { IpcChannels } from '../shared/ipc-channels'

// A single integrated terminal (VS Code-style Ctrl+` panel). One pty at a time — the renderer
// keeps the xterm + pty alive across open/close toggles, only killing on the explicit trash
// button or app shutdown. node-pty ships N-API prebuilds, so no native rebuild is needed to load
// under Electron; the ConPTY runtime files (conpty.dll / OpenConsole.exe on Windows) are resolved
// relative to node-pty's own package location, which is why the package must ship intact.
//
// All output is streamed back over IPC as the pty emits it — there is no buffering, so a fast
// `ls -R` will still feel instant. The `id` in every payload lets a future multi-terminal UI route
// events; today the renderer only ever holds one id.

let terminal: ManagedTerminal | null = null

interface ManagedTerminal {
  id: string
  pty: IPty
  exited: boolean
  /** Disposers for the pty's own event listeners — released on teardown so a reused/respawned pty
   *  never carries stale handlers forward. */
  dataDisp: { dispose(): void }
  exitDisp: { dispose(): void }
  /** webContents the pty output should stream to — captured from the create call so output never
   *  leaks to a window that didn't ask for it (and dies with the window). */
  owner: BrowserWindow
}

let nextId = 1

function defaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  if (process.platform === 'darwin') return process.env['SHELL'] || '/bin/zsh'
  return process.env['SHELL'] || '/bin/bash'
}

function sendToOwner(term: ManagedTerminal, channel: string, payload: unknown): void {
  if (term.owner.isDestroyed()) return
  term.owner.webContents.send(channel, payload)
}

function destroyPty(term: ManagedTerminal): void {
  term.dataDisp.dispose()
  term.exitDisp.dispose()
  try {
    term.pty.kill()
  } catch {
    // Already gone — kill is best-effort.
  }
}

/** Tears down the live pty (if any). Called on explicit kill, on app shutdown, and as a safety
 *  net when the owning window closes so we don't leak a headless shell. */
export function disposeTerminal(): void {
  if (!terminal) return
  if (!terminal.exited) destroyPty(terminal)
  terminal = null
}

export function initTerminalHost(): void {
  ipcMain.handle(
    IpcChannels.terminalCreate,
    async (event, opts: { cwd?: string; cols?: number; rows?: number }) => {
      const owner = BrowserWindow.fromWebContents(event.sender)
      if (!owner) return { error: 'No window.' }

      // Reuse a still-running pty whose owner is alive: the renderer persists the xterm across
      // toggles, so a reopen must not spawn a second shell that races the first for output.
      if (terminal && !terminal.exited && !terminal.owner.isDestroyed()) {
        return { id: terminal.id, shell: terminal.pty.process }
      }

      const cols = Math.max(1, Math.min(400, opts.cols ?? 80))
      const rows = Math.max(1, Math.min(120, opts.rows ?? 24))
      const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : os.homedir()

      // A stale entry from a window that closed without disposing (e.g. crash) would otherwise
      // leave a ghost shell behind — clear it before spawning the replacement.
      if (terminal) {
        if (!terminal.exited) destroyPty(terminal)
        terminal = null
      }

      try {
        const pty = spawn(defaultShell(), [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: { ...process.env, TERM: 'xterm-256color' } as NodeJS.ProcessEnv
        })

        const id = `term-${nextId++}`
        const managed: ManagedTerminal = { id, pty, exited: false, owner, dataDisp: { dispose() {} }, exitDisp: { dispose() {} } }

        managed.dataDisp = pty.onData((data) => sendToOwner(managed, IpcChannels.terminalData, { id, data }))
        managed.exitDisp = pty.onExit(({ exitCode }) => {
          managed.exited = true
          sendToOwner(managed, IpcChannels.terminalExit, { id, exitCode })
        })

        // If the window goes away (close/crash), stop streaming and reap the pty — otherwise it
        // outlives its only consumer and keeps a console alive invisibly.
        const closeHandler = (): void => {
          if (terminal === managed) {
            if (!managed.exited) destroyPty(managed)
            terminal = null
          }
          owner.removeListener('closed', closeHandler)
        }
        owner.on('closed', closeHandler)

        terminal = managed
        return { id, shell: pty.process }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.on(
    IpcChannels.terminalInput,
    (_event, payload: { id: string; data: string }) => {
      const term = terminal
      if (!term || term.id !== payload.id || term.exited) return
      try {
        term.pty.write(payload.data)
      } catch {
        // Write to a dead pty — ignore; the exit event handles teardown on the renderer side.
      }
    }
  )

  ipcMain.on(
    IpcChannels.terminalResize,
    (_event, payload: { id: string; cols: number; rows: number }) => {
      const term = terminal
      if (!term || term.id !== payload.id || term.exited) return
      const cols = Math.max(1, Math.min(400, payload.cols))
      const rows = Math.max(1, Math.min(120, payload.rows))
      try {
        term.pty.resize(cols, rows)
      } catch {
        // Resize before the pty is fully ready (or after exit) can throw — not worth surfacing.
      }
    }
  )

  ipcMain.handle(IpcChannels.terminalKill, async (_event, id: string) => {
    const term = terminal
    if (!term || term.id !== id) return
    if (!term.exited) destroyPty(term)
    terminal = null
  })
}
