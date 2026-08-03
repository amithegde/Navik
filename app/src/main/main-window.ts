import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { loadWindowBounds, saveWindowBoundsSync } from './window-settings-store'
import { IpcChannels } from '../shared/ipc-channels'
import type { WindowBounds } from '../shared/window-settings'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

const defaultWidth = 1320
const defaultHeight = 820
const minWidth = 860
const minHeight = 520

// A saved position only counts as "on screen" if a meaningfully sized slice of it is visible,
// not just any overlap — otherwise a window that mostly sat on a since-unplugged monitor would
// restore nearly off-screen instead of falling back to the centered default.
const minVisible = 60

function virtualScreenBounds(): { x: number; y: number; width: number; height: number } {
  const displays = screen.getAllDisplays()
  const left = Math.min(...displays.map((d) => d.bounds.x))
  const top = Math.min(...displays.map((d) => d.bounds.y))
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function intersectionSize(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): { width: number; height: number } {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

function isOnScreen(bounds: WindowBounds): boolean {
  const visible = intersectionSize(virtualScreenBounds(), bounds)
  return visible.width >= minVisible && visible.height >= minVisible
}

function centeredDefaultBounds(): WindowBounds {
  const workArea = screen.getPrimaryDisplay().workArea
  const width = Math.min(defaultWidth, workArea.width)
  const height = Math.min(defaultHeight, workArea.height)
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
    maximized: false
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const saved = await loadWindowBounds()
  const bounds = saved && saved.width > 0 && saved.height > 0 && isOnScreen(saved) ? saved : centeredDefaultBounds()

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: Math.max(minWidth, bounds.width),
    height: Math.max(minHeight, bounds.height),
    minWidth,
    minHeight,
    title: 'Navik',
    backgroundColor: '#0b0d12',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  if (bounds.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())

  const notifyMaximizedChanged = (): void => {
    win.webContents.send(IpcChannels.windowMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', notifyMaximizedChanged)
  win.on('unmaximize', notifyMaximizedChanged)
  win.webContents.once('did-finish-load', notifyMaximizedChanged)

  win.on('close', () => {
    const normal = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
    saveWindowBoundsSync({
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: win.isMaximized()
    })
  })

  if (isDev) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}
