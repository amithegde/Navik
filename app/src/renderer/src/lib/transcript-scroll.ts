// Auto-follows new output at the bottom of the transcript unless the user has deliberately
// scrolled away, and drives the toolbar's scroll-to-top/bottom buttons. The gist: a re-render
// (streamed token, or a background refresh replacing every turn) briefly shrinks content and
// the browser clamps scrollTop, firing a scroll event that must NOT be read as the user
// scrolling up, or the view would unpin itself on every token.
const pinThresholdPx = 64
const smoothSettleMs = 700
const intentWindowMs = 400
// Landing on a step target parks scrollTop `stepScrollPaddingPx` above its true offset (for
// breathing room), so the epsilon used to tell "still on this turn" from "moved past it" must
// exceed the padding — otherwise scrollToNextUserMessage sees the turn you just landed on as
// satisfying "top > scrollTop + epsilon" and re-targets itself forever.
const stepScrollPaddingPx = 12
const stepEpsilonPx = stepScrollPaddingPx + 4

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.clientHeight - el.scrollTop
}

export class TranscriptScrollController {
  private el: HTMLElement | null = null
  private follow = true
  private animating = false
  private dragging = false
  private intentUntil = 0
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private cleanupFns: Array<() => void> = []

  bind(el: HTMLElement): void {
    this.unbind()
    this.el = el
    this.follow = true
    this.animating = false

    const onScroll = (): void => {
      if (!this.animating && this.userIsScrolling()) this.follow = distanceFromBottom(el) <= pinThresholdPx
      this.syncToolbar()
    }
    const markIntent = (): void => {
      this.intentUntil = performance.now() + intentWindowMs
    }
    const onPointerDown = (): void => {
      this.dragging = true
    }
    const endDrag = (): void => {
      if (!this.dragging) return
      this.dragging = false
      markIntent()
    }
    const onScrollEnd = (): void => {
      if (this.animating) this.endAnimation()
    }
    const onWindowBlur = (): void => endDrag()

    el.addEventListener('scroll', onScroll)
    el.addEventListener('wheel', markIntent)
    el.addEventListener('touchmove', markIntent)
    el.addEventListener('keydown', markIntent)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('scrollend', onScrollEnd)
    document.addEventListener('pointerup', endDrag)
    document.addEventListener('pointercancel', endDrag)
    window.addEventListener('blur', onWindowBlur)

    this.cleanupFns = [
      () => el.removeEventListener('scroll', onScroll),
      () => el.removeEventListener('wheel', markIntent),
      () => el.removeEventListener('touchmove', markIntent),
      () => el.removeEventListener('keydown', markIntent),
      () => el.removeEventListener('pointerdown', onPointerDown),
      () => el.removeEventListener('scrollend', onScrollEnd),
      () => document.removeEventListener('pointerup', endDrag),
      () => document.removeEventListener('pointercancel', endDrag),
      () => window.removeEventListener('blur', onWindowBlur)
    ]

    this.jumpToBottom()
    this.syncToolbar()
  }

  unbind(): void {
    for (const fn of this.cleanupFns) fn()
    this.cleanupFns = []
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.el = null
  }

  /** Call when the selected session changes — a different conversation in the same scroll
   * element starts pinned to the latest output rather than inheriting scrollback. */
  notifySessionChanged(): void {
    this.follow = true
    this.jumpToBottom()
    this.syncToolbar()
  }

  /** Call after the transcript's entries/busy state changes. */
  notifyContentChanged(): void {
    if (this.follow) this.jumpToBottom()
    this.syncToolbar()
  }

  scrollToTop(): void {
    if (!this.el) return
    this.follow = false
    this.intentUntil = 0
    this.smoothScrollTo(0)
  }

  scrollToBottom(): void {
    if (!this.el) return
    this.follow = true
    this.intentUntil = 0
    this.smoothScrollTo(this.el.scrollHeight)
  }

  /** Step to the nearest user turn above the current scroll position; repeated clicks walk
   * further back. No-ops (re-lands on the same turn) once there's nothing earlier. */
  scrollToPreviousUserMessage(): void {
    const el = this.el
    if (!el) return
    const turns = this.userTurnElements()
    if (turns.length === 0) return
    let target = turns[0]
    for (let i = turns.length - 1; i >= 0; i--) {
      if (this.topOf(turns[i]) < el.scrollTop - stepEpsilonPx) {
        target = turns[i]
        break
      }
    }
    this.follow = false
    this.intentUntil = 0
    this.smoothScrollTo(this.topOf(target) - stepScrollPaddingPx)
  }

  /** Step to the nearest user turn below the current scroll position; repeated clicks walk
   * forward. No-ops (re-lands on the same turn) once there's nothing later. */
  scrollToNextUserMessage(): void {
    const el = this.el
    if (!el) return
    const turns = this.userTurnElements()
    if (turns.length === 0) return
    let target = turns[turns.length - 1]
    for (let i = 0; i < turns.length; i++) {
      if (this.topOf(turns[i]) > el.scrollTop + stepEpsilonPx) {
        target = turns[i]
        break
      }
    }
    this.follow = false
    this.intentUntil = 0
    this.smoothScrollTo(this.topOf(target) - stepScrollPaddingPx)
  }

  /** Drop out of auto-follow so a programmatic scroll (e.g. jumping to a find-in-transcript match)
   * isn't immediately undone by the next `notifyContentChanged` snapping back to the bottom.
   * Public because the find feature lives outside this module and needs to coordinate with the
   * same follow flag the scroll buttons use. */
  pauseFollow(): void {
    this.follow = false
    this.intentUntil = 0
  }

  private userTurnElements(): HTMLElement[] {
    if (!this.el) return []
    return Array.from(this.el.querySelectorAll<HTMLElement>('.transcript-turn.user'))
  }

  /** Position of `child`'s top edge relative to `el`'s scrollable content, regardless of
   * whichever ancestor happens to be `child`'s CSS offsetParent. */
  private topOf(child: HTMLElement): number {
    const el = this.el
    if (!el) return 0
    return child.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
  }

  private userIsScrolling(): boolean {
    return this.dragging || performance.now() <= this.intentUntil
  }

  private jumpToBottom(): void {
    if (this.el) this.el.scrollTop = this.el.scrollHeight
  }

  private smoothScrollTo(top: number): void {
    const el = this.el
    if (!el) return
    this.animating = true
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(() => this.endAnimation(), smoothSettleMs)
    el.scrollTo({ top, behavior: 'smooth' })
  }

  private endAnimation(): void {
    this.animating = false
    if (this.el) this.follow = distanceFromBottom(this.el) <= pinThresholdPx
    this.syncToolbar()
  }

  private syncToolbar(): void {
    const el = this.el
    if (!el) return
    const toolbar = el.parentElement?.querySelector('.transcript-toolbar') ?? document.querySelector('.transcript-toolbar')
    if (!toolbar) return

    const scrollable = el.scrollHeight - el.clientHeight > 1
    toolbar.classList.toggle('at-top', !scrollable || el.scrollTop <= 1)
    toolbar.classList.toggle('at-bottom', !scrollable || distanceFromBottom(el) <= 1)
  }
}

export function installTranscriptToolbarScrollButtons(controller: TranscriptScrollController): () => void {
  const onClick = (e: MouseEvent): void => {
    const target = (e.target as Element | null)?.closest('[data-scroll-transcript]')
    if (!target) return
    switch (target.getAttribute('data-scroll-transcript')) {
      case 'bottom':
        controller.scrollToBottom()
        break
      case 'top':
        controller.scrollToTop()
        break
      case 'prev-user':
        controller.scrollToPreviousUserMessage()
        break
      case 'next-user':
        controller.scrollToNextUserMessage()
        break
    }
  }

  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
