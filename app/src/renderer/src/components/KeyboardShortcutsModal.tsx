import { createEffect, For, Show } from 'solid-js'

interface ShortcutRow {
  keys: string[]
  desc: string
}

interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

const groups: ShortcutGroup[] = [
  {
    title: 'General',
    rows: [
      { keys: ['Ctrl', 'N'], desc: 'Start a new session in the current project' },
      { keys: ['Ctrl', 'K'], desc: 'Focus the session search box' },
      { keys: ['Ctrl', 'M'], desc: 'Quick-switch model and effort' },
      { keys: ['Alt', '←'], desc: 'Go back to the previous page' },
      { keys: ['Alt', '→'], desc: 'Go forward to the next page' },
      { keys: ['Ctrl', '+'], desc: 'Zoom in' },
      { keys: ['Ctrl', '-'], desc: 'Zoom out' },
      { keys: ['Ctrl', '0'], desc: 'Reset zoom to 100%' },
      { keys: ['Ctrl', 'Scroll'], desc: 'Zoom in or out' },
      { keys: ['Esc'], desc: 'Exit zen mode' }
    ]
  },
  {
    title: 'Message composer',
    rows: [
      { keys: ['Enter'], desc: 'Send the message, or accept the highlighted command' },
      { keys: ['Shift', 'Enter'], desc: 'Insert a new line' },
      { keys: ['/'], desc: 'Open the command menu' },
      { keys: ['↑', '↓'], desc: 'Navigate the command menu' },
      { keys: ['Tab'], desc: 'Accept the highlighted command' },
      { keys: ['Esc'], desc: 'Close the command menu' }
    ]
  },
  {
    title: 'Viewers',
    rows: [{ keys: ['Esc'], desc: 'Close the open viewer or dialog' }]
  },
  {
    title: 'Quick switch (Ctrl+M)',
    rows: [
      { keys: ['↑', '↓'], desc: 'Move selection in the focused list' },
      { keys: ['←', '→'], desc: 'Switch between the model and effort lists' },
      { keys: ['Enter'], desc: 'Apply the selection for the next request' },
      { keys: ['Esc'], desc: 'Close without changing anything' }
    ]
  }
]

export default function KeyboardShortcutsModal(props: { isOpen: boolean; onClose: () => void }) {
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
      <div class="shortcuts-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
        <div class="shortcuts-head">
          <span class="shortcuts-title">Keyboard shortcuts</span>
          <button type="button" class="icon-btn" title="Close (Esc)" onClick={() => props.onClose()}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="shortcuts-body">
          <For each={groups}>
            {(group) => (
              <div class="shortcuts-group">
                <span class="shortcuts-group-title">{group.title}</span>
                <For each={group.rows}>
                  {(row) => (
                    <div class="shortcuts-row">
                      <span class="shortcuts-keys">
                        <For each={row.keys}>{(key) => <kbd class="shortcuts-kbd">{key}</kbd>}</For>
                      </span>
                      <span class="shortcuts-desc">{row.desc}</span>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
