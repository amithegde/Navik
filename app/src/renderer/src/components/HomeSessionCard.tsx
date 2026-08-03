import type { ClaudeSession } from '@shared/session-types'
import { isPinned, selectSession, togglePinned } from '../state/sessions-store'
import { formatRelativeTime } from '../lib/relative-time'

export default function HomeSessionCard(props: { session: ClaudeSession }) {
  const pinned = (): boolean => isPinned(props.session.sessionId)

  return (
    <div class="home-session-card" onClick={() => selectSession(props.session.sessionId)}>
      <div class="home-session-card-top">
        <span class="status-dot" classList={{ running: !!props.session.running }} />
        <span class="home-session-card-title">{props.session.title}</span>
        <button
          type="button"
          class="home-session-pin"
          classList={{ active: pinned() }}
          title={pinned() ? 'Unpin from Home' : 'Pin to Home'}
          onClick={(e) => {
            e.stopPropagation()
            void togglePinned(props.session.sessionId)
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill={pinned() ? 'currentColor' : 'none'}>
            <path
              d="M8 1.5l1.85 3.9 4.15.6-3 3 .7 4.3L8 11.3l-3.7 2 .7-4.3-3-3 4.15-.6L8 1.5z"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
      <div class="home-session-card-meta">
        <span class="project-name">{props.session.projectDisplayName}</span>
        <span class="dot-sep" />
        <span>{formatRelativeTime(props.session.lastActivityUtc)}</span>
      </div>
    </div>
  )
}
