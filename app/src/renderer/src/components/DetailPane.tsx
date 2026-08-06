import { createEffect, createSignal, For, onCleanup, onMount, Show, untrack } from 'solid-js'
import { isPinned, selectedSession, togglePinned, goBack, goHome, canGoBack } from '../state/sessions-store'
import { displayEntries, isLoadingTranscript, liveState } from '../state/live-conversation-store'
import { showToast } from '../state/toast-store'
import { formatRelativeTime } from '../lib/relative-time'
import { TranscriptScrollController, installTranscriptToolbarScrollButtons } from '../lib/transcript-scroll'
import { buildSearch, clearHighlights, getMatchElement, highlightMatches, setActiveMatch } from '../lib/transcript-search'
import {
  bumpScrollTick,
  caseSensitive,
  currentIndex,
  isSearchOpen,
  matchCount,
  openSearch,
  searchQuery,
  setMatchCount,
  setCurrentIndex,
  setRegexError,
  useRegex,
  scrollTick
} from '../state/search-store'
import TranscriptTurnView, { type TextViewerRequest } from './TranscriptTurnView'
import TranscriptSearchBar from './TranscriptSearchBar'
import Composer from './Composer'
import TextViewerModal from './TextViewerModal'
import ImageViewerModal from './ImageViewerModal'
import HomeView from './HomeView'
import EditorButton from './EditorButton'
import { imagePreview, setImagePreview } from '../state/composer-store'
import { isZenMode, toggleZenMode } from '../state/layout-store'

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
}

function copy(text: string, message: string): void {
  void navigator.clipboard.writeText(text).then(() => showToast(message))
}

const copyIconPath = 'M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1'

function CopyIconButton(props: { title: string; onClick: () => void }) {
  return (
    <button type="button" class="copy-icon-btn" title={props.title} onClick={props.onClick}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
        <path d={copyIconPath} stroke="currentColor" stroke-width="1.3" />
      </svg>
    </button>
  )
}

export default function DetailPane() {
  const [fullTextView, setFullTextView] = createSignal<TextViewerRequest | null>(null)
  let scrollRef: HTMLDivElement | undefined
  let boundScrollEl: HTMLDivElement | undefined
  let boundSessionId: string | undefined
  const scrollController = new TranscriptScrollController()

  onMount(() => {
    onCleanup(installTranscriptToolbarScrollButtons(scrollController))
    onCleanup(() => scrollController.unbind())
  })

  // `.transcript-scroll` is the same DOM element across a session-to-session switch (only
  // destroyed/recreated when leaving/re-entering the Show's truthy branch, i.e. via Home) — so
  // only (re)bind the controller's listeners when the element itself actually changed; every
  // other session switch just resets follow-mode without churning through unbind+rebind.
  //
  // `selectedSession()` is a memo over `sessions()`, which gets a freshly IPC-cloned array (new
  // object references throughout, even for untouched sessions) on every background poll tick —
  // so this effect reruns far more often than the selection actually changes. Gate the
  // session-switch reset on the sessionId itself, not on the effect merely rerunning, or reading
  // a still-selected session while some unrelated session's status changes in the background
  // snaps the scroll position back to the bottom out from under the user.
  createEffect(() => {
    const id = selectedSession()?.sessionId
    if (scrollRef && boundScrollEl !== scrollRef) {
      scrollController.bind(scrollRef)
      boundScrollEl = scrollRef
      boundSessionId = id
    } else if (id !== boundSessionId) {
      scrollController.notifySessionChanged()
      boundSessionId = id
    }
  })

  // Tracks `isLoadingTranscript` too: the transcript entries and the loading flag are set in
  // separate reactive cycles (post-await code isn't batched), so `displayEntries()` updates while
  // the `<For>` is still hidden behind the loading-spinner `<Show>`. Without tracking the flag,
  // the one `notifyContentChanged` that runs with the entries actually mounted never fires, and
  // the view stays parked at the top of the loading-spinner area when an existing session opens.
  createEffect(() => {
    displayEntries()
    liveState()?.isBusy
    isLoadingTranscript()
    scrollController.notifyContentChanged()
  })

  // ---- In-transcript find (Ctrl+F) ----
  // Three coordinated effects over `.transcript-scroll`:
  //  1. highlight: walks text nodes and wraps matches; updates matchCount/currentIndex. Re-runs on
  //     every content tick (streamed tokens included) so new output is matched; the active/scroll
  //     effects pick up the new marks without yanking the user back to match #0 every token.
  //  2. apply-active: toggles `.active` on the current mark — needs to re-run after every highlight
  //     pass because the marks are recreated each time.
  //  3. scroll-into-view: only on explicit navigation (next/prev/Enter/F3) or a query change,
  //     gated by `scrollTick`, so streamed content updates don't seize the scroll position.
  //
  // CRITICAL: every signal read must happen BEFORE the `if (!scrollEl) return` guard. `scrollRef`
  // is a plain `let` (not a signal), so the only way these effects wake up after the ref binds
  // (when a session opens and the transcript-scroll element mounts) is by already subscribing to
  // a content signal like displayEntries(). Returning before any signal read leaves the effect
  // with zero dependencies and it never runs again — which is why typing into the find box showed
  // no matches: the highlight pass never fired.
  let lastQueryKey = ''
  createEffect(() => {
    const open = isSearchOpen()
    const q = searchQuery()
    const re = useRegex()
    const cs = caseSensitive()
    // Subscribe to content signals so streaming/refresh-driven DOM changes re-trigger the walk —
    // AND so the effect re-runs after `scrollRef` binds on first session open.
    displayEntries()
    const live = liveState()
    live?.entries.length
    live?.isBusy
    isLoadingTranscript()

    const scrollEl = scrollRef
    if (!scrollEl) return

    if (!open) {
      clearHighlights(scrollEl)
      setMatchCount(0)
      setCurrentIndex(-1)
      setRegexError(null)
      lastQueryKey = ''
      return
    }

    const queryKey = `${q}\u0000${re}\u0000${cs}`
    const queryChanged = queryKey !== lastQueryKey
    lastQueryKey = queryKey

    let regex: RegExp
    try {
      const built = buildSearch(q, { useRegex: re, caseSensitive: cs })
      setRegexError(null)
      if (!built) {
        clearHighlights(scrollEl)
        setMatchCount(0)
        setCurrentIndex(-1)
        return
      }
      regex = built.regex
    } catch (err) {
      setRegexError(err instanceof Error ? err.message : String(err))
      clearHighlights(scrollEl)
      setMatchCount(0)
      setCurrentIndex(-1)
      return
    }

    clearHighlights(scrollEl)
    const count = highlightMatches(scrollEl, regex)
    setMatchCount(count)
    const prev = untrack(currentIndex)
    const nextIdx = count === 0 ? -1 : queryChanged ? 0 : Math.max(0, Math.min(prev, count - 1))
    setCurrentIndex(nextIdx)
    // Apply the active class inline — the dedicated apply-active effect below depends on
    // currentIndex/matchCount and won't re-fire on a content-stream tick that leaves both
    // unchanged, so without this the recreated marks would lose their highlight.
    setActiveMatch(scrollEl, nextIdx)
    if (queryChanged && count > 0) bumpScrollTick((t) => t + 1)
  })

  createEffect(() => {
    const i = currentIndex()
    const n = matchCount()
    const open = isSearchOpen()
    const scrollEl = scrollRef
    if (!scrollEl || !open || n === 0) return
    setActiveMatch(scrollEl, i)
  })

  createEffect(() => {
    scrollTick()
    const i = currentIndex()
    const scrollEl = scrollRef
    if (!scrollEl || i < 0) return
    const el = getMatchElement(scrollEl, i)
    if (!el) return
    scrollController.pauseFollow()
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })

  // Opens the find bar, or refocuses+reselects its input if already open — matches what Ctrl+F
  // does in find-shortcut.ts so the toolbar magnifier and the keyboard shortcut behave the same.
  // (openSearch() alone is a no-op when already open, since isSearchOpen() staying true neither
  // remounts TranscriptSearchBar nor re-fires its focus-on-mount.)
  function handleFindClick(): void {
    const existing = document.querySelector<HTMLInputElement>('.search-field')
    if (existing) {
      existing.focus()
      existing.select()
    } else {
      openSearch()
    }
  }

  async function handleOpenInTerminal(): Promise<void> {
    const session = selectedSession()
    if (!session) return
    const wasRunningElsewhere = !!session.running
    const outcome = await window.navik.sessions.openInTerminal(session.sessionId, session.projectPath)
    if (!outcome.success) {
      showToast(outcome.error ?? 'Failed to launch.', true)
      return
    }
    showToast(wasRunningElsewhere ? "Opened in terminal — don't send messages from the other window now." : 'Opened in terminal…')
  }

  return (
    <div class="detail-pane">
      <Show when={selectedSession()} fallback={<HomeView />}>
        {(session) => {
          const live = liveState
          const activePid = (): number | null => {
            const l = live()
            if (l && !l.hasExited) return l.processId
            return session().running?.pid ?? null
          }
          const turnCount = (): number | null => displayEntries()?.length ?? null

          return (
            <>
              <div class="detail-header">
                <div class="detail-title-block">
                  <h2 class="detail-title">{session().title}</h2>
                  <div class="detail-breadcrumb">
                    <Show when={live() && !live()!.hasExited}>
                      <span class="badge running" title={live()!.isBusy ? 'Claude is actively working' : 'Live session, idle and ready for input'}>
                        <span class="dot" />
                        {live()!.isBusy ? 'working' : 'live'}
                      </span>
                    </Show>
                    <Show when={!(live() && !live()!.hasExited) && session().running}>
                      <span
                        class="badge running"
                        title="Running outside this app — sending a message here attaches to it. Leave that other window idle afterwards; both writing to the same session at once will corrupt its transcript."
                      >
                        <span class="dot" />
                        {session().running?.status ?? 'running'}
                      </span>
                    </Show>
                    <Show when={activePid() !== null}>
                      <span class="pid-badge" title="Process id of the claude.exe running this session">
                        <code>pid {activePid()}</code>
                        <CopyIconButton title="Copy pid" onClick={() => copy(String(activePid()), 'Pid copied.')} />
                      </span>
                    </Show>
                    <span class="badge" title="Project">
                      {session().projectDisplayName}
                    </span>
                    <Show when={session().gitBranch}>
                      <span class="badge" title="Git branch">
                        {session().gitBranch}
                      </span>
                    </Show>
                    <Show
                      when={!live() || live()!.hasKnownSessionId || live()!.resolvedSessionId !== null}
                      fallback={
                        <span class="badge" title="Claude hasn't assigned a session ID yet — send the first message to get one">
                          id pending…
                        </span>
                      }
                    >
                      <span class="session-id-badge" title={`Session ID (used to resume this session): ${session().sessionId}`}>
                        <code>{session().sessionId}</code>
                        <CopyIconButton title="Copy session ID" onClick={() => copy(session().sessionId, 'Session ID copied.')} />
                      </span>
                    </Show>
                    <span class="badge" title={`Last activity: ${formatLongDate(session().lastActivityUtc)}`}>
                      {formatRelativeTime(session().lastActivityUtc)}
                    </span>
                    <Show when={turnCount() !== null}>
                      <span class="badge" title="Turns in this session (user + assistant)">
                        {turnCount()} turn{turnCount() === 1 ? '' : 's'}
                      </span>
                    </Show>
                    <Show when={(live()?.totalCostUsd ?? 0) > 0}>
                      <span class="badge" title="Cumulative cost this session">
                        ${live()!.totalCostUsd.toFixed(4)}
                      </span>
                    </Show>
                    <Show when={session().running?.entrypoint}>
                      <span class="badge" title="Launched from">
                        {session().running?.entrypoint}
                      </span>
                    </Show>
                    <Show when={session().running?.startedAtUtc}>
                      <span class="badge" title={`Started: ${formatLongDate(session().running!.startedAtUtc!)}`}>
                        started {formatRelativeTime(session().running!.startedAtUtc!)}
                      </span>
                    </Show>
                  </div>
                </div>
              </div>

              <div class="transcript-toolbar">
                <button
                  type="button"
                  class="transcript-tool-btn"
                  title="Go back (previous page)"
                  disabled={!canGoBack()}
                  onClick={goBack}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M10 3L4 8l6 5"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="transcript-tool-btn"
                  title="Home"
                  onClick={goHome}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 7.5L8 2.5l6 5M3.5 6.5V13a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <div class="transcript-toolbar-spacer" />
                <div class="toolbar-session-actions">
                  <button
                    type="button"
                    class="transcript-tool-btn pin-btn"
                    classList={{ active: isPinned(session().sessionId) }}
                    title={isPinned(session().sessionId) ? 'Unpin from Home' : 'Pin to Home'}
                    onClick={() => void togglePinned(session().sessionId)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill={isPinned(session().sessionId) ? 'currentColor' : 'none'}>
                      <path
                        d="M8 1.5l1.85 3.9 4.15.6-3 3 .7 4.3L8 11.3l-3.7 2 .7-4.3-3-3 4.15-.6L8 1.5z"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <Show when={!live() || live()!.hasKnownSessionId || live()!.resolvedSessionId !== null}>
                    <button
                      type="button"
                      class="transcript-tool-btn"
                      title="Open this session in an external terminal instead"
                      onClick={() => void handleOpenInTerminal()}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                        <path
                          d="M4 6.5l2.5 2-2.5 2M8 10.5h3.5"
                          stroke="currentColor"
                          stroke-width="1.3"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                  </Show>
                  <EditorButton folderPath={session().projectPath} />
                </div>
                <button
                  type="button"
                  class="transcript-tool-btn"
                  classList={{ active: isSearchOpen() }}
                  title="Find in transcript (Ctrl+F)"
                  onClick={handleFindClick}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" />
                    <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
                <button class="transcript-tool-btn" data-scroll-transcript="top" title="Scroll to the start of the conversation">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2.5 2.5h11M8 13V5.5M8 5.5L4.75 8.75M8 5.5l3.25 3.25"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <button class="transcript-tool-btn" data-scroll-transcript="prev-user" title="Scroll to the previous message you sent">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M8 13V4M8 4L4 8M8 4l4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <button class="transcript-tool-btn" data-scroll-transcript="next-user" title="Scroll to the next message you sent">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v9M8 12l-4-4M8 12l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <button class="transcript-tool-btn" data-scroll-transcript="bottom" title="Scroll to the latest output">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2.5 13.5h11M8 3v7.5M8 10.5l3.25-3.25M8 10.5L4.75 7.25"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="transcript-tool-btn zen-toggle-btn"
                  classList={{ active: isZenMode() }}
                  title={isZenMode() ? 'Reset — exit zen mode' : 'Maximize — enter zen mode and hide the sidebar'}
                  onClick={toggleZenMode}
                >
                  <Show
                    when={!isZenMode()}
                    fallback={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M6 2.5V6H2.5M10 6h3.5V2.5M13.5 10H10v3.5M2.5 10v3.5H6"
                          stroke="currentColor"
                          stroke-width="1.3"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    }
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </Show>
                </button>
              </div>

              <div class="transcript-area">
                <Show when={isSearchOpen()}>
                  <TranscriptSearchBar />
                </Show>
                <div class="transcript-scroll" data-session={session().sessionId} ref={scrollRef}>
                <Show
                  when={live()}
                  fallback={
                    <Show
                      when={!isLoadingTranscript()}
                      fallback={
                        <div class="transcript-loading">
                          <svg class="transcript-loading-spinner" width="20" height="20" viewBox="0 0 16 16" fill="none">
                            <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                          </svg>
                          Loading transcript…
                        </div>
                      }
                    >
                      <Show
                        when={(displayEntries()?.length ?? 0) > 0}
                        fallback={
                          <Show when={displayEntries() !== null}>
                            <div class="transcript-empty">No conversation content in this session yet.</div>
                          </Show>
                        }
                      >
                        <For each={displayEntries()!}>
                          {(entry, i) => (
                            <TranscriptTurnView entry={entry} isLast={i() === displayEntries()!.length - 1} onExpandText={setFullTextView} onCopyText={(text) => copy(text, 'Response copied.')} />
                          )}
                        </For>
                      </Show>
                    </Show>
                  }
                >
                  {(live) => (
                    <>
                      <For each={live().entries}>
                        {(entry, i) => (
                          <TranscriptTurnView entry={entry} isLast={i() === live().entries.length - 1 && !live().isBusy} onExpandText={setFullTextView} onCopyText={(text) => copy(text, 'Response copied.')} />
                        )}
                      </For>
                      <Show when={live().isBusy}>
                        <div class="thinking-indicator">
                          <span class="think-dot" />
                          <span class="think-dot" />
                          <span class="think-dot" />
                          Claude is working…
                        </div>
                      </Show>
                      <Show when={live().errorMessage}>
                        <div class="turn-error">{live().errorMessage}</div>
                      </Show>
                      <Show when={live().hasExited}>
                        <div class="session-ended-banner">
                          <span>This session ended. Send a message below to pick it back up.</span>
                        </div>
                      </Show>
                    </>
                  )}
                </Show>
                </div>
              </div>

              <Composer />
            </>
          )
        }}
      </Show>

      <TextViewerModal view={fullTextView()} onClose={() => setFullTextView(null)} onCopy={(text) => copy(text, 'Copied.')} />
      <ImageViewerModal image={imagePreview()} onClose={() => setImagePreview(null)} />
    </div>
  )
}
