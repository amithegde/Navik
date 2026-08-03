import { createReadStream } from 'node:fs'
import readline from 'node:readline'
import { tryParseTurn } from './claude-turn-parser'
import type { TranscriptEntry } from '../shared/transcript-types'

/** Parses a session's *.jsonl transcript into the user/assistant turns worth displaying. */
export async function readTranscript(transcriptPath: string): Promise<TranscriptEntry[]> {
  const entries: TranscriptEntry[] = []

  const rl = readline.createInterface({
    input: createReadStream(transcriptPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (line.length === 0) continue

    let root: unknown
    try {
      root = JSON.parse(line)
    } catch {
      continue // tolerate a partial trailing line from an actively-writing session
    }

    const entry = tryParseTurn(root)
    if (entry) entries.push(entry)
  }

  return entries
}
