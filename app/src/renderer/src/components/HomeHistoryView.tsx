import { createMemo, createSignal } from 'solid-js'
import type { ClaudeSession } from '@shared/session-types'
import { sessions } from '../state/sessions-store'
import { formatDateTime } from '../lib/relative-time'
import HomeSessionTable from './HomeSessionTable'

/** Local-time YYYY-MM-DD for a Date — the format `<input type="date">` exchanges. */
function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Shift a YYYY-MM-DD string by `delta` days, preserving local time. */
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return toDateInput(d)
}

export default function HomeHistoryView() {
  const today = (): string => toDateInput(new Date())

  const [filter, setFilter] = createSignal('')
  const [selectedDate, setSelectedDate] = createSignal<string>(today())

  const isToday = createMemo(() => selectedDate() === today())

  const dayLabel = createMemo(() => {
    const d = selectedDate()
    if (d === today()) return 'Today'
    if (d === shiftDay(today(), -1)) return 'Yesterday'
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  })

  const fullDateLabel = createMemo(() =>
    new Date(`${selectedDate()}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  )

  const filtered = createMemo<ClaudeSession[]>(() => {
    const day = selectedDate()
    const startMs = new Date(`${day}T00:00:00`).getTime()
    const endMs = new Date(`${day}T23:59:59.999`).getTime()

    let list = sessions()
      .filter((s) => {
        const t = new Date(s.lastActivityUtc).getTime()
        return t >= startMs && t <= endMs
      })
      .sort((a, b) => b.lastActivityUtc.localeCompare(a.lastActivityUtc))

    const term = filter().trim().toLowerCase()
    if (term) {
      list = list.filter(
        (s) =>
          `${s.title} ${s.sessionId} ${formatDateTime(s.lastActivityUtc)} ${s.projectPath} ${s.projectDisplayName}`
            .toLowerCase()
            .includes(term)
      )
    }

    return list
  })

  const hasTextFilter = createMemo(() => filter().trim() !== '')
  const emptyHint = createMemo(() =>
    hasTextFilter() ? 'No sessions match your filter for this day.' : `No sessions on ${fullDateLabel()}.`
  )

  return (
    <div class="home-history">
      <div class="home-history-filters">
        <div class="search-box home-history-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" />
            <path d="M14 14l-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Filter by title, session id, project…"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
        </div>

        <div class="home-day-nav">
          <button
            type="button"
            class="home-day-step"
            title="Previous day"
            onClick={() => setSelectedDate((d) => shiftDay(d, -1))}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            class="home-day-today"
            classList={{ active: isToday() }}
            title="Jump to today"
            onClick={() => setSelectedDate(today())}
          >
            Today
          </button>

          <input
            class="home-date-input"
            type="date"
            value={selectedDate()}
            max={today()}
            onInput={(e) => setSelectedDate(e.currentTarget.value || today())}
          />

          <button
            type="button"
            class="home-day-step"
            title="Next day"
            disabled={isToday()}
            onClick={() => setSelectedDate((d) => shiftDay(d, 1))}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <span class="home-history-count">
          {filtered().length} · {dayLabel()}
        </span>
      </div>

      <HomeSessionTable sessions={filtered()} emptyHint={emptyHint()} />
    </div>
  )
}
