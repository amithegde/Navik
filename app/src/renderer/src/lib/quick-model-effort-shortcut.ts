// Ctrl+M opens the quick model/effort picker from anywhere in the app, regardless of which
// element has focus. Capture-phase so it wins before the composer textarea or any other widget.
export function installQuickModelEffortShortcut(onTrigger: () => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (e.key !== 'm' && e.key !== 'M') return

    e.preventDefault()
    onTrigger()
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
