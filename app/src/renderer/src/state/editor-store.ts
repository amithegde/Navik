import { createSignal } from 'solid-js'
import type { EditorAvailability, EditorKind } from '@shared/editor-types'

const [editorAvailability, setEditorAvailability] = createSignal<EditorAvailability>({
  vscode: false,
  vscodeInsiders: false,
  preferred: 'vscode'
})

export { editorAvailability }

/** Fetches the result of the main process's background scan for VS Code / VS Code Insiders. */
export function initEditorStore(): void {
  void window.navik.editors.getAvailable().then(setEditorAvailability)
}

export async function openInEditor(editor: EditorKind, folderPath: string): Promise<{ success: boolean; error?: string }> {
  const result = await window.navik.editors.open(editor, folderPath)
  if (result.success) setEditorAvailability((current) => ({ ...current, preferred: editor }))
  return result
}
