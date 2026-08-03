import { onCleanup, onMount } from 'solid-js'
import ThemePicker from './ThemePicker'
import { isLoading, refreshSessions, selectedSessionId, selectSession } from '../state/sessions-store'

export default function TitleBar(props: { onStartNewSession: () => void; onOpenShortcuts: () => void }) {
  onMount(() => {
    const unsubscribe = window.navik.windowControls.onMaximizedChange((value) => {
      document.body.classList.toggle('window-maximized', value)
    })
    onCleanup(unsubscribe)
  })

  const onDragDoubleClick = (): void => window.navik.windowControls.toggleMaximize()

  return (
    <div class="titlebar" onDblClick={onDragDoubleClick}>
      <div class="titlebar-brand">
        <span class="brand-mark">N</span>
        <span>Navik</span>
      </div>

      <div class="titlebar-tools" onDblClick={(e) => e.stopPropagation()}>
        <button
          class="icon-btn"
          classList={{ active: selectedSessionId() === null }}
          title="Home"
          onClick={() => selectSession(null)}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 7.5L8 2.5l6 5M3.5 6.5V13a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          class="icon-btn"
          classList={{ spinning: isLoading() }}
          title="Refresh"
          onClick={() => void refreshSessions()}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.65-3.93M13.5 2v3.5H10"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button class="icon-btn" title="New session (Ctrl+N)" onClick={props.onStartNewSession}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <ThemePicker />
        <button class="icon-btn" title="Keyboard shortcuts" onClick={props.onOpenShortcuts}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
            <path
              d="M4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M4 9.5h6.5"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="titlebar-controls" onDblClick={(e) => e.stopPropagation()}>
        <button class="titlebar-btn" title="Minimize" onClick={() => window.navik.windowControls.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
        <button
          class="titlebar-btn"
          title="Maximize / Restore"
          onClick={() => window.navik.windowControls.toggleMaximize()}
        >
          <svg class="icon-maximize" width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" stroke-width="1" fill="none" />
          </svg>
          <svg class="icon-restore" width="10" height="10" viewBox="0 0 10 10">
            <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" stroke-width="1" fill="none" />
            <path d="M0.5 2.5v7h7" stroke="currentColor" stroke-width="1" fill="none" />
          </svg>
        </button>
        <button class="titlebar-btn close" title="Close" onClick={() => window.navik.windowControls.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
