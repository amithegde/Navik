import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { EditorKind } from '../shared/editor-types'

const fileName = 'editor-preference.json'

function filePath(): string {
  return path.join(app.getPath('userData'), fileName)
}

export async function loadEditorPreference(): Promise<EditorKind | null> {
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed?.editor === 'vscode-insiders' || parsed?.editor === 'vscode' ? parsed.editor : null
  } catch {
    return null
  }
}

export async function saveEditorPreference(editor: EditorKind): Promise<void> {
  try {
    await fs.writeFile(filePath(), JSON.stringify({ editor }))
  } catch {
    // Best-effort: losing the saved preference isn't worth failing on.
  }
}
