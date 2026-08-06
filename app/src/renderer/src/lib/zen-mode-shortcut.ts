import { isZenMode, setIsZenMode, isTerminalZen, setIsTerminalZen } from '../state/layout-store'

// Escape always exits either zen mode, regardless of what's on screen. This is the only guaranteed
// way out of session zen (the sidebar and its Home button are hidden while it's active, and the
// toggle button only renders inside DetailPane's selected-session view — if the selected session
// drops out of a background session-list refresh, DetailPane falls back to HomeView and that button
// disappears). The same guarantee now covers terminal zen, whose toggle lives on the terminal
// toolbar. The event isn't swallowed, so a focused terminal still receives the Esc byte (vim etc.)
// — exiting zen is an additive side effect, not a hijack.
export function installZenModeEscapeHatch(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    const sessionZen = isZenMode()
    const terminalZen = isTerminalZen()
    if (!sessionZen && !terminalZen) return
    setIsZenMode(false)
    setIsTerminalZen(false)
  }

  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
