import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc-channels'

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

const navikApi = {
  windowControls
}

contextBridge.exposeInMainWorld('navik', navikApi)

export type NavikApi = typeof navikApi
