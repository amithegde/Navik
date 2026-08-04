import './bootstrap-threadpool'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { createMainWindow } from './main-window'
import { IpcChannels } from '../shared/ipc-channels'
import { sessionsState } from './sessions-state'
import { liveSessionManager, defaultModelValue, defaultPermissionMode } from './live-sessions'
import { claudeModelCatalog, defaultModel } from './claude-model-catalog'
import { readTranscript } from './session-transcript-reader'
import { mergeToolResults } from './transcript-entry-merger'
import { tryLaunchExternal } from './claude-launcher'
import { editorState } from './editor-state'
import type { ImageAttachment } from '../shared/transcript-types'
import type { LiveSessionRowUpdate } from '../shared/live-session-types'
import type { EditorKind } from '../shared/editor-types'

function registerWindowControlIpc(): void {
  ipcMain.on(IpcChannels.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IpcChannels.windowToggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IpcChannels.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function registerSessionsIpc(): void {
  ipcMain.handle(IpcChannels.sessionsRefresh, () => sessionsState.refresh())
  ipcMain.handle(IpcChannels.sessionsTogglePinned, (_event, sessionId: string) => sessionsState.togglePinned(sessionId))
  ipcMain.handle(IpcChannels.sessionsStop, (_event, sessionId: string) => sessionsState.stopSession(sessionId))

  ipcMain.handle(IpcChannels.sessionsReadTranscript, async (_event, transcriptPath: string) => {
    if (!transcriptPath) return []
    const entries = await readTranscript(transcriptPath)
    return mergeToolResults(entries)
  })

  ipcMain.handle(
    IpcChannels.sessionsOpenInTerminal,
    (_event, request: { sessionId: string; projectPath: string }) => {
      const claudePath = sessionsState.getClaudePath()
      if (!claudePath) return { success: false, error: 'Could not find claude.exe on PATH or in ~/.local/bin.' }
      return tryLaunchExternal(claudePath, { workingDirectory: request.projectPath, resumeSessionId: request.sessionId })
    }
  )

  ipcMain.handle(IpcChannels.sessionsPickFile, async (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { defaultPath: projectPath, properties: ['openFile' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return path.relative(projectPath, result.filePaths[0]).replace(/\\/g, '/')
  })

  sessionsState.on('changed', (snapshot) => broadcast(IpcChannels.sessionsChanged, snapshot))
}

function registerProjectsIpc(): void {
  ipcMain.handle(IpcChannels.projectsPickFolder, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

function registerLiveSessionIpc(): void {
  ipcMain.handle(
    IpcChannels.liveStartNew,
    (_event, request: { projectPath: string; permissionMode?: string; model?: string }) =>
      sessionsState.startNewSessionInProject(request.projectPath, request.permissionMode, request.model)
  )

  ipcMain.handle(
    IpcChannels.liveResume,
    (_event, request: { sessionId: string; projectPath: string; transcriptPath: string; permissionMode?: string; model?: string }) =>
      sessionsState.resumeSession(
        request.sessionId,
        request.projectPath,
        request.transcriptPath,
        request.permissionMode ?? defaultPermissionMode,
        request.model ?? defaultModelValue
      )
  )

  ipcMain.handle(
    IpcChannels.liveSendMessage,
    (_event, request: { key: string; text: string; images?: ImageAttachment[] }) =>
      sessionsState.sendLiveMessage(request.key, request.text, request.images)
  )

  ipcMain.handle(IpcChannels.liveSetModel, (_event, request: { key: string; model: string }) =>
    sessionsState.setLiveModel(request.key, request.model)
  )

  ipcMain.handle(IpcChannels.liveSetPermissionMode, (_event, request: { key: string; mode: string }) =>
    sessionsState.setLivePermissionMode(request.key, request.mode)
  )

  ipcMain.handle(IpcChannels.liveGetState, (_event, key: string) => liveSessionManager.snapshot(key))

  liveSessionManager.on('conversationChanged', (state) => broadcast(IpcChannels.liveConversationChanged, state))

  // A placeholder-id-to-real-id swap needs to reach the renderer directly (not just folded into
  // the aggregated sessions:changed snapshot) so the detail pane can keep its selection pointed
  // at the same conversation across the swap.
  liveSessionManager.on('sessionRowChanged', (update: LiveSessionRowUpdate) => {
    if (update.previousKey) broadcast(IpcChannels.liveRowSwapped, { previousKey: update.previousKey, key: update.key })
  })
}

function registerModelCatalogIpc(): void {
  ipcMain.handle(IpcChannels.catalogGetModels, async (_event, workingDirectory: string) => {
    const claudePath = sessionsState.getClaudePath()
    if (!claudePath) return [defaultModel]
    return claudeModelCatalog.getModels(claudePath, workingDirectory)
  })

  ipcMain.handle(IpcChannels.catalogGetCommands, async (_event, workingDirectory: string) => {
    const claudePath = sessionsState.getClaudePath()
    if (!claudePath) return []
    return claudeModelCatalog.getCommands(claudePath, workingDirectory)
  })
}

function registerEditorsIpc(): void {
  ipcMain.handle(IpcChannels.editorsGetAvailable, () => editorState.getAvailability())

  ipcMain.handle(IpcChannels.editorsOpen, (_event, request: { editor: EditorKind; folderPath: string }) =>
    editorState.open(request.editor, request.folderPath)
  )
}

app.whenReady().then(async () => {
  registerWindowControlIpc()
  registerSessionsIpc()
  registerProjectsIpc()
  registerLiveSessionIpc()
  registerModelCatalogIpc()
  registerEditorsIpc()
  void editorState.init()
  await sessionsState.init()
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => sessionsState.dispose())
