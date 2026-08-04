import { isZenMode, setIsZenMode } from '../state/layout-store'

// Escape always exits zen mode, regardless of what's on screen. This is the only guaranteed
// way out: the sidebar (and its Home button) is hidden while zen mode is active, and the
// toggle button itself only renders inside DetailPane's selected-session view — if the
// selected session drops out of a background session-list refresh, DetailPane falls back to
// HomeView and that button disappears too.
export function installZenModeEscapeHatch(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !isZenMode()) return
    setIsZenMode(false)
  }

  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
