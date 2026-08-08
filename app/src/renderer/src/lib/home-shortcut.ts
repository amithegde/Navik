import { goHome } from '../state/sessions-store'

// Alt+Home jumps to the Navik home view (deselecting the current session), mirroring the browser
// "open home page" shortcut. Capture-phase so it wins regardless of which element has focus.
export function installHomeShortcut(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'Home') return
    e.preventDefault()
    goHome()
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
