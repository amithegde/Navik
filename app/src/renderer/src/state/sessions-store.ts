import { createMemo, createSignal } from 'solid-js'
import type { ClaudeSession, ClaudeProject, SessionsSnapshot } from '@shared/session-types'

const [sessions, setSessions] = createSignal<ClaudeSession[]>([])
const [projects, setProjects] = createSignal<ClaudeProject[]>([])
const [pinnedIds, setPinnedIds] = createSignal<Set<string>>(new Set())
const [isLoading, setIsLoading] = createSignal(false)
const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
const [searchText, setSearchText] = createSignal('')
const [selectedProjectFilter, setSelectedProjectFilter] = createSignal<string | null>(null)

// Back-history for the toolbar's Back button. Each entry is either a session id or `null` (Home).
// `selectSession` pushes; `goBack`/`goHome` traverse. The current page always lives at
// `history[historyIndex]`. The cap keeps the stack bounded — older entries drop off the bottom.
const MAX_NAV_HISTORY = 10
const [history, setHistory] = createSignal<(string | null)[]>([null])
const [historyIndex, setHistoryIndex] = createSignal(0)

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
    // Rewrite any placeholder occurrences in the back-history too, otherwise pressing Back would
    // navigate to a dead id that no longer resolves to a session row.
    setHistory((h) =>
      h.some((entry) => entry?.toLowerCase() === previousKey.toLowerCase())
        ? h.map((entry) => (entry?.toLowerCase() === previousKey.toLowerCase() ? key : entry))
        : h
    )
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

/** Navigate to a session (or Home when `null`). Pushes the destination onto the back-history and
 * drops any forward history, mirroring a browser's address-bar navigation. A no-op push when the
 * destination is already the current page. */
export function selectSession(sessionId: string | null): void {
  if (history()[historyIndex()] === sessionId) {
    setSelectedSessionId(sessionId)
    return
  }
  const trimmed = history().slice(0, historyIndex() + 1)
  trimmed.push(sessionId)
  while (trimmed.length > MAX_NAV_HISTORY) trimmed.shift()
  setHistory(trimmed)
  setHistoryIndex(trimmed.length - 1)
  setSelectedSessionId(sessionId)
}

/** Step one entry back in the history. No-op when already at the earliest page. */
export function goBack(): void {
  if (!canGoBack()) return
  const newIdx = historyIndex() - 1
  setHistoryIndex(newIdx)
  setSelectedSessionId(history()[newIdx])
}

/** Step one entry forward in the history (the entries a Back traversal left behind). No-op when
 *  already at the most recent page. */
export function goForward(): void {
  if (!canGoForward()) return
  const newIdx = historyIndex() + 1
  setHistoryIndex(newIdx)
  setSelectedSessionId(history()[newIdx])
}

/** Jump straight to Home. Pushed as a new entry so Back still returns to where the user was. */
export function goHome(): void {
  selectSession(null)
}

export function canGoBack(): boolean {
  return historyIndex() > 0
}

export function canGoForward(): boolean {
  return historyIndex() < history().length - 1
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
