// Ctrl+= / Ctrl++ zoom in, Ctrl+- zooms out, Ctrl+0 resets to 100%, and Ctrl+scroll wheel
// zooms in either direction — the standard browser zoom surface. The factor is clamped to a
// sane range and persisted to localStorage (matching the sidebar-width precedent in
// pane-resizer) so a chosen zoom survives reloads/relaunches. Capture-phase keydown matches
// the other install*Shortcut helpers; the wheel listener must be passive:false so preventDefault
// can suppress Chromium's own Ctrl+wheel zoom and keep the persisted, bounded factor in charge.
const storageKey = 'navik-zoom-factor'
const minFactor = 0.5
const maxFactor = 3.0
const keyboardStep = 0.1
// Trackpads emit many tiny deltaY values; accumulate and only step once this much accumulates,
// otherwise a single gesture would blow past the bounds.
const wheelThreshold = 80

function clampFactor(factor: number): number {
  return Math.min(maxFactor, Math.max(minFactor, factor))
}

export function installZoomShortcut(): () => void {
  const saved = parseFloat(localStorage.getItem(storageKey) ?? '')
  if (Number.isFinite(saved)) window.navik.zoom.setFactor(clampFactor(saved))

  const apply = (next: number): void => {
    const clamped = clampFactor(next)
    window.navik.zoom.setFactor(clamped)
    localStorage.setItem(storageKey, String(clamped))
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      apply(window.navik.zoom.getFactor() + keyboardStep)
    } else if (e.key === '-') {
      e.preventDefault()
      apply(window.navik.zoom.getFactor() - keyboardStep)
    } else if (e.key === '0') {
      e.preventDefault()
      apply(1)
    }
  }

  let pending = 0
  const onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return
    e.preventDefault()
    pending += e.deltaY
    const steps = Math.trunc(pending / wheelThreshold)
    if (steps === 0) return
    pending -= steps * wheelThreshold
    apply(window.navik.zoom.getFactor() - steps * keyboardStep)
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('wheel', onWheel, { capture: true, passive: false })
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('wheel', onWheel, true)
  }
}
