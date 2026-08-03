import { createMemo, For, Show } from 'solid-js'
import { isLoading, pinnedSessions, projects, sessions } from '../state/sessions-store'
import HomeSessionCard from './HomeSessionCard'

export default function HomeView() {
  const runningCount = createMemo(() => sessions().filter((s) => s.running).length)
  const recent = createMemo(() =>
    [...sessions()].sort((a, b) => b.lastActivityUtc.localeCompare(a.lastActivityUtc)).slice(0, 6)
  )

  return (
    <div class="home-view">
      <div class="home-hero">
        <div class="home-hero-mark">N</div>
        <div class="home-hero-text">
          <h1 class="home-hero-title">Welcome to Navik</h1>
          <p class="home-hero-sub">Your Claude Code sessions, at a glance.</p>
        </div>
      </div>

      <Show
        when={sessions().length > 0}
        fallback={
          <div class="home-empty-hint">
            {isLoading() ? 'Scanning ~/.claude…' : 'No sessions found yet — start one from the + button above.'}
          </div>
        }
      >
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
            <div class="home-stat-label">Running now</div>
          </div>
          <div class="home-stat">
            <div class="home-stat-value">{projects().length}</div>
            <div class="home-stat-label">Projects</div>
          </div>
        </div>

        <div class="home-section">
          <div class="home-section-title">Pinned</div>
          <Show
            when={pinnedSessions().length > 0}
            fallback={<div class="home-section-hint">Pin a session with the star in its toolbar to keep it here.</div>}
          >
            <div class="home-card-grid">
              <For each={pinnedSessions()}>{(session) => <HomeSessionCard session={session} />}</For>
            </div>
          </Show>
        </div>

        <Show when={recent().length > 0}>
          <div class="home-section">
            <div class="home-section-title">Recent</div>
            <div class="home-card-grid">
              <For each={recent()}>{(session) => <HomeSessionCard session={session} />}</For>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
