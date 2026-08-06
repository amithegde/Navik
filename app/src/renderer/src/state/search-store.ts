import { createSignal } from 'solid-js'

// In-transcript find (Ctrl+F) state. The store holds input state (query + option toggles) and
// output state derived from the DOM walk performed by DetailPane (match count + current index);
// DetailPane owns the DOM because it has the only handle on `.transcript-scroll`. The search bar
// UI reads these signals without touching the DOM directly.
//
// `scrollTick` is the bridge for "scroll the active match into view": it bumps on every
// user-initiated navigation (next/prev, Enter, F3) AND once when a new query's first results land.
// DetailPane's scroll effect depends on it, reads `currentIndex()`, and scrolls — so streaming
// content updates (which re-highlight but don't bump the tick) don't yank the user back to the
// first match on every token.

export const [isSearchOpen, setIsSearchOpen] = createSignal(false)
export const [searchQuery, setSearchQuery] = createSignal('')
export const [useRegex, setUseRegex] = createSignal(false)
export const [caseSensitive, setCaseSensitive] = createSignal(false)
export const [regexError, setRegexError] = createSignal<string | null>(null)

// Filled in by DetailPane's highlight effect.
export const [matchCount, setMatchCount] = createSignal(0)
export const [currentIndex, setCurrentIndex] = createSignal(-1)

const [scrollTick, bumpScrollTick] = createSignal(0)
export { scrollTick, bumpScrollTick }

export function openSearch(): void {
  setIsSearchOpen(true)
}

export function closeSearch(): void {
  setIsSearchOpen(false)
}

export function toggleRegex(): void {
  setUseRegex((v) => !v)
}

export function toggleCase(): void {
  setCaseSensitive((v) => !v)
}

/** Move active index forward/backward with wrap-around. No-op when there are no matches. */
export function stepNext(): void {
  const n = matchCount()
  if (n <= 0) return
  setCurrentIndex((i) => (i + 1) % n)
  bumpScrollTick((t) => t + 1)
}

export function stepPrev(): void {
  const n = matchCount()
  if (n <= 0) return
  setCurrentIndex((i) => (i - 1 + n) % n)
  bumpScrollTick((t) => t + 1)
}
