import type { ClaudeSession } from '@shared/session-types'

export default function DetailPanePlaceholder(props: { session: ClaudeSession }) {
  return (
    <div class="detail-pane">
      <div class="detail-header">
        <div class="detail-title-block">
          <h2 class="detail-title">{props.session.title}</h2>
          <div class="detail-breadcrumb">
            <span class="mono-path">{props.session.projectPath}</span>
            <span class="session-id-badge">
              <code>{props.session.sessionId}</code>
            </span>
          </div>
        </div>
      </div>
      <div class="transcript-empty">Transcript viewer and composer land in a later phase.</div>
    </div>
  )
}
