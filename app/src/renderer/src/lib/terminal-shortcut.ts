// Ctrl+` toggles the integrated terminal panel (VS Code convention). Capture-phase so it wins
// regardless of focus (the composer, an input, or xterm itself may have it), and preventDefault so
// the backtick never reaches whatever field is focused. Not bound when a modifier other than Ctrl
// is held, so Ctrl+Shift+` etc. stay available for future commands.
import { toggleTerminal } from '../state/layout-store'

export function installTerminalShortcut(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (e.key !== '`' && e.key !== '~') return
    e.preventDefault()
    e.stopPropagation()
    toggleTerminal()
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
