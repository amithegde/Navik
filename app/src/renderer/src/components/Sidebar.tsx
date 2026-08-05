import { createMemo, createSignal, For, Show } from 'solid-js'
import type { ClaudeSession } from '@shared/session-types'
import {
  filteredSessions,
  isLoading,
  projects,
  refreshSessions,
  searchText,
  selectedProjectFilter,
  selectedSessionId,
  selectSession,
  setProjectFilter,
  setSearchText
} from '../state/sessions-store'
import { startNewSessionInCurrentProject } from '../state/live-conversation-store'
import { openSettingsModal } from '../state/settings-store'
import { formatRelativeTime } from '../lib/relative-time'
import { ordinalIgnoreCaseCompare } from '@shared/text'

interface SessionGroup {
  label: string
  isLive: boolean
  items: ClaudeSession[]
}

function byTitle(a: ClaudeSession, b: ClaudeSession): number {
  return ordinalIgnoreCaseCompare(a.title, b.title)
}

// Sessions still land in these buckets (running / today / yesterday / older), but within each
// bucket they sort by title rather than last-activity — sorting by time made rows constantly
// swap places as any session so much as ticked, which made the list unusable to scan.
function buildGroups(sessions: ClaudeSession[]): SessionGroup[] {
  const running = sessions.filter((s) => s.running).sort(byTitle)
  const rest = sessions.filter((s) => !s.running)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const groups: SessionGroup[] = []
  if (running.length > 0) groups.push({ label: 'Running now', isLive: true, items: running })

  const dateOf = (s: ClaudeSession): Date => {
    const d = new Date(s.lastActivityUtc)
    d.setHours(0, 0, 0, 0)
    return d
  }

  const addDateGroup = (label: string, items: ClaudeSession[]): void => {
    if (items.length > 0) groups.push({ label, isLive: false, items: [...items].sort(byTitle) })
  }

  addDateGroup(
    'Today',
    rest.filter((s) => dateOf(s).getTime() === today.getTime())
  )
  addDateGroup(
    'Yesterday',
    rest.filter((s) => dateOf(s).getTime() === yesterday.getTime())
  )
  addDateGroup(
    'Older',
    rest.filter((s) => dateOf(s).getTime() < yesterday.getTime())
  )

  return groups
}

function projectInitial(name: string): string {
  return name.length > 0 ? name[0].toUpperCase() : '?'
}

export default function Sidebar() {
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(new Set())
  const groups = createMemo(() => buildGroups(filteredSessions()))

  const toggleGroup = (label: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (!next.delete(label)) next.add(label)
      return next
    })
  }

  return (
    <aside class="sidebar">
      <div class="sidebar-toolbar">
        <button
          class="icon-btn icon-btn-lg"
          classList={{ active: selectedSessionId() === null }}
          title="Home"
          onClick={() => selectSession(null)}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 7.5L8 2.5l6 5M3.5 6.5V13a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button class="icon-btn icon-btn-lg" classList={{ spinning: isLoading() }} title="Refresh" onClick={() => void refreshSessions()}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.65-3.93M13.5 2v3.5H10"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button class="icon-btn icon-btn-lg" title="New session (Ctrl+N)" onClick={startNewSessionInCurrentProject}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <button class="icon-btn icon-btn-lg" title="Settings" onClick={openSettingsModal}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.6" stroke="currentColor" stroke-width="1.4" />
            <path
              d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="search-wrap">
        <div class="search-box">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" />
            <path d="M14 14l-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
          <input
            class="search-input"
            type="text"
            placeholder="Search sessions…"
            value={searchText()}
            onInput={(e) => setSearchText(e.currentTarget.value)}
          />
          <Show when={searchText().length === 0}>
            <kbd class="search-shortcut-hint">Ctrl+K</kbd>
          </Show>
        </div>
      </div>

      <Show when={projects().length > 0}>
        <div class="project-rail">
          <For each={projects()}>
            {(project) => (
              <button
                class="project-chip"
                classList={{ active: selectedProjectFilter() === project.path }}
                title={project.path}
                onClick={() => setProjectFilter(project.path)}
              >
                <span class="chip-icon">{projectInitial(project.displayName)}</span>
                <span>{project.displayName}</span>
                <span class="chip-count">{project.sessionCount}</span>
                <Show when={project.runningCount > 0}>
                  <span class="run-dot" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>

      <div class="session-scroll">
        <Show when={groups().length === 0}>
          <div class="empty-list-hint">{isLoading() ? 'Scanning ~/.claude…' : 'No sessions match.'}</div>
        </Show>
        <For each={groups()}>
          {(group) => {
            const collapsed = (): boolean => collapsedGroups().has(group.label)
            return (
              <>
                <button type="button" class="session-group-label" onClick={() => toggleGroup(group.label)}>
                  <svg
                    class="group-chevron"
                    classList={{ collapsed: collapsed() }}
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    fill="none"
                  >
                    <path
                      d="M2.5 1.5l4 3.5-4 3.5"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <Show when={group.isLive}>
                    <span class="live-pulse" />
                  </Show>
                  <span>{group.label}</span>
                  <span class="group-rule" />
                  <span class="group-count">{group.items.length}</span>
                </button>
                <Show when={!collapsed()}>
                  <For each={group.items}>
                    {(session) => (
                      <div
                        class="session-item"
                        classList={{ selected: selectedSessionId() === session.sessionId }}
                        onClick={() => selectSession(session.sessionId)}
                      >
                        <span class="status-dot" classList={{ running: !!session.running }} />
                        <div class="session-text">
                          <div class="session-title">{session.title}</div>
                          <div class="session-meta">
                            <span class="project-name">{session.projectDisplayName}</span>
                            <span class="dot-sep" />
                            <span>{formatRelativeTime(session.lastActivityUtc)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </>
            )
          }}
        </For>
      </div>
    </aside>
  )
}
