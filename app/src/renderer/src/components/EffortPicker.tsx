import { createSignal, For, Show } from 'solid-js'

interface EffortLevel {
  value: string
  label: string
  description: string
}

// The concrete levels come from the CLI's initialize payload (supportedEffortLevels); this map
// just supplies the display label + one-line description for each known level. Unknown levels
// fall back to a title-cased label.
const levelInfo: Record<string, { label: string; description: string }> = {
  low: { label: 'Low', description: 'Quick, straightforward answers with minimal overhead' },
  medium: { label: 'Medium', description: 'Balanced thinking for everyday tasks' },
  high: { label: 'High', description: 'Deeper reasoning for complex work' },
  xhigh: { label: 'Extra high', description: 'Maximum thinking for the hardest problems' },
  max: { label: 'Max', description: 'Sustained peak effort; slowest and most thorough' }
}

function labelFor(value: string): string {
  if (value === '') return 'Auto'
  return levelInfo[value]?.label ?? value.charAt(0).toUpperCase() + value.slice(1)
}

function descriptionFor(value: string): string {
  if (value === '') return "Use the model's own default effort"
  return levelInfo[value]?.description ?? ''
}

export default function EffortPicker(props: {
  value: string
  levels: string[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = createSignal(false)

  // '' (Auto) is always offered on top; the model's supported levels follow.
  const options = (): EffortLevel[] => [
    { value: '', label: 'Auto', description: descriptionFor('') },
    ...props.levels.map((v) => ({ value: v, label: labelFor(v), description: descriptionFor(v) }))
  ]

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
        title={props.disabled ? 'No session to choose an effort for' : 'Effort for this conversation'}
        onClick={() => !props.disabled && setOpen(!open())}
      >
        <span class="mode-option-icon">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5l1.4 4.3 4.5.2-3.5 2.8 1.2 4.4L8 10.6 4.4 13.2l1.2-4.4L2.1 6l4.5-.2L8 1.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" />
          </svg>
        </span>
        Effort: {labelFor(props.value)}
      </button>
      <Show when={open()}>
        <div class="theme-menu-overlay" onClick={() => setOpen(false)} />
        <div class="mode-menu">
          <div class="mode-menu-header">Effort</div>
          <For each={options()}>
            {(level) => (
              <button type="button" class="mode-option" classList={{ active: level.value === props.value }} onClick={() => select(level.value)}>
                <span class="mode-option-body">
                  <span class="mode-option-title">{level.label}</span>
                  <Show when={level.description}>
                    <span class="mode-option-desc">{level.description}</span>
                  </Show>
                </span>
                <Show when={level.value === props.value}>
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
