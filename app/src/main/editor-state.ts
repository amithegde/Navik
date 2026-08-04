import { locateEditors, type LocatedEditors } from './editor-locator'
import { loadEditorPreference, saveEditorPreference } from './editor-preference-store'
import { openInEditor } from './editor-launcher'
import type { EditorAvailability, EditorKind } from '../shared/editor-types'

class EditorState {
  private located: LocatedEditors = { vscode: null, vscodeInsiders: null }
  private preferred: EditorKind = 'vscode'
  private ready: Promise<void> = Promise.resolve()

  // Kicked off from app.whenReady() without being awaited before window creation — the scan (and
  // the preference read) runs in the background; getAvailability()/open() just await its result
  // whenever the renderer actually asks.
  async init(): Promise<void> {
    this.ready = (async () => {
      const [located, savedPreference] = await Promise.all([locateEditors(), loadEditorPreference()])
      this.located = located
      if (savedPreference) this.preferred = savedPreference
    })()
    await this.ready
  }

  async getAvailability(): Promise<EditorAvailability> {
    await this.ready
    return {
      vscode: this.located.vscode !== null,
      vscodeInsiders: this.located.vscodeInsiders !== null,
      preferred: this.preferred
    }
  }

  async open(editor: EditorKind, folderPath: string): Promise<{ success: boolean; error?: string }> {
    await this.ready
    const executablePath = editor === 'vscode-insiders' ? this.located.vscodeInsiders : this.located.vscode
    if (!executablePath) {
      return { success: false, error: editor === 'vscode-insiders' ? 'VS Code Insiders was not found.' : 'VS Code was not found.' }
    }

    const result = openInEditor(executablePath, folderPath)
    if (result.success) {
      this.preferred = editor
      void saveEditorPreference(editor)
    }
    return result
  }
}

export const editorState = new EditorState()
