import { createEffect, Show } from 'solid-js'
import { appSettings, closeSettingsModal, setKeepAwake, settingsModalOpen } from '../state/settings-store'

export default function SettingsModal() {
  let frameRef: HTMLDivElement | undefined

  createEffect(() => {
    if (settingsModalOpen()) frameRef?.focus()
  })

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeSettingsModal()
  }

  return (
    <Show when={settingsModalOpen()}>
      <div class="settings-overlay" onClick={() => closeSettingsModal()} />
      <div class="settings-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
        <div class="settings-head">
          <span class="settings-title">Settings</span>
          <button type="button" class="icon-btn" title="Close (Esc)" onClick={() => closeSettingsModal()}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="settings-body">
          <div class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-label">Keep machine awake</span>
              <span class="settings-row-desc">
                Prevents the system from sleeping and the display from turning off while Navik is running.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              class="settings-switch"
              classList={{ on: appSettings().keepAwake }}
              aria-checked={appSettings().keepAwake}
              title="Keep machine awake"
              onClick={() => void setKeepAwake(!appSettings().keepAwake)}
            >
              <span class="settings-switch-knob" />
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}
