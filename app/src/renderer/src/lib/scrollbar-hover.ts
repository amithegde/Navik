// Expands a scroll container's thumb only while the cursor is actually over the track (not just
// anywhere in the element), and reliably shrinks it back — CSS :hover alone can get stuck on
// after a thumb drag releases outside the element.
const selector = '.session-scroll, .transcript-scroll, .tool-io-text'
const hoverClass = 'scrollbar-hover'

function isOverScrollbar(el: Element, x: number): boolean {
  const scrollbarWidth = (el as HTMLElement).offsetWidth - (el as HTMLElement).clientWidth
  if (scrollbarWidth <= 0) return false
  return x >= el.getBoundingClientRect().right - scrollbarWidth
}

export function installScrollbarHover(): () => void {
  let current: Element | null = null

  const onMouseMove = (e: MouseEvent): void => {
    const el = (e.target as Element | null)?.closest(selector) ?? null
    const shouldHover = el && isOverScrollbar(el, e.clientX)

    if (current && current !== (shouldHover ? el : null)) current.classList.remove(hoverClass)
    if (shouldHover) el!.classList.add(hoverClass)
    current = shouldHover ? el : null
  }

  const onMouseLeave = (): void => {
    current?.classList.remove(hoverClass)
    current = null
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseleave', onMouseLeave)

  return () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseleave', onMouseLeave)
  }
}
