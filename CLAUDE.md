# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Commands

```
.\build.ps1                          # npm install + typecheck + build — build.cmd on cmd.exe
.\build.ps1 -Clean                   # wipe node_modules/out first
.\run.ps1                            # dev mode with hot reload — run.cmd on cmd.exe
.\run.ps1 -NoBuild                   # relaunch the last build without rebuilding
.\publish.ps1                        # package navik.exe (NSIS installer + portable) — publish.cmd on cmd.exe

cd app
npm run typecheck
npm run build
npm run dev
npm run dist:win
```

`app/` is an Electron + TypeScript + SolidJS app. Built and run on Windows; macOS/Linux packaging
(`npm run dist:mac` / `dist:linux`) is configured but unverified on those platforms.

Env vars: `CLAUDE_CONFIG_DIR` (override `~/.claude`), `CLAUDE_NAVIK_CLI_PATH` (override the
resolved `claude` executable).

## Architecture

Three layers under `app/src/`: `main/` (Electron main process, Node — no UI), `preload/`
(the `contextBridge` surface exposed to the renderer; the renderer has no direct Node/Electron
access), `renderer/` (SolidJS UI). `shared/` holds types and IPC channel-name constants used by
all three.

- Session discovery (`main/session-discovery.ts`) reads only what Claude Code already writes to
  `~/.claude` (`projects/*.jsonl`, `history.jsonl`, `sessions/*.json`) — there's no separate
  database.
- Two ways this app drives `claude.exe`: `main/claude-launcher.ts` opens an external terminal
  (fallback only, no in-app control; cross-platform — Windows Terminal/cmd, macOS Terminal.app,
  common Linux emulators); `main/claude-live-session.ts` runs `claude -p --input-format
  stream-json --output-format stream-json` as a long-lived subprocess and is the primary
  mechanism.
- `main/claude-model-catalog.ts` starts a third kind of `claude` process: a throwaway one sent the
  `initialize` control request purely to read back the account's selectable models (what the model
  picker shows). It sends no user message, so it costs nothing and writes no transcript — but it
  needs the same `--verbose` flag that `--output-format stream-json` requires everywhere else.
- Both model and permission mode reach the CLI two ways: a flag at launch (`--model`,
  `--permission-mode`), and a control request for a session that's already running
  (`ClaudeLiveSession.setModel`/`setPermissionMode`, the `set_model`/`set_permission_mode`
  subtypes). The CLI can reject a mid-session `set_permission_mode` for modes gated by settings
  (e.g. `bypassPermissions`) — surfaces as a rejected promise; the caller rolls the picker back.
- `main/claude-turn-parser.ts` is shared between transcript-file reading and live-session stdout
  parsing — both emit the same JSON shape, so don't fork this logic per-consumer.
- `main/live-sessions.ts`: a new session gets a locally-generated placeholder id until the CLI
  reports its real session id (the swap is emitted as a `sessionRowChanged` event carrying
  `previousKey`). `main/sessions-state.ts`'s background poll must skip any session
  `liveSessionManager.isLiveAndRunning()` reports as already live-driven, or the poll will
  overwrite an app-driven live session's running status — check git history before touching
  either path; this exact class of bug is why the guard exists.
- Renderer state lives in small `renderer/src/state/*-store.ts` modules (SolidJS signals at
  module scope) rather than one big store — `sessions-store`, `live-conversation-store`,
  `composer-store`, `catalog-store`, `toast-store`. Each exposes an `init*Store()` that must be
  called once from a component with an active reactive root (`App.tsx`'s `onMount`) — a bare
  module-level `createEffect` outside a root never gets tracked for disposal.
- IPC channels are named in `shared/ipc-channels.ts` and must be wired in three places: the
  constant there, `ipcMain.handle`/`.on` in `main/index.ts`, and the typed wrapper in
  `preload/index.ts` — missing any one fails silently or throws at the call site.

## Git commits

- Never include a `Co-Authored-By` trailer in commit messages.

## Complex tasks

- For multi-step, uncertain, or verification-heavy work, use the `app-discipline` skill before
  diving in.

## Code review

- Mandatory: after implementing a feature or fix, before declaring it done, run the
  `perform-code-review` skill on the change.

## Build warnings

- `npm run typecheck` and `npm run build` must be clean before a change is considered done. Don't
  work around a type error with an `any` cast or a `@ts-ignore` — fix what it's pointing at, or
  ask the user before suppressing if it's a genuine false positive.

## Verification

- There is no automated test suite yet. A clean typecheck/build is not verification — real bugs
  in this codebase have shipped clean through both and only surfaced when actually run against the
  real `claude` CLI or driven through the UI (a live-session control response silently discarded
  because of a readline event-ordering race, `sendDraft` returning success without ever sending the
  message, a JSX nesting bug that only broke layout, not compilation — see git history). Prefer
  driving the real app — the `run` skill's Playwright pattern for the UI, or a throwaway Node
  script bundled with `esbuild` for main-process-only logic — over reasoning from the diff alone.
- This shell's environment may have `ELECTRON_RUN_AS_NODE=1` set (inherited from a
  VSCode/Electron-hosted harness). Under that, `electron.exe` runs as plain Node and
  `require('electron')` silently returns a path string instead of the real API — unset it before
  launching Electron for verification, or `app`/`BrowserWindow` usage fails in confusing ways.
