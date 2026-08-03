import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'
import type { SessionsSnapshot } from '../shared/session-types'

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
  togglePinned: (sessionId: string): Promise<string[]> =>
    ipcRenderer.invoke(IpcChannels.sessionsTogglePinned, sessionId),
  onChanged: (callback: (snapshot: SessionsSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: SessionsSnapshot): void => callback(snapshot)
    ipcRenderer.on(IpcChannels.sessionsChanged, listener)
    return () => ipcRenderer.removeListener(IpcChannels.sessionsChanged, listener)
  }
}

const navikApi = {
  windowControls,
  sessions
}

contextBridge.exposeInMainWorld('navik', navikApi)

export type NavikApi = typeof navikApi
