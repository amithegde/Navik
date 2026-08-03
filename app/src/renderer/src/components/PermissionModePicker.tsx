import { createSignal, For, Show } from 'solid-js'
import type { JSX } from 'solid-js'

interface PermissionMode {
  value: string
  label: string
  description: string
  icon: () => JSX.Element
}

const modes: PermissionMode[] = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'Claude will ask for approval before making each edit',
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3" />
        <path d="M8 5.5v3l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    )
  },
  {
    value: 'acceptEdits',
    label: 'Edit automatically',
    description: 'Claude will edit your selected text or the whole file',
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path
          d="M6 5L3 8l3 3M10 5l3 3-3 3"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    )
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Claude will explore the code and present a plan before editing',
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="4" y="3" width="8" height="10" rx="1.3" stroke="currentColor" stroke-width="1.3" />
        <path d="M6.5 6.5h3M6.5 9h3M6.5 11h1.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    )
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Claude will approve actions that pass a safety check and pause for anything risky',
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M9 2L4 9h3.2L7 14l5-7H8.8L9 2z" fill="currentColor" />
      </svg>
    )
  },
  {
    value: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Claude will not ask for approval before running potentially dangerous commands',
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="4" y="7.5" width="8" height="6" rx="1.3" stroke="currentColor" stroke-width="1.3" />
        <path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 4.5-1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    )
  }
]

export default function PermissionModePicker(props: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = createSignal(false)
  const current = (): PermissionMode => modes.find((m) => m.value === props.value) ?? modes.find((m) => m.value === 'auto')!

  const select = (value: string): void => {
    setOpen(false)
    if (value !== props.value) props.onChange(value)
  }

  return (
    <div class="mode-picker">
      <button
        type="button"
        class="btn subtle mode-picker-trigger"
        disabled={props.disabled}
        title={props.disabled ? 'No session to choose a permission mode for' : 'Permission mode for this conversation'}
        onClick={() => !props.disabled && setOpen(!open())}
      >
        <span class="mode-option-icon">{current().icon()}</span>
        {current().label}
      </button>
      <Show when={open()}>
        <div class="theme-menu-overlay" onClick={() => setOpen(false)} />
        <div class="mode-menu">
          <div class="mode-menu-header">Modes</div>
          <For each={modes}>
            {(mode) => (
              <button type="button" class="mode-option" classList={{ active: mode.value === props.value }} onClick={() => select(mode.value)}>
                <span class="mode-option-icon">{mode.icon()}</span>
                <span class="mode-option-body">
                  <span class="mode-option-title">{mode.label}</span>
                  <span class="mode-option-desc">{mode.description}</span>
                </span>
                <Show when={mode.value === props.value}>
                  <span class="mode-option-check">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
