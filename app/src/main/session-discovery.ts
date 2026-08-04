import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { ClaudeHome } from './claude-home'
import { buildSessionToProjectMap } from './session-history-index'
import { getRunningBySessionId } from './running-session-registry'
import type { ClaudeProject, ClaudeSession } from '../shared/session-types'
import { ordinalIgnoreCaseCompare } from '../shared/text'

// Metadata sits in the first handful of lines (ai-title, agent-name, the first user turn);
// reading a fixed prefix keeps discovery fast even for multi-MB transcripts.
const metadataScanLineLimit = 80

// How many transcript files to scan at once. Bounded (rather than Promise.all over everything)
// so a project with thousands of sessions doesn't open thousands of file handles at once; matched
// to the raised UV_THREADPOOL_SIZE in bootstrap-threadpool.ts so this actually achieves real
// concurrency in libuv rather than queuing behind the default pool of 4.
const scanConcurrency = 32

interface SessionMetadata {
  title: string | null
  cwd: string | null
  gitBranch: string | null
}

interface CachedMetadata extends SessionMetadata {
  mtimeMs: number
  size: number
}

// Keyed by absolute transcript path, kept for the life of the process. discoverSessions() re-scans
// every project dir on every refresh() (poll fallback, manual refresh, initial load); without this,
// each of those re-reads every transcript's first 80 lines from scratch even when nothing changed.
// A transcript file is append-only once a session ends, so mtime+size is a reliable unchanged check.
const metadataCache = new Map<string, CachedMetadata>()

export async function discoverSessions(home: ClaudeHome): Promise<ClaudeSession[]> {
  if (!(await pathExists(home.projectsDir))) return []

  const [sessionToProject, running] = await Promise.all([
    buildSessionToProjectMap(home),
    getRunningBySessionId(home)
  ])

  const projectDirs = await fs.readdir(home.projectsDir, { withFileTypes: true })

  const fileEntries = (
    await Promise.all(
      projectDirs
        .filter((dirent) => dirent.isDirectory())
        .map(async (dirent) => {
          const projectDir = path.join(home.projectsDir, dirent.name)
          const files = await fs.readdir(projectDir, { withFileTypes: true })
          return files
            .filter((file) => file.isFile() && file.name.endsWith('.jsonl'))
            .map((file) => ({ projectDirName: dirent.name, jsonlFile: path.join(projectDir, file.name) }))
        })
    )
  ).flat()

  const sessions = await mapWithConcurrency(fileEntries, scanConcurrency, async ({ projectDirName, jsonlFile }) => {
    const sessionId = path.basename(jsonlFile, '.jsonl')
    const meta = await scanMetadataCached(jsonlFile)

    const projectPath =
      sessionToProject.get(sessionId.toLowerCase()) ?? meta.cwd ?? decodeProjectFolderName(projectDirName)

    return {
      sessionId,
      projectPath,
      projectDisplayName: getDisplayName(projectPath),
      title: meta.title ?? sessionId,
      transcriptPath: jsonlFile,
      lastActivityUtc: new Date(meta.mtimeMs).toISOString(),
      gitBranch: meta.gitBranch ?? undefined,
      running: running.get(sessionId.toLowerCase())
    }
  })

  sessions.sort((a, b) => {
    const aRunning = a.running ? 1 : 0
    const bRunning = b.running ? 1 : 0
    if (aRunning !== bRunning) return bRunning - aRunning
    return b.lastActivityUtc.localeCompare(a.lastActivityUtc)
  })

  return sessions
}

export function groupByProject(sessions: ClaudeSession[]): ClaudeProject[] {
  const groups = new Map<string, ClaudeSession[]>()
  for (const session of sessions) {
    const key = session.projectPath.toLowerCase()
    const group = groups.get(key)
    if (group) group.push(session)
    else groups.set(key, [session])
  }

  const projects: ClaudeProject[] = []
  for (const group of groups.values()) {
    const first = group[0]
    let lastActivityUtc = first.lastActivityUtc
    let runningCount = 0
    for (const session of group) {
      if (session.running) runningCount++
      if (session.lastActivityUtc > lastActivityUtc) lastActivityUtc = session.lastActivityUtc
    }

    projects.push({
      path: first.projectPath,
      displayName: first.projectDisplayName,
      sessionCount: group.length,
      runningCount,
      lastActivityUtc
    })
  }

  projects.sort((a, b) => {
    const aRunning = a.runningCount > 0 ? 1 : 0
    const bRunning = b.runningCount > 0 ? 1 : 0
    if (aRunning !== bRunning) return bRunning - aRunning
    return ordinalIgnoreCaseCompare(a.displayName, b.displayName)
  })

  return projects
}

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving result order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await fn(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function scanMetadataCached(jsonlFile: string): Promise<CachedMetadata> {
  const stat = await fs.stat(jsonlFile)
  const cached = metadataCache.get(jsonlFile)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached

  const meta = await scanMetadata(jsonlFile)
  const entry: CachedMetadata = { ...meta, mtimeMs: stat.mtimeMs, size: stat.size }
  metadataCache.set(jsonlFile, entry)
  return entry
}

async function scanMetadata(jsonlFile: string): Promise<SessionMetadata> {
  let title: string | null = null
  let agentNameFallback: string | null = null
  let firstUserText: string | null = null
  let cwd: string | null = null
  let gitBranch: string | null = null

  try {
    const rl = readline.createInterface({
      input: createReadStream(jsonlFile, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    })

    let lineIndex = 0
    for await (const line of rl) {
      if (lineIndex++ >= metadataScanLineLimit) break
      if (line.length === 0) continue

      let root: Record<string, unknown>
      try {
        root = JSON.parse(line)
      } catch {
        continue
      }

      cwd ??= typeof root.cwd === 'string' ? root.cwd : null
      gitBranch ??= typeof root.gitBranch === 'string' ? root.gitBranch : null

      switch (root.type) {
        case 'ai-title':
          title ??= typeof root.aiTitle === 'string' ? root.aiTitle : null
          break
        case 'agent-name':
          agentNameFallback ??= typeof root.agentName === 'string' ? root.agentName : null
          break
        case 'user':
          if (firstUserText === null && root.isMeta !== true) {
            firstUserText = extractUserText(root)
          }
          break
      }

      if (title !== null && cwd !== null) break
    }
  } catch {
    // File briefly locked by an active writer; fall back to whatever was already gathered.
  }

  return { title: title ?? agentNameFallback ?? truncate(firstUserText), cwd, gitBranch }
}

function extractUserText(userLine: Record<string, unknown>): string | null {
  const message = userLine.message as Record<string, unknown> | undefined
  if (!message) return null
  const content = message.content

  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        return block.text
      }
    }
  }

  return null
}

/** Single-lines, trims, and caps text for use as a session title. */
export function truncate(text: string | null, maxLength = 90): string | null {
  if (!text || !text.trim()) return null
  const singleLine = text.replace(/\r\n|\r|\n/g, ' ').trim()
  return singleLine.length <= maxLength ? singleLine : singleLine.slice(0, maxLength) + '…'
}

/** Last path segment of a project path, for display — e.g. "C:\github\Demo" -> "Demo". */
export function getDisplayName(projectPath: string): string {
  const trimmed = projectPath.replace(/[\\/]+$/, '')
  const segments = trimmed.split(/[\\/]/).filter((s) => s.length > 0)
  const last = segments[segments.length - 1]
  return last ?? projectPath
}

// Best-effort recovery of the original path from a sanitized "projects/" folder name (e.g.
// "c--github-StrikeLab"), used only when neither history.jsonl nor the transcript itself yielded
// a cwd. Lossy by construction — dashes already present in a real folder name can't be
// distinguished from separators — so this is a last resort, not a decoder.
function decodeProjectFolderName(folderName: string): string {
  const match = /^([A-Za-z])--/.exec(folderName)
  if (!match) return folderName

  const rest = folderName.slice(match[0].length).replace(/-/g, '\\')
  return `${match[1]}:\\${rest}`
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
