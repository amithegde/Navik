/** Set the native tooltip to the full text only when the element is actually overflowing its
 * own box (single-line ellipsis truncation). Called from onMouseEnter so the check reflects the
 * current layout/width — cheaper and more accurate than a ResizeObserver for every title. */
export function applyTitleIfTruncated(el: HTMLElement, title: string): void {
  if (el.scrollWidth > el.clientWidth) {
    el.title = title
  } else {
    el.removeAttribute('title')
  }
}
