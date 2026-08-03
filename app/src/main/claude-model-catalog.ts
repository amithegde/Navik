import { spawn } from 'node:child_process'
import readline from 'node:readline'
import path from 'node:path'
import { killProcessTree } from './kill-process-tree'
import type { ClaudeCommandOption, ClaudeModelOption } from '../shared/transcript-types'

const probeTimeoutMs = 20_000

/** The CLI's own name for "whatever this account's default is". */
export const defaultModelValue = 'default'

export const defaultModel: ClaudeModelOption = {
  value: defaultModelValue,
  displayName: 'Default (recommended)',
  description: "Whatever your account's default model is"
}

interface ProbeResult {
  models: ClaudeModelOption[]
  commands: ClaudeCommandOption[]
}

type JsonRecord = Record<string, unknown>

// Serializes every probe regardless of directory — simpler than a lock per key, and probes are
// rare enough (once per project actually opened) that spawning them one at a time costs nothing
// noticeable.
class AsyncMutex {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

/**
 * Reads the models and slash commands the signed-in account/project has available, by starting a
 * throwaway `claude -p --input-format stream-json` process and sending it the `initialize` control
 * request — the same handshake the VS Code extension uses to populate its model picker and its
 * `/` command menu. Nothing is hard-coded here: plan, org policy, CLI version and the project's
 * own `.claude/commands` decide what comes back.
 */
class ClaudeModelCatalog {
  private readonly gate = new AsyncMutex()
  private readonly cache = new Map<string, ProbeResult>()

  /** Probes once per distinct project directory and caches the result. Never throws: a CLI that's
   * missing, too old to know the control request, or slow to answer yields just defaultModel,
   * which still launches correctly. */
  async getModels(claudeExecutablePath: string, workingDirectory: string): Promise<ClaudeModelOption[]> {
    const result = await this.getProbeResult(claudeExecutablePath, workingDirectory)
    return result.models.length > 0 ? result.models : [defaultModel]
  }

  /** Same probe as getModels, read for its command list instead. A failed probe yields an empty
   * list rather than a fallback — unlike models, there's no single command the composer must
   * always be able to offer, so the `/` menu simply doesn't open until a real answer comes back. */
  async getCommands(claudeExecutablePath: string, workingDirectory: string): Promise<ClaudeCommandOption[]> {
    const result = await this.getProbeResult(claudeExecutablePath, workingDirectory)
    return result.commands
  }

  private async getProbeResult(claudeExecutablePath: string, workingDirectory: string): Promise<ProbeResult> {
    const key = normalizeKey(workingDirectory)
    const cached = this.cache.get(key)
    if (cached) return cached

    return this.gate.run(async () => {
      const cachedAfterGate = this.cache.get(key)
      if (cachedAfterGate) return cachedAfterGate

      const result = await probe(claudeExecutablePath, workingDirectory)

      // Only a real answer is cached: a probe that failed (CLI busy, not signed in yet) must not
      // pin this directory to empty/default-only results for the rest of the app's lifetime — the
      // next call for it should try again.
      if (result.models.length === 0) return result

      this.cache.set(key, result)
      return result
    })
  }
}

export const claudeModelCatalog = new ClaudeModelCatalog()

// Collapses relative segments and trailing separators so the same project reached two different
// ways still hits one cache entry. Case-folded only on Windows, where the filesystem itself is
// case-insensitive — collapsing distinct-case paths on Linux/macOS would merge genuinely different
// directories.
function normalizeKey(workingDirectory: string): string {
  const resolved = path.resolve(workingDirectory)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

async function probe(claudeExecutablePath: string, workingDirectory: string): Promise<ProbeResult> {
  const empty: ProbeResult = { models: [], commands: [] }

  const child = spawn(claudeExecutablePath, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], {
    cwd: workingDirectory,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe']
  })

  const spawnFailed = await new Promise<boolean>((resolve) => {
    child.once('error', () => resolve(true))
    child.once('spawn', () => resolve(false))
  })
  if (spawnFailed) return empty

  // stderr must be drained alongside stdout or a chatty CLI can fill that pipe and block before it
  // ever answers — the same wedge the live session's error drain guards against.
  const errRl = readline.createInterface({ input: child.stderr, crlfDelay: Infinity })
  errRl.on('line', () => {
    // Diagnostic noise; read only so the pipe can't fill up.
  })

  try {
    const requestId = 'navik-model-catalog'
    const request = JSON.stringify({ type: 'control_request', request_id: requestId, request: { subtype: 'initialize' } })
    child.stdin.write(request + '\n')

    const result = await Promise.race([readUntilResponse(child, requestId), timeoutAfter(probeTimeoutMs)])
    return result ?? empty
  } catch {
    return empty
  } finally {
    if (child.exitCode === null && !child.killed) {
      void killProcessTree(child.pid!)
    }
  }
}

function timeoutAfter(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms))
}

function readUntilResponse(
  child: import('node:child_process').ChildProcessWithoutNullStreams,
  requestId: string
): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })

    rl.on('line', (line) => {
      const models = tryParseModels(line, requestId)
      if (models) {
        // Resolve before closing: readline's close() emits 'close' synchronously, and the
        // 'close' handler below also resolves (with null) — whichever resolve() call happens
        // first wins the promise, so closing first would silently discard this real result.
        resolve({ models, commands: tryParseCommands(line, requestId) ?? [] })
        rl.close()
      }
    })
    rl.on('close', () => resolve(null))
  })
}

/** Pulls the model list out of one stdout line, or null if that line isn't the successful control
 * response we're waiting for. Kept separate from the process plumbing so the wire shape can be
 * tested directly. */
export function tryParseModels(line: string, requestId: string): ClaudeModelOption[] | null {
  const payload = tryGetSuccessPayload(line, requestId)
  if (!payload) return null

  const models = payload.models
  if (!Array.isArray(models)) return null

  const result: ClaudeModelOption[] = []
  for (const model of models) {
    if (typeof model !== 'object' || model === null) continue
    const record = model as JsonRecord

    const value = record.value
    if (typeof value !== 'string' || value.length === 0) continue

    const displayName = typeof record.displayName === 'string' && record.displayName.length > 0 ? record.displayName : value
    const description = typeof record.description === 'string' ? record.description : undefined

    result.push({ value, displayName, description })
  }

  return result
}

/** Pulls the slash command list out of one stdout line — built-ins, installed skills, and this
 * project's own `.claude/commands`, exactly as the CLI would list them for itself. */
export function tryParseCommands(line: string, requestId: string): ClaudeCommandOption[] | null {
  const payload = tryGetSuccessPayload(line, requestId)
  if (!payload) return null

  const commands = payload.commands
  if (!Array.isArray(commands)) return null

  const result: ClaudeCommandOption[] = []
  for (const command of commands) {
    if (typeof command !== 'object' || command === null) continue
    const record = command as JsonRecord

    const name = record.name
    if (typeof name !== 'string' || name.length === 0) continue

    const description = typeof record.description === 'string' ? record.description : ''
    const argumentHint = typeof record.argumentHint === 'string' ? record.argumentHint : ''
    const aliases = Array.isArray(record.aliases) ? record.aliases.filter((a): a is string => typeof a === 'string') : []

    result.push({ name, description, argumentHint, aliases })
  }

  return result
}

/** Shared gate for both parsers: is this line a `control_response` answering our specific
 * request, with a successful verdict? Returns the inner `response.response` payload object that
 * the model/command lists live under. */
function tryGetSuccessPayload(line: string, requestId: string): JsonRecord | null {
  let root: unknown
  try {
    root = JSON.parse(line)
  } catch {
    return null
  }

  if (typeof root !== 'object' || root === null) return null
  const rootRecord = root as JsonRecord

  if (rootRecord.type !== 'control_response') return null

  const response = rootRecord.response
  if (typeof response !== 'object' || response === null) return null
  const responseRecord = response as JsonRecord

  // A response for someone else's request (or an error verdict) is not ours to parse.
  if (responseRecord.request_id !== requestId) return null
  if (responseRecord.subtype !== 'success') return null

  const payload = responseRecord.response
  if (typeof payload !== 'object' || payload === null) return null

  return payload as JsonRecord
}
