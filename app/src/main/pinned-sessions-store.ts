import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const fileName = 'pinned-sessions.json'

function filePath(): string {
  return path.join(app.getPath('userData'), fileName)
}

export async function loadPinnedSessionIds(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const ids = JSON.parse(raw)
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').map((id) => id.toLowerCase()) : [])
  } catch {
    return new Set()
  }
}

export async function savePinnedSessionIds(ids: Iterable<string>): Promise<void> {
  try {
    await fs.writeFile(filePath(), JSON.stringify([...ids]))
  } catch {
    // Best-effort: losing the saved pin set isn't worth failing on.
  }
}
