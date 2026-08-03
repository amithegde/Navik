import { createMemo, createSignal } from 'solid-js'
import type { ClaudeSession, ClaudeProject, SessionsSnapshot } from '@shared/session-types'

const [sessions, setSessions] = createSignal<ClaudeSession[]>([])
const [projects, setProjects] = createSignal<ClaudeProject[]>([])
const [pinnedIds, setPinnedIds] = createSignal<Set<string>>(new Set())
const [isLoading, setIsLoading] = createSignal(false)
const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
const [searchText, setSearchText] = createSignal('')
const [selectedProjectFilter, setSelectedProjectFilter] = createSignal<string | null>(null)

function applySnapshot(snapshot: SessionsSnapshot): void {
  setSessions(snapshot.sessions)
  setProjects(snapshot.projects)
  setPinnedIds(new Set(snapshot.pinnedSessionIds))
}

/** Subscribes to main-process push updates (background poll, pin changes, and a live session's
 * placeholder-id-to-real-id swap, which keeps the detail pane pointed at the same conversation
 * across the swap). Returns an unsubscribe. */
export function initSessionsStore(): () => void {
  const unsubscribeChanged = window.navik.sessions.onChanged(applySnapshot)
  const unsubscribeSwapped = window.navik.live.onRowSwapped(({ previousKey, key }) => {
    if (selectedSessionId()?.toLowerCase() === previousKey.toLowerCase()) setSelectedSessionId(key)
  })
  return () => {
    unsubscribeChanged()
    unsubscribeSwapped()
  }
}

export async function refreshSessions(): Promise<void> {
  setIsLoading(true)
  try {
    applySnapshot(await window.navik.sessions.refresh())
  } finally {
    setIsLoading(false)
  }
}

export function selectSession(sessionId: string | null): void {
  setSelectedSessionId(sessionId)
}

export function isPinned(sessionId: string): boolean {
  return pinnedIds().has(sessionId.toLowerCase())
}

export async function togglePinned(sessionId: string): Promise<void> {
  const key = sessionId.toLowerCase()
  const optimistic = new Set(pinnedIds())
  if (!optimistic.delete(key)) optimistic.add(key)
  setPinnedIds(optimistic)

  setPinnedIds(new Set(await window.navik.sessions.togglePinned(sessionId)))
}

export function setProjectFilter(path: string | null): void {
  setSelectedProjectFilter((current) =>
    current !== null && path !== null && current.toLowerCase() === path.toLowerCase() ? null : path
  )
}

export const filteredSessions = createMemo<ClaudeSession[]>(() => {
  let list = sessions()

  const filter = selectedProjectFilter()
  if (filter) {
    const lowerFilter = filter.toLowerCase()
    list = list.filter((s) => s.projectPath.toLowerCase() === lowerFilter)
  }

  const term = searchText().trim().toLowerCase()
  if (term) {
    list = list.filter(
      (s) => s.title.toLowerCase().includes(term) || s.projectDisplayName.toLowerCase().includes(term)
    )
  }

  return list
})

export const pinnedSessions = createMemo<ClaudeSession[]>(() =>
  sessions()
    .filter((s) => isPinned(s.sessionId))
    .sort((a, b) => b.lastActivityUtc.localeCompare(a.lastActivityUtc))
)

export const selectedSession = createMemo<ClaudeSession | null>(
  () => sessions().find((s) => s.sessionId === selectedSessionId()) ?? null
)

export { sessions, projects, isLoading, selectedSessionId, searchText, setSearchText, selectedProjectFilter }
