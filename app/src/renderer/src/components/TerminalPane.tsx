import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { createEffect, createSignal, onCleanup, onMount, Show, untrack } from 'solid-js'
import { isTerminalOpen, isTerminalZen, toggleTerminalZen, closeTerminalPanel } from '../state/layout-store'
import { selectedSession } from '../state/sessions-store'
import { showToast } from '../state/toast-store'

// Integrated terminal panel. One xterm instance bound to one main-process pty. The panel is kept
// mounted for the app's lifetime (hidden via CSS when closed) so the shell + its scrollback
// survive open/close toggles — the pty and xterm are only torn down on the explicit kill button.
//
// The pty is created lazily on first open (not on mount): at startup the app shows Home with no
// session selected, so creating the shell immediately would pin it to the home directory. Deferring
// until the first Ctrl+` captures the currently-selected project's path as the initial cwd.
//
// Refitting is driven by a ResizeObserver on the terminal container rather than by tracking
// signals, because the panel height is a plain CSS variable (dragged by the sash) — no signal fires
// when it changes. The observer uniformly covers sash drags, window resizes, and the open/close
// transition. fit() itself fires term.onResize, which forwards the new cols/rows to the pty, so no
// manual resize send is needed alongside it.

export default function TerminalPane() {
  let containerRef: HTMLDivElement | undefined
  let term: Terminal | undefined
  let fitAddon: FitAddon | undefined
  let started = false
  let wasOpen = false
  let pendingFit = 0

  const [terminalId, setTerminalId] = createSignal<string | null>(null)
  const [exited, setExited] = createSignal(false)
  // True while a terminal.create + xterm build is in flight. Gates start() so a rapid Restart
  // double-click (or a Restart during the first-open spawn) can't put two creates in flight —
  // without it the second spawn orphaned the first pty (leaked headless) and stacked a second
  // xterm DOM tree in the container.
  const [spawning, setSpawning] = createSignal(false)

  function scheduleFit(): void {
    if (pendingFit) return
    pendingFit = requestAnimationFrame(() => {
      pendingFit = 0
      try {
        fitAddon?.fit()
      } catch {
        // Container sizing can be transient during a fast open/resize — the next observer tick
        // (or the next interaction) will retry. Swallowing is correct, not a lost fit.
      }
    })
  }

  async function start(): Promise<void> {
    if (started || spawning() || !containerRef) return
    setSpawning(true)
    started = true
    try {
      // untrack: the start effect must react only to isTerminalOpen(), not to the background-poll-
      // driven sessions array (selectedSession is a memo over sessions()), otherwise every poll
      // tick re-runs the effect. The cwd is captured once, at first open.
      const cwd = untrack(() => selectedSession()?.projectPath ?? '')
      const result = await window.navik.terminal.create({ cwd, cols: 80, rows: 24 })
      if ('error' in result) {
        started = false
        showToast(result.error, true)
        return
      }
      setTerminalId(result.id)
      setExited(false)

      term = new Terminal({
        fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
        fontSize: 12.5,
        lineHeight: 1.25,
        cursorBlink: true,
        scrollback: 5000,
        theme: terminalTheme()
      })
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef)

      term.onData((data) => {
        const id = terminalId()
        if (id) window.navik.terminal.input(id, data)
      })
      // fit() changes cols/rows, which fires this — so the pty is always told the dimensions xterm
      // actually rendered at, no separate send needed.
      term.onResize(({ cols, rows }) => {
        const id = terminalId()
        if (id) window.navik.terminal.resize(id, cols, rows)
      })

      scheduleFit()
      // First-open focus: the focus-on-open effect below fires before start() has created the xterm
      // (create is async), so its term?.focus() no-ops on the very first toggle. Grab focus once the
      // terminal actually exists.
      if (isTerminalOpen()) term.focus()
    } catch (err) {
      // create() rejecting unexpectedly would otherwise leave started=true with no terminal, the
      // lazy effect never re-running — stranding the panel. Reset so the next open/restart retries.
      started = false
      showToast(err instanceof Error ? err.message : String(err), true)
    } finally {
      setSpawning(false)
    }
  }

  // Lazily spawn the pty + xterm the first time the panel opens.
  createEffect(() => {
    if (isTerminalOpen()) void start()
  })

  // Focus the terminal only on the false→true transition. Refits are handled by the ResizeObserver
  // below — wiring a refit onto this effect too would yank focus to the terminal on every height
  // change, including mid-drag of the sash.
  createEffect(() => {
    const open = isTerminalOpen()
    if (!open) {
      wasOpen = false
      return
    }
    const justOpened = !wasOpen
    wasOpen = true
    if (justOpened) requestAnimationFrame(() => term?.focus())
  })

  // One observer covers every resize source: sash drag (CSS var changes the grid track height),
  // window resize, and the open/close display transition (0↔N px). rAF-coalesced so a continuous
  // drag yields one fit per frame rather than a flood. Observed in onMount — containerRef isn't
  // bound until the JSX ref runs during render, which hasn't happened at component-body scope.
  const resizeObserver = new ResizeObserver(() => {
    if (!isTerminalOpen()) return
    scheduleFit()
  })
  onMount(() => {
    if (containerRef) resizeObserver.observe(containerRef)
  })

  // Output streams for the lifetime of the panel, filtered to the current pty id. Subscribed once
  // (not per-start) so a kill+restart reuses the same listener against the freshly-set id.
  const offData = window.navik.terminal.onData(({ id, data }) => {
    if (id === terminalId()) term?.write(data)
  })
  const offExit = window.navik.terminal.onExit(({ id, exitCode }) => {
    if (id !== terminalId()) return
    setExited(true)
    term?.write(`\x1b[90m\r\n[process exited with code ${exitCode}]\x1b[0m\r\n`)
  })

  // Restart button: kill the current shell and spawn a fresh one in its place. With a single-
  // terminal panel, a plain kill would strand the user on a blank, dead panel whose only recovery
  // is close+reopen. (A natural exit — the user typing `exit` — is different: onExit just marks
  // `exited` and leaves the read-out visible; the restart button is still how you get a new shell
  // afterward.) start() refocuses the new terminal when it's done.
  async function restart(): Promise<void> {
    const id = terminalId()
    if (id) await window.navik.terminal.kill(id)
    term?.dispose()
    term = undefined
    fitAddon = undefined
    setTerminalId(null)
    setExited(false)
    started = false
    // If the panel is somehow closed by the time we get here, don't speculatively spawn — the next
    // open will. Otherwise hand the user a fresh prompt immediately.
    if (isTerminalOpen()) void start()
  }

  function clear(): void {
    term?.clear()
    // Clear is a click on a toolbar button, so focus lands on the button afterward — pull it back
    // to the terminal so the next keystroke goes to the shell, not the button.
    term?.focus()
  }

  function handleZenClick(): void {
    toggleTerminalZen()
    // The click left focus on the toolbar button; hand it back to the terminal so commands keep
    // going to the shell without a second click.
    term?.focus()
  }

  onCleanup(() => {
    offData()
    offExit()
    if (pendingFit) cancelAnimationFrame(pendingFit)
    resizeObserver.disconnect()
    term?.dispose()
  })

  return (
    <div class="terminal-pane">
      <div class="terminal-toolbar">
        <span class="terminal-title">TERMINAL</span>
        <div class="terminal-toolbar-spacer" />
        <button type="button" class="terminal-tool-btn" title="Clear" onClick={clear} disabled={exited()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M5 4l.7 8.2a1 1 0 0 0 1 .8h2.6a1 1 0 0 0 1-.8L11 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="terminal-tool-btn danger" title="Restart terminal" disabled={spawning()} onClick={() => void restart()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.66-4.02" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            <path d="M13.6 1.7v3.3h-3.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          class="terminal-tool-btn"
          classList={{ active: isTerminalZen() }}
          title={isTerminalZen() ? 'Reset — exit zen mode' : 'Maximize — enter zen mode and hide the sidebar and transcript'}
          onClick={handleZenClick}
        >
          <Show
            when={!isTerminalZen()}
            fallback={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 2.5V6H2.5M10 2.5V6H13.5M10 13.5V10H13.5M6 13.5V10H2.5"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            }
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </Show>
        </button>
        <button type="button" class="terminal-tool-btn" title="Close panel (Ctrl+`)" onClick={() => closeTerminalPanel()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="terminal-container" ref={containerRef} />
    </div>
  )
}

// Fixed dark terminal theme regardless of the active app theme. Terminals read as "dark" even in
// light-mode editors (VS Code's default), and a fixed palette sidesteps per-theme ANSI-color
// clashes — only the cursor is tinted with the app accent to tie it in.
function terminalTheme(): ITheme {
  const accent = readVar('--accent', '#5b8cff')
  return {
    background: '#0b0d12',
    foreground: '#d7dae0',
    cursor: accent,
    cursorAccent: '#0b0d12',
    selectionBackground: 'rgba(91, 140, 255, 0.25)',
    black: '#000000',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e5e7eb',
    brightBlack: '#6b7280',
    brightRed: '#fca5a5',
    brightGreen: '#6ee7b7',
    brightYellow: '#fcd34d',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff'
  }
}

function readVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}
