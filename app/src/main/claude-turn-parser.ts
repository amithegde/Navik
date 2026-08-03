import type { TranscriptEntry, ToolUseSummary, ToolResultSummary, TranscriptRole } from '../shared/transcript-types'

const preferredInputFields = ['file_path', 'path', 'command', 'pattern', 'description', 'prompt']

// How much untruncated text an entry keeps behind its clipped display copy. A single tool result
// can be megabytes (a whole-file Read), and everything kept here is both held for the lifetime of
// the loaded transcript and pushed to the renderer when the expand-to-full viewer opens it —
// generous enough for ordinary output, bounded enough that one pathological result can't pin
// memory or stall the UI.
const retainedTextLimit = 100_000

type JsonRecord = Record<string, unknown>

function getString(el: unknown, property: string): string | undefined {
  if (typeof el !== 'object' || el === null) return undefined
  const value = (el as JsonRecord)[property]
  return typeof value === 'string' ? value : undefined
}

function getBool(el: unknown, property: string): boolean {
  if (typeof el !== 'object' || el === null) return false
  return (el as JsonRecord)[property] === true
}

function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\r\n|\r|\n/g, ' ').trim()
  return singleLine.length <= maxLength ? singleLine : singleLine.slice(0, maxLength) + '…'
}

// Keeps the text's own formatting — only the tail past retainedTextLimit is dropped, and says so
// rather than silently ending mid-output.
function clampRetained(text: string): string {
  if (text.length <= retainedTextLimit) return text
  const droppedCount = (text.length - retainedTextLimit).toLocaleString('en-US')
  return `${text.slice(0, retainedTextLimit)}\n\n… ${droppedCount} more characters not kept`
}

function extractToolResultText(toolResultBlock: unknown): string | undefined {
  const content = (toolResultBlock as JsonRecord | undefined)?.content
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    for (const block of content) {
      if (getString(block, 'type') === 'text') {
        const text = getString(block, 'text')
        if (text !== undefined) return text
      }
    }
  }

  return undefined
}

function buildToolUseSummary(toolUseBlock: JsonRecord): ToolUseSummary {
  const name = getString(toolUseBlock, 'name') ?? 'tool'
  const id = getString(toolUseBlock, 'id')

  const input = toolUseBlock.input
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    // A short human-readable summary some tools (e.g. Bash) attach alongside their real input —
    // shown next to the tool name, separately from the IN row below it.
    const rawDescription = getString(input, 'description')
    const description = rawDescription && rawDescription.trim() ? truncate(rawDescription, 140) : undefined

    for (const field of preferredInputFields) {
      const value = getString(input, field)
      if (value && value.trim()) {
        const detail = truncate(value, 120)
        // Detail and description come from the same "description" field — don't show it twice.
        return {
          name,
          detail,
          id,
          description: field === 'description' ? undefined : description,
          fullDetail: clampRetained(value)
        }
      }
    }

    return { name, id, description }
  }

  return { name, id }
}

/** Returns null for line types other than "user"/"assistant", or turns with nothing to show. */
export function tryParseTurn(root: unknown): TranscriptEntry | null {
  if (typeof root !== 'object' || root === null) return null
  const rootRecord = root as JsonRecord

  const type = rootRecord.type
  const role: TranscriptRole | null = type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : null
  if (role === null) return null

  const message = rootRecord.message
  const content = (message as JsonRecord | undefined)?.content
  if (message === undefined || content === undefined) return null

  const textBlocks: string[] = []
  const toolUses: ToolUseSummary[] = []
  const toolResults: ToolResultSummary[] = []

  if (typeof content === 'string') {
    if (content.trim()) textBlocks.push(content)
  } else if (Array.isArray(content)) {
    for (const block of content) {
      const blockType = getString(block, 'type')
      if (blockType === 'text') {
        const text = getString(block, 'text')
        if (text && text.trim()) textBlocks.push(text)
      } else if (blockType === 'tool_use') {
        toolUses.push(buildToolUseSummary(block as JsonRecord))
      } else if (blockType === 'tool_result') {
        const resultText = extractToolResultText(block)
        if (resultText && resultText.trim()) {
          const toolUseId = getString(block, 'tool_use_id')
          const isError = getBool(block, 'is_error')
          toolResults.push({
            toolUseId,
            text: truncate(resultText, 400),
            isError,
            fullText: clampRetained(resultText)
          })
        }
      }
    }
  }

  const timestampRaw = getString(rootRecord, 'timestamp')
  const parsedTimestamp = timestampRaw ? new Date(timestampRaw) : null
  const timestampUtc =
    parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime()) ? parsedTimestamp.toISOString() : new Date().toISOString()

  const entry: TranscriptEntry = {
    role,
    timestampUtc,
    textBlocks,
    toolUses,
    toolResults,
    isMeta: getBool(rootRecord, 'isMeta')
  }

  const hasVisibleContent = entry.textBlocks.length > 0 || entry.toolUses.length > 0 || entry.toolResults.length > 0
  return hasVisibleContent ? entry : null
}
