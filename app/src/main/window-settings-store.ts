import { app } from 'electron'
import { promises as fs } from 'node:fs'
import fsSync from 'node:fs'
import path from 'node:path'
import type { WindowBounds } from '../shared/window-settings'

const fileName = 'window.json'

function filePath(): string {
  return path.join(app.getPath('userData'), fileName)
}

export async function loadWindowBounds(): Promise<WindowBounds | null> {
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    return JSON.parse(raw) as WindowBounds
  } catch {
    return null
  }
}

// Synchronous: called from the window's `close` handler, where a fire-and-forget async write
// can lose the race against app.quit() tearing down the process before it flushes.
export function saveWindowBoundsSync(bounds: WindowBounds): void {
  try {
    fsSync.writeFileSync(filePath(), JSON.stringify(bounds))
  } catch {
    // Best-effort: losing the saved window position isn't worth failing shutdown over.
  }
}
