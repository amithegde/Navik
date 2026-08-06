// Ctrl+/ jumps focus to the message composer from anywhere in the app, mirroring the
// search-box convention (Ctrl+K) but for the primary input. Capture-phase so it wins regardless
// of which element currently has focus. Routes through the composer store's focus-request tick
// rather than touching the textarea directly — the Composer owns the only handle on the ref.
import { focusComposer } from '../state/composer-store'

export function installFocusComposerShortcut(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (e.key !== '/') return

    e.preventDefault()
    focusComposer()
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
