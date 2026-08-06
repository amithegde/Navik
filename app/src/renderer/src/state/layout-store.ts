import { createSignal } from 'solid-js'

export const [isZenMode, setIsZenMode] = createSignal(false)

// Session zen and terminal zen are mutually exclusive — both true at once would hide the sidebar,
// the detail pane, AND the terminal, leaving a blank window. Each toggle clears the other. (Today
// the UI already prevents both: each zen hides the other's toolbar so the second button can't be
// reached — this guard is for any future keyboard shortcut that bypasses that.)
export function toggleZenMode(): void {
  setIsZenMode((v) => {
    const next = !v
    if (next) setIsTerminalZen(false)
    return next
  })
}

// Integrated terminal panel (VS Code-style Ctrl+` panel at the bottom of the detail column).
// `isTerminalOpen` toggles visibility; the panel + its pty persist across toggles (only the
// explicit kill button or app shutdown tears the shell down), mirroring how VS Code keeps a
// terminal alive while its panel is hidden.
export const [isTerminalOpen, setIsTerminalOpen] = createSignal(false)

// Terminal zen/maximize: like the session's zen mode but for the terminal — hides the sidebar AND
// the detail pane above so the terminal fills the window. Separate from `isZenMode` because the two
// mean opposite things for the detail pane (session zen shows it full, terminal zen hides it), so a
// single boolean can't carry both intents. Cleared whenever the panel closes, otherwise a zen'd
// terminal closed via Ctrl+` would leave a blank window (sidebar + detail pane both hidden).
export const [isTerminalZen, setIsTerminalZen] = createSignal(false)

export function toggleTerminal(): void {
  if (isTerminalOpen()) {
    setIsTerminalOpen(false)
    setIsTerminalZen(false)
  } else {
    setIsTerminalOpen(true)
  }
}

/** Closes the panel and drops any zen state with it (see isTerminalZen). */
export function closeTerminalPanel(): void {
  setIsTerminalZen(false)
  setIsTerminalOpen(false)
}

export function toggleTerminalZen(): void {
  setIsTerminalZen((v) => {
    const next = !v
    if (next) setIsZenMode(false)
    return next
  })
}
