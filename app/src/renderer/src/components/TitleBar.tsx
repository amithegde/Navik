import { onCleanup, onMount } from 'solid-js'
import ThemePicker from './ThemePicker'

export default function TitleBar(props: { onOpenShortcuts: () => void }) {
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
