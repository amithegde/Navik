// Ctrl+K jumps focus to the sidebar search box from anywhere in the app, matching the
// find/search convention used by most editors and browsers. Capture-phase so it wins regardless
// of which element currently has focus.
export function installSearchShortcut(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (e.key !== 'k' && e.key !== 'K') return

    const input = document.querySelector<HTMLInputElement>('.search-input')
    if (!input) return

    e.preventDefault()
    input.focus()
    input.select()
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
