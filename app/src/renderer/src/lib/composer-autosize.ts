// Grows the composer textarea with its content up to CSS max-height (220px), then scrolls.
// height must be reset to 'auto' first — scrollHeight never reports below the current height, so
// without this the box could only grow, never shrink back down as text is deleted or sent.
export function autosizeTextarea(el: HTMLTextAreaElement): void {
  el.style.height = 'auto'
  const content = el.scrollHeight
  const max = parseFloat(getComputedStyle(el).maxHeight)
  const height = Number.isNaN(max) ? content : Math.min(content, max)
  el.style.height = `${height}px`
  el.style.overflowY = content > height ? 'auto' : 'hidden'
}

// Re-run on width changes only (e.g. the sidebar splitter resizing the composer) — reacting to
// height changes too would feed back into this function's own height writes.
export function installComposerAutosizeWidthObserver(el: HTMLTextAreaElement): () => void {
  let boundWidth = el.clientWidth
  const observer = new ResizeObserver(() => {
    if (el.clientWidth === boundWidth) return
    boundWidth = el.clientWidth
    autosizeTextarea(el)
  })
  observer.observe(el)
  return () => observer.disconnect()
}
