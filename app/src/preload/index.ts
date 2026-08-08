import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type { SessionsSnapshot } from '../shared/session-types'
import type { TranscriptEntry, ImageAttachment, ClaudeModelOption, ClaudeCommandOption } from '../shared/transcript-types'
import type { LiveConversationState, StartLiveSessionResult, ResumeLiveSessionResult } from '../shared/live-session-types'
import type { StopOutcome } from '../main/sessions-state'
import type { EditorAvailability, EditorKind } from '../shared/editor-types'
import type { AppSettings } from '../shared/app-settings'
import type { UsageResult } from '../shared/usage-types'

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

const projects = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.projectsPickFolder)
}

const live = {
  startNew: (projectPath: string, permissionMode?: string, model?: string, effort?: string): Promise<StartLiveSessionResult> =>
    ipcRenderer.invoke(IpcChannels.liveStartNew, { projectPath, permissionMode, model, effort }),
  resume: (
    sessionId: string,
    projectPath: string,
    transcriptPath: string,
    permissionMode?: string,
    model?: string,
    effort?: string
  ): Promise<ResumeLiveSessionResult> =>
    ipcRenderer.invoke(IpcChannels.liveResume, { sessionId, projectPath, transcriptPath, permissionMode, model, effort }),
  sendMessage: (key: string, text: string, images?: ImageAttachment[]): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.liveSendMessage, { key, text, images }),
  setModel: (key: string, model: string): Promise<void> => ipcRenderer.invoke(IpcChannels.liveSetModel, { key, model }),
  setPermissionMode: (key: string, mode: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.liveSetPermissionMode, { key, mode }),
  setEffort: (key: string, level: string): Promise<void> => ipcRenderer.invoke(IpcChannels.liveSetEffort, { key, level }),
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

const usage = {
  get: (): Promise<UsageResult> => ipcRenderer.invoke(IpcChannels.usageGet)
}

const editors = {
  getAvailable: (): Promise<EditorAvailability> => ipcRenderer.invoke(IpcChannels.editorsGetAvailable),
  open: (editor: EditorKind, folderPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.editorsOpen, { editor, folderPath })
}

const shell = {
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IpcChannels.shellOpenExternal, url)
}

const terminal = {
  create: (opts: { cwd?: string; cols?: number; rows?: number }): Promise<{ id: string; shell: string } | { error: string }> =>
    ipcRenderer.invoke(IpcChannels.terminalCreate, opts),
  input: (id: string, data: string): void => {
    ipcRenderer.send(IpcChannels.terminalInput, { id, data })
  },
  resize: (id: string, cols: number, rows: number): void => {
    ipcRenderer.send(IpcChannels.terminalResize, { id, cols, rows })
  },
  kill: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.terminalKill, id),
  onData: (callback: (payload: { id: string; data: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }): void => callback(payload)
    ipcRenderer.on(IpcChannels.terminalData, listener)
    return () => ipcRenderer.removeListener(IpcChannels.terminalData, listener)
  },
  onExit: (callback: (payload: { id: string; exitCode: number }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; exitCode: number }): void => callback(payload)
    ipcRenderer.on(IpcChannels.terminalExit, listener)
    return () => ipcRenderer.removeListener(IpcChannels.terminalExit, listener)
  }
}

const settings = {
  get: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannels.settingsGet),
  set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IpcChannels.settingsSet, patch)
}

const zoom = {
  getFactor: (): number => webFrame.getZoomFactor(),
  setFactor: (factor: number): void => {
    webFrame.setZoomFactor(factor)
  }
}

const navikApi = {
  windowControls,
  sessions,
  projects,
  live,
  catalog,
  usage,
  editors,
  shell,
  terminal,
  settings,
  zoom
}

contextBridge.exposeInMainWorld('navik', navikApi)

export type NavikApi = typeof navikApi
