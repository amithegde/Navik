import { createEffect, For, Show } from 'solid-js'
import { selectedSession } from '../state/sessions-store'
import { liveState } from '../state/live-conversation-store'
import { showToast } from '../state/toast-store'
import { formatRelativeTime } from '../lib/relative-time'
import type { ClaudeSession, RunningProcessInfo } from '@shared/session-types'
import type { LiveConversationState } from '@shared/live-session-types'

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })
}

function copy(text: string, message: string): void {
  void navigator.clipboard.writeText(text).then(() => showToast(message))
}

function CopyButton(props: { title: string; onClick: () => void }) {
  return (
    <button type="button" class="detail-copy-btn" title={props.title} onClick={props.onClick}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
        <path
          d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1"
          stroke="currentColor"
          stroke-width="1.3"
        />
      </svg>
    </button>
  )
}

type StatusKind = 'live-working' | 'live-idle' | 'running-elsewhere' | 'idle'

function deriveStatus(session: ClaudeSession, live: LiveConversationState | null): StatusKind {
  if (live && !live.hasExited) return live.isBusy ? 'live-working' : 'live-idle'
  if (session.running) return 'running-elsewhere'
  return 'idle'
}

interface Row {
  label: string
  value: string
  copyText?: string
  title?: string
  mono?: boolean
}

function buildRows(session: ClaudeSession, live: LiveConversationState | null): Row[] {
  const rows: Row[] = []
  const running: RunningProcessInfo | undefined = session.running
  const idPending = live !== null && !live.hasKnownSessionId && live.resolvedSessionId === null

  if (idPending) {
    rows.push({
      label: 'Session ID',
      value: 'pending…',
      title: "Claude hasn't assigned a session ID yet — send the first message to get one"
    })
  } else {
    rows.push({
      label: 'Session ID',
      value: session.sessionId,
      copyText: session.sessionId,
      title: `Used to resume this session: ${session.sessionId}`,
      mono: true
    })
  }

  rows.push({ label: 'Project', value: session.projectDisplayName, copyText: session.projectDisplayName, title: session.projectPath })
  if (session.projectPath) {
    rows.push({ label: 'Path', value: session.projectPath, copyText: session.projectPath, mono: true })
  }
  if (session.gitBranch) rows.push({ label: 'Branch', value: session.gitBranch, copyText: session.gitBranch })

  if (live) {
    if (live.workingDirectory && live.workingDirectory !== session.projectPath) {
      rows.push({ label: 'Working dir', value: live.workingDirectory, copyText: live.workingDirectory, mono: true })
    }
    if (live.model) rows.push({ label: 'Model', value: live.model })
    rows.push({ label: 'Effort', value: live.effort ? live.effort : 'Auto' })
    if (live.permissionMode) rows.push({ label: 'Permission', value: live.permissionMode })
  }

  if (live && !live.hasExited && live.processId) {
    rows.push({ label: 'claude.exe PID', value: String(live.processId), copyText: String(live.processId), mono: true })
  } else if (running?.pid) {
    rows.push({ label: 'claude.exe PID', value: String(running.pid), copyText: String(running.pid), mono: true })
  }

  rows.push({
    label: 'Last activity',
    value: formatRelativeTime(session.lastActivityUtc),
    title: formatLongDate(session.lastActivityUtc)
  })
  if (running?.startedAtUtc) {
    rows.push({
      label: 'Started',
      value: formatRelativeTime(running.startedAtUtc),
      title: formatLongDate(running.startedAtUtc)
    })
  }
  if (running?.entrypoint) rows.push({ label: 'Entrypoint', value: running.entrypoint })
  if (live && live.totalCostUsd > 0) {
    rows.push({ label: 'Cost', value: `$${live.totalCostUsd.toFixed(4)}` })
  }

  return rows
}

export default function SessionDetailsModal(props: { isOpen: boolean; onClose: () => void }) {
  let frameRef: HTMLDivElement | undefined

  createEffect(() => {
    if (props.isOpen) frameRef?.focus()
  })

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') props.onClose()
  }

  return (
    <Show when={props.isOpen}>
      <div class="shortcuts-overlay" onClick={() => props.onClose()} />
      <div class="shortcuts-modal session-details-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
        <div class="shortcuts-head">
          <span class="shortcuts-title">Session details</span>
          <button type="button" class="icon-btn" title="Close (Esc)" onClick={() => props.onClose()}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="shortcuts-body">
          <Show when={selectedSession()}>
            {(session) => {
              const live = liveState
              const status = (): StatusKind => deriveStatus(session(), live())
              const rows = (): Row[] => buildRows(session(), live())

              return (
                <>
                  <Show when={status() !== 'idle'}>
                    <div
                      class="session-status-banner"
                      classList={{
                        running: status() === 'live-working' || status() === 'live-idle',
                        warn: status() === 'running-elsewhere'
                      }}
                    >
                      <Show when={status() === 'live-working'}>
                        <span class="dot" /> Claude is actively working
                      </Show>
                      <Show when={status() === 'live-idle'}>
                        <span class="dot" /> Live — idle and ready for input
                      </Show>
                      <Show when={status() === 'running-elsewhere'}>
                        Running outside this app — sending a message here attaches to it. Leave that other
                        window idle afterwards; both writing to the same session at once will corrupt its
                        transcript.
                      </Show>
                    </div>
                  </Show>

                  <div class="session-details-rows">
                    <For each={rows()}>
                      {(row) => (
                        <div class="session-detail-row">
                          <span class="session-detail-label">{row.label}</span>
                          <span class="session-detail-value" classList={{ mono: !!row.mono }} title={row.title}>
                            {row.value}
                          </span>
                          <Show when={row.copyText}>
                            <CopyButton
                              title={`Copy ${row.label.toLowerCase()}`}
                              onClick={() => copy(row.copyText!, `${row.label} copied.`)}
                            />
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </>
              )
            }}
          </Show>
        </div>
      </div>
    </Show>
  )
}
