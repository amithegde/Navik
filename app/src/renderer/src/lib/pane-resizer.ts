const storageKey = 'navik-sidebar-width'
const resizerWidth = 4
const minDetailWidth = 280

function bounds(): { min: number; max: number } {
  return (window as unknown as { NAVIK_SIDEBAR_WIDTH_BOUNDS?: { min: number; max: number } }).NAVIK_SIDEBAR_WIDTH_BOUNDS ?? {
    min: 220,
    max: 420
  }
}

function apply(width: number): void {
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
}

export function installPaneResizer(handle: HTMLElement): () => void {
  let dragging = false

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-panes')
    e.preventDefault()
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return
    const shell = document.querySelector('.app-shell')
    if (!shell) return

    const rect = shell.getBoundingClientRect()
    const style = getComputedStyle(shell)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    const { min, max } = bounds()

    const maxWidth = Math.min(max, rect.width - paddingLeft - paddingRight - resizerWidth - minDetailWidth)
    const width = Math.max(min, Math.min(e.clientX - rect.left - paddingLeft, maxWidth))
    apply(width)
  }

  const endDrag = (): void => {
    if (!dragging) return
    dragging = false
    document.body.classList.remove('resizing-panes')
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'))
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
