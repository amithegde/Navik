import { createMemo, createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import type { ClaudeSession } from '@shared/session-types'
import { isLoading, pinnedSessions, projects, sessions } from '../state/sessions-store'
import { formatDateTime } from '../lib/relative-time'
import { refreshUsage } from '../state/usage-store'
import HomeSessionCard from './HomeSessionCard'
import HomeHistoryView from './HomeHistoryView'
import UsagePanel from './UsagePanel'

type HomeTab = 'pinned' | 'history'

function matchesFilter(s: ClaudeSession, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return true
  return `${s.title} ${s.sessionId} ${formatDateTime(s.lastActivityUtc)} ${s.projectPath} ${s.projectDisplayName}`
    .toLowerCase()
    .includes(t)
}

function HomeFilterBar(props: { value: string; onInput: (v: string) => void; placeholder: string }) {
  return (
    <div class="search-box home-filter-bar">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" />
        <path d="M14 14l-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      <input
        type="text"
        placeholder={props.placeholder}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </div>
  )
}

export default function HomeView() {
  // HomeView mounts/unmounts as the user navigates to/from home (it's the fallback of the
  // session Show in DetailPane), so this fires a refresh on every visit — not just the first.
  onMount(() => void refreshUsage())

  const [tab, setTab] = createSignal<HomeTab>('pinned')
  const [pinnedFilter, setPinnedFilter] = createSignal('')

  const runningCount = createMemo(() => sessions().filter((s) => s.running).length)
  const filteredPinned = createMemo(() => pinnedSessions().filter((s) => matchesFilter(s, pinnedFilter())))

  return (
    <div class="home-view">
      <div class="home-top-row">
        <UsagePanel />

        <Show when={sessions().length > 0}>
          <div class="home-stats">
            <div class="home-stat">
              <div class="home-stat-value">{sessions().length}</div>
              <div class="home-stat-label">Sessions</div>
            </div>
            <div class="home-stat">
              <div class="home-stat-value">
                <Show when={runningCount() > 0}>
                  <span class="live-pulse" />
                </Show>
                {runningCount()}
              </div>
              <div class="home-stat-label">Running</div>
            </div>
            <div class="home-stat">
              <div class="home-stat-value">{projects().length}</div>
              <div class="home-stat-label">Projects</div>
            </div>
          </div>
        </Show>
      </div>

      <Show
        when={sessions().length > 0}
        fallback={
          <div class="home-empty-hint">
            {isLoading() ? 'Scanning ~/.claude…' : 'No sessions found yet — start one from the + button above.'}
          </div>
        }
      >
        <div class="home-section">
          <div class="home-tabs">
            <button
              type="button"
              class="home-tab"
              classList={{ active: tab() === 'pinned' }}
              onClick={() => setTab('pinned')}
            >
              Pinned
            </button>
            <button
              type="button"
              class="home-tab"
              classList={{ active: tab() === 'history' }}
              onClick={() => setTab('history')}
            >
              History
            </button>
          </div>

          <div class="home-tab-body">
            <Switch>
              <Match when={tab() === 'pinned'}>
                <div class="home-pinned-body">
                  <Show
                    when={pinnedSessions().length > 0}
                    fallback={
                      <div class="home-section-hint">Pin a session with the star in its toolbar to keep it here.</div>
                    }
                  >
                    <HomeFilterBar
                      value={pinnedFilter()}
                      onInput={setPinnedFilter}
                      placeholder="Filter pinned…"
                    />
                    <Show
                      when={filteredPinned().length > 0}
                      fallback={<div class="home-table-empty">No pinned sessions match your filter.</div>}
                    >
                      <div class="home-card-grid">
                        <For each={filteredPinned()}>{(session) => <HomeSessionCard session={session} />}</For>
                      </div>
                    </Show>
                  </Show>
                </div>
              </Match>
              <Match when={tab() === 'history'}>
                <HomeHistoryView />
              </Match>
            </Switch>
          </div>
        </div>
      </Show>
    </div>
  )
}
