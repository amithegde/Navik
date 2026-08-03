import { app, BrowserWindow, ipcMain } from 'electron'
import { createMainWindow } from './main-window'
import { IpcChannels } from '../shared/ipc-channels'
import { sessionsState } from './sessions-state'

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

function registerSessionsIpc(): void {
  ipcMain.handle(IpcChannels.sessionsRefresh, () => sessionsState.refresh())
  ipcMain.handle(IpcChannels.sessionsTogglePinned, (_event, sessionId: string) =>
    sessionsState.togglePinned(sessionId)
  )

  sessionsState.on('changed', (snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.sessionsChanged, snapshot)
    }
  })
}

app.whenReady().then(async () => {
  registerWindowControlIpc()
  registerSessionsIpc()
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
