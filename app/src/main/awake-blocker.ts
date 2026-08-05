import { powerSaveBlocker } from 'electron'

// Electron's powerSaveBlocker wraps the platform's keep-awake primitive (SetThreadExecutionState
// on Windows, IOPMAssertionCreate on macOS, org.freedesktop.ScreenSaver on Linux). It is
// reversible, needs no native dependencies, and — unlike NoSleep's mouse-jiggle approach — does
// not move the cursor or inject synthetic input. `prevent-display-sleep` is the strongest mode:
// it keeps both the display and the system awake, which is what "keep the machine alive" needs.
let blockerId: number | null = null

export function isAwakeBlocking(): boolean {
  return blockerId !== null
}

export function startAwakeBlocker(): void {
  if (blockerId !== null) return
  blockerId = powerSaveBlocker.start('prevent-display-sleep')
}

export function stopAwakeBlocker(): void {
  if (blockerId === null) return
  powerSaveBlocker.stop(blockerId)
  blockerId = null
}

export function setAwakeBlocking(enabled: boolean): void {
  if (enabled) startAwakeBlocker()
  else stopAwakeBlocker()
}
