import { canGoBack, canGoForward, goBack, goForward } from '../state/sessions-store'

// Alt+Left / Alt+Right and the mouse back/forward buttons (X1/X2, MouseEvent.button 3/4) drive the
// page history exactly like a browser. The mouse handlers cover "browser back" hardware buttons
// (e.g. Lightech Max Master) — Chromium surfaces those as standard X1/X2 mouseup events, so no
// platform-specific path is needed.
export function installNavShortcut(): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'ArrowLeft') {
      if (!canGoBack()) return
      e.preventDefault()
      goBack()
    } else if (e.key === 'ArrowRight') {
      if (!canGoForward()) return
      e.preventDefault()
      goForward()
    }
  }

  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 3) {
      if (!canGoBack()) return
      e.preventDefault()
      goBack()
    } else if (e.button === 4) {
      if (!canGoForward()) return
      e.preventDefault()
      goForward()
    }
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('mouseup', onMouseUp)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('mouseup', onMouseUp)
  }
}
