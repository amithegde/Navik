export type EditorKind = 'vscode' | 'vscode-insiders'

export interface EditorAvailability {
  vscode: boolean
  vscodeInsiders: boolean
  preferred: EditorKind
}
