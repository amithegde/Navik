import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { isPinned, selectedSession, togglePinned } from '../state/sessions-store'
import { displayEntries, isLoadingTranscript, liveState } from '../state/live-conversation-store'
import { showToast } from '../state/toast-store'
import { formatRelativeTime } from '../lib/relative-time'
import { TranscriptScrollController, installTranscriptToolbarScrollButtons } from '../lib/transcript-scroll'
import TranscriptTurnView, { type TextViewerRequest } from './TranscriptTurnView'
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

  createEffect(() => {
    displayEntries()
    liveState()?.isBusy
    scrollController.notifyContentChanged()
  })

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
