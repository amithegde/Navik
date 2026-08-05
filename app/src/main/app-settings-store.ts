import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '../shared/app-settings'

const fileName = 'app-settings.json'
const defaultSettings: AppSettings = { keepAwake: false }

function filePath(): string {
  return path.join(app.getPath('userData'), fileName)
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...defaultSettings, ...parsed }
  } catch {
    return { ...defaultSettings }
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    await fs.writeFile(filePath(), JSON.stringify(settings, null, 2))
  } catch {
    // Best-effort: losing the saved setting isn't worth failing on.
  }
}
