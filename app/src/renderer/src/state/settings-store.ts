import { createSignal } from 'solid-js'
import type { AppSettings } from '@shared/app-settings'

const defaultSettings: AppSettings = { keepAwake: false }

const [settings, setSettings] = createSignal<AppSettings>(defaultSettings)
const [isOpen, setIsOpen] = createSignal(false)

export function openSettingsModal(): void {
  setIsOpen(true)
}

export function closeSettingsModal(): void {
  setIsOpen(false)
}

async function loadSettings(): Promise<void> {
  try {
    setSettings(await window.navik.settings.get())
  } catch {
    setSettings(defaultSettings)
  }
}

export async function setKeepAwake(enabled: boolean): Promise<void> {
  const updated = await window.navik.settings.set({ keepAwake: enabled })
  setSettings(updated)
}

export function initSettingsStore(): () => void {
  void loadSettings()
  return () => {}
}

export { settings as appSettings }
export { isOpen as settingsModalOpen }
