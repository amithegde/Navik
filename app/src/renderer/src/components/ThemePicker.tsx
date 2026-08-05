import { createSignal, For, Show } from 'solid-js'

interface ThemeOption {
  key: string
  label: string
  bg: string
  accent: string
}

const options: ThemeOption[] = [
  { key: 'dark', label: 'Dark', bg: '#171a22', accent: '#5b8cff' },
  { key: 'light', label: 'Light', bg: '#ffffff', accent: '#3b6fe0' },
  { key: 'slate', label: 'Slate', bg: '#202e37', accent: '#5998c0' },
  { key: 'ocean', label: 'Ocean', bg: '#09334e', accent: '#49ace9' },
  { key: 'autumn', label: 'Autumn', bg: '#013a55', accent: '#f77f00' },
  { key: 'coastal', label: 'Coastal', bg: '#1d1535', accent: '#368f8b' },
  { key: 'sienna', label: 'Sienna', bg: '#2c1a15', accent: '#f85e00' },
  { key: 'heather', label: 'Heather', bg: '#4a4e69', accent: '#a89ab4' },
  { key: 'sorbet', label: 'Sorbet', bg: '#fbfdf3', accent: '#fe5f55' },
  { key: 'fjord', label: 'Fjord', bg: '#5c6b73', accent: '#5fb8c8' },
  { key: 'tangier', label: 'Tangier', bg: '#062a40', accent: '#ff7d00' }
]

const storageKey = 'navik-theme'

export default function ThemePicker() {
  const [open, setOpen] = createSignal(false)
  const [current, setCurrent] = createSignal(localStorage.getItem(storageKey) || 'dark')

  const select = (key: string): void => {
    localStorage.setItem(storageKey, key)
    document.documentElement.setAttribute('data-theme', key)
    setCurrent(key)
    setOpen(false)
  }

  return (
    <div class="theme-menu-wrap">
      <button class="icon-btn" title="Theme" onClick={() => setOpen(!open())}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5a6.5 6.5 0 1 0 0 13c.7 0 1.2-.6 1.1-1.3l-.1-.5c-.1-.5.3-1 .9-1H11a3 3 0 0 0 3-3c0-3.9-2.7-7.2-6-7.2Z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
          <circle cx="4.8" cy="7" r="0.9" fill="currentColor" />
          <circle cx="6.6" cy="4.3" r="0.9" fill="currentColor" />
          <circle cx="9.6" cy="4.3" r="0.9" fill="currentColor" />
          <circle cx="11.2" cy="7" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <Show when={open()}>
        <div class="theme-menu-overlay" onClick={() => setOpen(false)} />
        <div class="theme-menu">
          <For each={options}>
            {(option) => (
              <button
                class="theme-option"
                classList={{ active: option.key === current() }}
                onClick={() => select(option.key)}
              >
                <span class="theme-swatch" style={{ background: option.bg, 'border-color': option.accent }} />
                <span>{option.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
