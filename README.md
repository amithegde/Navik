# Navik

A cross-platform desktop app for keeping track of multiple [Claude Code](https://claude.com/claude-code)
sessions: what's currently running across the machine, and what happened in past sessions — without
digging through `~/.claude` by hand.

Built with Electron, TypeScript, and SolidJS. Targets Windows, macOS, and Linux.

## Layout

```
app/
  src/main/       Electron main process (Node).
  src/preload/    contextBridge surface exposed to the renderer (no nodeIntegration in the renderer).
  src/renderer/   SolidJS UI.
  src/shared/     Types and IPC channel names shared between main/preload/renderer.
```

## Building and running

```
.\build.ps1               # or build.cmd — npm install + typecheck + build
.\build.ps1 -Clean        # wipe node_modules/out first

.\run.ps1                 # or run.cmd — dev mode with hot reload
.\run.ps1 -NoBuild         # relaunch the last .\build.ps1 output without rebuilding
```
