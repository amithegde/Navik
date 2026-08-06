import { onMount, Show } from 'solid-js'
import {
  caseSensitive,
  closeSearch,
  currentIndex,
  matchCount,
  regexError,
  searchQuery,
  setSearchQuery,
  stepNext,
  stepPrev,
  toggleCase,
  toggleRegex,
  useRegex
} from '../state/search-store'

// VS Code-style floating find bar anchored to the top-right of the transcript area. Reads
// state from the search store and dispatches query/option changes back to it; the actual DOM
// highlighting and scroll-into-view are wired in DetailPane (which owns `.transcript-scroll`).
//
// Keyboard: Enter / F3 = next, Shift+Enter / Shift+F3 = prev, Esc = close. The capture-phase
// Ctrl+F handler in find-shortcut.ts also re-focuses the box when pressed while already open.

export default function TranscriptSearchBar() {
  let inputRef: HTMLInputElement | undefined

  // Focus the box each time it mounts (i.e. each time the search is opened via Ctrl+F or the
  // toolbar button) and pre-select any prior query so a fresh type replaces it.
  onMount(() => {
    inputRef?.focus()
    inputRef?.select()
  })

  const countLabel = (): string => {
    const n = matchCount()
    const i = currentIndex()
    if (n === 0) return 'No results'
    return `${i + 1} of ${n}`
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeSearch()
      return
    }
    // Only step from the input's own keypresses. A focused `<button>`'s default activation
    // synthesises a click on Enter/Space, which already fires its onClick (step/toggle/close) —
    // handling Enter here too would double-dispatch (Enter on the "Next" button advances two
    // matches; Enter on "Aa" both toggles case AND steps). F3 is handled globally by
    // find-shortcut.ts (capture-phase, stopPropagation), so it isn't reachable here either.
    if (e.target !== inputRef) return
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) stepPrev()
      else stepNext()
    }
  }

  return (
    <div class="transcript-search-bar" role="search" onKeyDown={onKeyDown}>
      <button
        type="button"
        class="search-opt-btn"
        title="Match case"
        classList={{ active: caseSensitive() }}
        onClick={toggleCase}
        aria-pressed={caseSensitive()}
      >
        <span class="search-opt-glyph">Aa</span>
      </button>
      <button
        type="button"
        class="search-opt-btn"
        title="Use regular expression"
        classList={{ active: useRegex() }}
        onClick={toggleRegex}
        aria-pressed={useRegex()}
      >
        <span class="search-opt-glyph">.*</span>
      </button>
      <div class="search-input-wrap" classList={{ error: !!regexError() }}>
        <input
          ref={inputRef}
          type="text"
          class="search-field"
          placeholder={useRegex() ? 'Find (regex)…' : 'Find…'}
          value={searchQuery()}
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
        />
        <Show when={regexError()}>
          <span class="search-error-dot" title={regexError()!}>!</span>
        </Show>
      </div>
      <span class="search-count" classList={{ muted: matchCount() === 0, hidden: !!regexError() }}>
        {countLabel()}
      </span>
      <div class="search-step-group">
        <button
          type="button"
          class="search-step-btn"
          title="Previous (Shift+Enter)"
          disabled={matchCount() === 0}
          onClick={stepPrev}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 12V4M8 4L4 8M8 4l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          class="search-step-btn"
          title="Next (Enter)"
          disabled={matchCount() === 0}
          onClick={stepNext}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 4v8M8 12L4 8M8 12l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <button type="button" class="search-close-btn" title="Close (Esc)" onClick={closeSearch}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  )
}
