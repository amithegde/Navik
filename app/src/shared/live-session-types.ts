import type { TranscriptEntry } from './transcript-types'
import type { RunningProcessInfo } from './session-types'

export interface LiveConversationState {
  /** Whatever currently identifies this conversation — the placeholder id before the CLI reports
   * a real session id, the real id afterward. */
  key: string
  hasKnownSessionId: boolean
  resolvedSessionId: string | null
  workingDirectory: string
  permissionMode: string
  model: string
  /** Current effort level for this session — '' means "Auto" (no --effort flag passed at launch,
   * and no /effort sent live), i.e. whatever the model's own default effort is. */
  effort: string
  /** Already merged (tool_use paired with its tool_result) — ready to render. */
  entries: TranscriptEntry[]
  pendingTurnCount: number
  isBusy: boolean
  hasExited: boolean
  errorMessage: string | null
  totalCostUsd: number
  processId: number
}

export interface StartLiveSessionResult {
  success: boolean
  error?: string
  placeholderId?: string
}

export interface ResumeLiveSessionResult {
  success: boolean
  error?: string
}

/** Emitted by the main process whenever a live session's effect on the sidebar/home sessions list
 * changes — a full row patch, not the turn-by-turn conversation stream (see LiveConversationState
 * for that). `previousKey` is set only when a placeholder id is being swapped for a real session id. */
export interface LiveSessionRowUpdate {
  key: string
  previousKey?: string
  workingDirectory: string
  title?: string
  running: RunningProcessInfo | null
}
