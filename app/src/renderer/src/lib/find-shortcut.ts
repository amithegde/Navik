// Ctrl+F toggles the in-transcript find bar (or re-focuses it if already open). F3 / Shift+F3
// step next/prev but only when the bar is open — without an active query there are no matches to
// step through. Capture-phase so we win regardless of which element has focus, and preventDefault
// so Electron/Chromium's built-in find (if any) doesn't also fire.
//
// No-op when no session is selected: the find bar lives inside the transcript view, so opening it
// from Home would set state the UI never reflects — the user would press Ctrl+F, see nothing, and
// then be surprised when the bar pops up on their next session open.
import { isSearchOpen, openSearch, stepNext, stepPrev } from '../state/search-store'
import { selectedSession } from '../state/sessions-store'

export function installFindShortcut(): () => void {
  const handler = (e: KeyboardEvent): void => {
    const isCtrlF = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')
    const isF3 = e.key === 'F3' && !e.ctrlKey && !e.metaKey && !e.altKey

    if (isCtrlF) {
      if (!selectedSession()) return
      e.preventDefault()
      e.stopPropagation()
      // If the bar is already open, focus+select the existing input directly — `openSearch()`'s
      // signal change is a no-op (already true), so TranscriptSearchBar's onMount won't re-run.
      const existing = document.querySelector<HTMLInputElement>('.search-field')
      if (existing) {
        existing.focus()
        existing.select()
      } else {
        openSearch()
      }
      return
    }

    if (isF3 && isSearchOpen()) {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) stepPrev()
      else stepNext()
    }
  }

  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}
