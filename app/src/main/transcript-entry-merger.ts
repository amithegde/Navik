import type { TranscriptEntry, ToolResultSummary } from '../shared/transcript-types'

/**
 * Pairs each tool_use with the tool_result that answers it. Over the wire (and in the persisted
 * transcript) those never share one entry: a tool_use rides on an "assistant" entry, and its
 * tool_result comes back as a separate, later "user" entry — the CLI's protocol for delivering
 * tool output, not something the human typed.
 */
export function mergeToolResults(entries: TranscriptEntry[]): TranscriptEntry[] {
  const resultsById = new Map<string, ToolResultSummary>()
  for (const entry of entries) {
    for (const result of entry.toolResults) {
      if (result.toolUseId) resultsById.set(result.toolUseId, result)
    }
  }

  const merged: TranscriptEntry[] = []
  for (const entry of entries) {
    if (entry.toolUses.length > 0) {
      const pairedToolUses = entry.toolUses.map((tool) => {
        const result = tool.id ? resultsById.get(tool.id) : undefined
        return result ? { ...tool, result } : tool
      })

      merged.push({ ...entry, toolUses: pairedToolUses })
      continue
    }

    // Nothing but tool_result plumbing for a call rendered elsewhere — not a real turn.
    if (entry.textBlocks.length === 0 && entry.toolResults.length > 0) continue

    merged.push(entry)
  }

  return merged
}
