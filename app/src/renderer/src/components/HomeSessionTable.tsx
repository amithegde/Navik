import { For, Show } from 'solid-js'
import type { ClaudeSession } from '@shared/session-types'
import { selectSession } from '../state/sessions-store'
import { showToast } from '../state/toast-store'
import { formatDateTime } from '../lib/relative-time'
import { applyTitleIfTruncated } from '../lib/truncated-title'
import EditorButton from './EditorButton'

function copy(text: string, message: string): void {
  void navigator.clipboard.writeText(text).then(() => showToast(message))
}

export default function HomeSessionTable(props: { sessions: ClaudeSession[]; emptyHint?: string }) {
  return (
    <Show
      when={props.sessions.length > 0}
      fallback={<div class="home-table-empty">{props.emptyHint ?? 'No sessions.'}</div>}
    >
      <div class="home-table-wrap">
        <table class="home-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Session ID</th>
              <th>Date</th>
              <th>Project path</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.sessions}>
              {(session) => (
                <tr onClick={() => selectSession(session.sessionId)}>
                  <td>
                    <div class="home-table-title">
                      <span class="status-dot" classList={{ running: !!session.running }} />
                      <span onMouseEnter={(e) => applyTitleIfTruncated(e.currentTarget, session.title)}>
                        {session.title}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div class="home-table-cell-row">
                      <span class="home-table-mono" title={session.sessionId}>
                        {session.sessionId}
                      </span>
                      <button
                        type="button"
                        class="home-table-copy"
                        title="Copy session id"
                        onClick={(e) => {
                          e.stopPropagation()
                          copy(session.sessionId, 'Session ID copied.')
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                          <path
                            d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1"
                            stroke="currentColor"
                            stroke-width="1.3"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td class="home-table-date">{formatDateTime(session.lastActivityUtc)}</td>
                  <td>
                    <div class="home-table-cell-row">
                      <span class="home-table-path" title={session.projectPath}>
                        {session.projectPath}
                      </span>
                      <button
                        type="button"
                        class="home-table-copy"
                        title="Copy project path"
                        onClick={(e) => {
                          e.stopPropagation()
                          copy(session.projectPath, 'Project path copied.')
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                          <path
                            d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1"
                            stroke="currentColor"
                            stroke-width="1.3"
                          />
                        </svg>
                      </button>
                      <span class="home-table-editor" onClick={(e) => e.stopPropagation()}>
                        <EditorButton folderPath={session.projectPath} />
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}
