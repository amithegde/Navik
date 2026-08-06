// Horizontal resize sash between the detail pane (top) and the integrated terminal (bottom).
// Mirrors lib/pane-resizer.ts but operates on row height instead of column width: the terminal's
// height is the distance from the pointer down to the bottom of the detail column, clamped so the
// detail pane never collapses below a readable minimum. The chosen height is written to a CSS
// variable consumed by the grid layout, and persisted to localStorage (restored pre-paint in
// index.html) so a resized panel survives reloads — exactly like the sidebar width.

const storageKey = 'navik-terminal-height'
const resizerHeight = 4
const minHeight = 80
const minDetailHeight = 120

export function applyTerminalHeight(height: number): void {
  document.documentElement.style.setProperty('--terminal-height', `${height}px`)
}

export function installTerminalResizer(handle: HTMLElement): () => void {
  let dragging = false

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-terminal')
    e.preventDefault()
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return
    const col = handle.parentElement
    if (!col) return

    const rect = col.getBoundingClientRect()
    const style = getComputedStyle(col)
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0

    // Terminal grows upward from the bottom as the sash is dragged down; clamp so the detail pane
    // above always keeps at least `minDetailHeight`, and the sash can't leave the column.
    const innerHeight = rect.height - paddingTop - paddingBottom
    const maxHeight = Math.max(minHeight, innerHeight - minDetailHeight - resizerHeight)
    const fromBottom = rect.bottom - paddingBottom - e.clientY
    const height = Math.max(minHeight, Math.min(fromBottom, maxHeight))
    applyTerminalHeight(height)
  }

  const endDrag = (): void => {
    if (!dragging) return
    dragging = false
    document.body.classList.remove('resizing-terminal')
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--terminal-height'))
    if (!Number.isNaN(current)) localStorage.setItem(storageKey, String(Math.round(current)))
  }

  handle.addEventListener('pointerdown', onPointerDown)
  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', endDrag)
  handle.addEventListener('pointercancel', endDrag)

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown)
    handle.removeEventListener('pointermove', onPointerMove)
    handle.removeEventListener('pointerup', endDrag)
    handle.removeEventListener('pointercancel', endDrag)
  }
}
