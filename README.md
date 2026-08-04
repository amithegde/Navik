# Navik

A cross-platform desktop app for keeping track of multiple [Claude Code](https://claude.com/claude-code)
sessions: what's currently running across the machine, and what happened in past sessions — without
digging through `~/.claude` by hand.

It reads the same on-disk state Claude Code itself writes (`~/.claude/projects`, `~/.claude/sessions`,
`~/.claude/history.jsonl`) to build a live, searchable index of every session — regardless of whether
it was started from a terminal, the VS Code extension, or this app.

New sessions and resumes run in-app: the app drives the real `claude` CLI as a subprocess over its
documented `--input-format/--output-format stream-json` interface (the same interface the VS Code
extension itself uses internally), so you get full typing and live streaming responses inside the
window — not a re-implementation of the CLI's own terminal UI, and not the VS Code extension's UI
either. A session already running elsewhere (VS Code, a terminal) can't be typed into from here, but
its transcript is polled and shown live. An "Open in terminal" fallback is available everywhere for
when you want the real CLI TUI directly.

Built with Electron, TypeScript, and SolidJS. Targets Windows, macOS, and Linux — Windows is the only
platform this has actually been built and run on so far; macOS/Linux packaging is configured but not
yet verified on those platforms.

## Layout

```
app/
  src/main/       Electron main process (Node) — session discovery, running-process detection,
                  CLI locate/launch/live-session driving, transcript parsing. No UI dependencies.
  src/preload/    contextBridge surface exposed to the renderer (no nodeIntegration in the renderer).
  src/renderer/   SolidJS UI — sidebar session browser, home view, detail pane, composer.
  src/shared/     Types and IPC channel names shared between main/preload/renderer.
  build/          App icon (multi-resolution .ico for Windows, a 256px .png for Linux).
  electron-builder.yml  Packaging config (NSIS + portable for Windows; dmg/AppImage stubs for later).
```

## Building and running

Windows:

```
.\build.ps1               # or build.cmd — npm install + typecheck + build
.\build.ps1 -Clean        # wipe node_modules/out first

.\run.ps1                 # or run.cmd — dev mode with hot reload
.\run.ps1 -NoBuild         # relaunch the last .\build.ps1 output without rebuilding
```

macOS/Linux:

```
./build.sh                 # npm install + typecheck + build
./build.sh --clean         # wipe node_modules/out first

./run.sh                   # dev mode with hot reload
./run.sh --no-build        # relaunch the last ./build.sh output without rebuilding
```

Requires Node.js and a `claude` executable discoverable on `PATH` (or under `~/.local/bin`);
override the resolved path with the `CLAUDE_NAVIK_CLI_PATH` environment variable. Points at
`~/.claude` by default; override with `CLAUDE_CONFIG_DIR`.

## Packaging

Windows:

```
.\publish.ps1                # or publish.cmd — builds navik.exe: NSIS installer + portable exe -> app/dist
.\publish.ps1 -Platform mac   # unverified
.\publish.ps1 -Platform linux # unverified
```

macOS/Linux:

```
./publish.sh                 # packages for the current OS (dmg on macOS, AppImage on Linux) -> app/dist
./publish.sh mac
./publish.sh linux
./publish.sh win              # unverified — cross-building for Windows from mac/linux
```

## Tests

No automated test suite yet for the Electron app.
