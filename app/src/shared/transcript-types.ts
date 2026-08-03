export type TranscriptRole = 'user' | 'assistant'

export interface ToolResultSummary {
  toolUseId?: string
  /** Clipped, single-line preview shown in the IN/OUT row. */
  text: string
  isError: boolean
  /** The result exactly as the tool produced it, up to RetainedTextLimit — what the expand-to-full viewer renders. */
  fullText: string
}

export interface ToolUseSummary {
  name: string
  /** Clipped, single-line preview of the tool's main input field. */
  detail?: string
  id?: string
  /** Short human-readable summary some tools (e.g. Bash) attach alongside their real input. */
  description?: string
  /** The input exactly as the tool received it, up to RetainedTextLimit. */
  fullDetail?: string
  /** Filled in once TranscriptEntryMerger pairs this call with its matching tool_result. */
  result?: ToolResultSummary
}

export interface TranscriptEntry {
  role: TranscriptRole
  timestampUtc: string
  textBlocks: string[]
  toolUses: ToolUseSummary[]
  toolResults: ToolResultSummary[]
  isMeta: boolean
}

/** A pasted image queued to go out with the next user message — raw base64, no data: URL prefix. */
export interface ImageAttachment {
  mediaType: string
  base64Data: string
}

/** The "result" event a live claude process emits when a turn finishes. */
export interface LiveTurnSummary {
  isError: boolean
  resultText?: string
  stopReason?: string
  totalCostUsd?: number
}

export interface ClaudeModelOption {
  value: string
  displayName: string
  description?: string
}

export interface ClaudeCommandOption {
  name: string
  description: string
  argumentHint: string
  aliases: string[]
}
