import { createSignal, For, Show } from 'solid-js'
import type { ClaudeModelOption } from '@shared/transcript-types'

export default function ModelPicker(props: {
  value: string
  options: ClaudeModelOption[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const current = (): ClaudeModelOption => props.options.find((m) => m.value === props.value) ?? props.options[0]

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
        title={props.disabled ? 'No session to choose a model for' : 'Model for this conversation'}
        onClick={() => !props.disabled && setOpen(!open())}
      >
        <span class="mode-option-icon">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.5l1.85 3.9 4.15.6-3 3 .7 4.3L8 11.3l-3.7 2 .7-4.3-3-3 4.15-.6L8 1.5z"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        {current()?.displayName}
      </button>
      <Show when={open()}>
        <div class="theme-menu-overlay" onClick={() => setOpen(false)} />
        <div class="mode-menu">
          <div class="mode-menu-header">Select a model</div>
          <For each={props.options}>
            {(model) => (
              <button type="button" class="mode-option" classList={{ active: model.value === props.value }} onClick={() => select(model.value)}>
                <span class="mode-option-body">
                  <span class="mode-option-title">{model.displayName}</span>
                  <Show when={model.description}>
                    <span class="mode-option-desc">{model.description}</span>
                  </Show>
                </span>
                <Show when={model.value === props.value}>
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
