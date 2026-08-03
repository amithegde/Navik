// Ctrl+N starts a new session in the current project, regardless of which element has focus
// (including inside the composer).
export function installNewSessionShortcut(onTrigger: () => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (e.key !== 'n' && e.key !== 'N') return

    e.preventDefault()
    onTrigger()
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
