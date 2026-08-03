import { app, BrowserWindow, ipcMain } from 'electron'
import { createMainWindow } from './main-window'
import { IpcChannels } from '../shared/ipc-channels'

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

app.whenReady().then(async () => {
  registerWindowControlIpc()
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
