import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type { SessionsSnapshot } from '../shared/session-types'
import type { TranscriptEntry, ImageAttachment, ClaudeModelOption, ClaudeCommandOption } from '../shared/transcript-types'
import type { LiveConversationState, StartLiveSessionResult, ResumeLiveSessionResult } from '../shared/live-session-types'
import type { StopOutcome } from '../main/sessions-state'

const windowControls = {
  minimize: (): void => ipcRenderer.send(IpcChannels.windowMinimize),
  toggleMaximize: (): void => ipcRenderer.send(IpcChannels.windowToggleMaximize),
  close: (): void => ipcRenderer.send(IpcChannels.windowClose),
  onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
    ipcRenderer.on(IpcChannels.windowMaximizedChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, listener)
  }
}

const sessions = {
  refresh: (): Promise<SessionsSnapshot> => ipcRenderer.invoke(IpcChannels.sessionsRefresh),
  togglePinned: (sessionId: string): Promise<string[]> => ipcRenderer.invoke(IpcChannels.sessionsTogglePinned, sessionId),
  stop: (sessionId: string): Promise<{ outcome: StopOutcome; error?: string }> => ipcRenderer.invoke(IpcChannels.sessionsStop, sessionId),
  readTranscript: (transcriptPath: string): Promise<TranscriptEntry[]> =>
    ipcRenderer.invoke(IpcChannels.sessionsReadTranscript, transcriptPath),
  openInTerminal: (sessionId: string, projectPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.sessionsOpenInTerminal, { sessionId, projectPath }),
  pickFile: (projectPath: string): Promise<string | null> => ipcRenderer.invoke(IpcChannels.sessionsPickFile, projectPath),
  onChanged: (callback: (snapshot: SessionsSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: SessionsSnapshot): void => callback(snapshot)
    ipcRenderer.on(IpcChannels.sessionsChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannels.sessionsChanged, listener)
  }
}

const live = {
  startNew: (projectPath: string, permissionMode?: string, model?: string): Promise<StartLiveSessionResult> =>
    ipcRenderer.invoke(IpcChannels.liveStartNew, { projectPath, permissionMode, model }),
  resume: (
    sessionId: string,
    projectPath: string,
    transcriptPath: string,
    permissionMode?: string,
    model?: string
  ): Promise<ResumeLiveSessionResult> =>
    ipcRenderer.invoke(IpcChannels.liveResume, { sessionId, projectPath, transcriptPath, permissionMode, model }),
  sendMessage: (key: string, text: string, images?: ImageAttachment[]): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.liveSendMessage, { key, text, images }),
  setModel: (key: string, model: string): Promise<void> => ipcRenderer.invoke(IpcChannels.liveSetModel, { key, model }),
  setPermissionMode: (key: string, mode: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.liveSetPermissionMode, { key, mode }),
  getState: (key: string): Promise<LiveConversationState | null> => ipcRenderer.invoke(IpcChannels.liveGetState, key),
  onConversationChanged: (callback: (state: LiveConversationState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: LiveConversationState): void => callback(state)
    ipcRenderer.on(IpcChannels.liveConversationChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannels.liveConversationChanged, listener)
  },
  onRowSwapped: (callback: (swap: { previousKey: string; key: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, swap: { previousKey: string; key: string }): void => callback(swap)
    ipcRenderer.on(IpcChannels.liveRowSwapped, listener)
    return () => ipcRenderer.removeListener(IpcChannels.liveRowSwapped, listener)
  }
}

const catalog = {
  getModels: (workingDirectory: string): Promise<ClaudeModelOption[]> =>
    ipcRenderer.invoke(IpcChannels.catalogGetModels, workingDirectory),
  getCommands: (workingDirectory: string): Promise<ClaudeCommandOption[]> =>
    ipcRenderer.invoke(IpcChannels.catalogGetCommands, workingDirectory)
}

const navikApi = {
  windowControls,
  sessions,
  live,
  catalog
}

contextBridge.exposeInMainWorld('navik', navikApi)

export type NavikApi = typeof navikApi
