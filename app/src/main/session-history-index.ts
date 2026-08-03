import { createReadStream, existsSync } from 'node:fs'
import readline from 'node:readline'
import type { ClaudeHome } from './claude-home'

// history.jsonl is the authoritative source for "which directory was this session opened in",
// since the on-disk transcript folder name is a lossy sanitized version of that path. Keyed by
// lowercased session id for case-insensitive lookup.
export async function buildSessionToProjectMap(home: ClaudeHome): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!existsSync(home.historyFile)) return map

  const rl = readline.createInterface({
    input: createReadStream(home.historyFile, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (line.length === 0) continue

    try {
      const root = JSON.parse(line)
      const sessionId = root.sessionId
      const project = root.project
      if (typeof sessionId === 'string' && sessionId && typeof project === 'string' && project) {
        map.set(sessionId.toLowerCase(), project) // later entries overwrite — last known cwd wins
      }
    } catch {
      // Last line of a file being actively appended to can be truncated; ignore and move on.
    }
  }

  return map
}
