---
name: perform-code-review
description: MANDATORY AFTER IMPLEMENTING A CHANGE, BEFORE DECLARING IT DONE. Principal-engineer review of a diff - scope it, hunt Navik's known-defect lanes, adversarially kill every candidate, then report ranked evidence-backed findings. Also use when asked to review a branch, a commit range, or "check my change".
model: opus
---

# Code review

A review's value is **confirmed defects divided by claims made**. A plausible finding that turns
out wrong costs more than a missed nit. So: **hunt wide, verify hard, report narrow.**

1. **No claim without a traced path** - name the input/state producing the wrong output and the
   lines it flows through, or you have no finding.
2. **No filler** - never write "no issues found here." Silence on a lane is the report.
3. **Execute over speculate** - build it, run it, grep the call sites, cite the output. Reviews
   that read code and guess are the ones that are wrong.

No effort estimates, ever. State what/why/where; the user prioritizes.

## The loop: five gates, in order

A gate must pass before the next opens. When a result surprises you, name the gate you're at and
re-run it.

### Gate 1 - Scope

Resolve the review target and **state it in one line before reviewing**: explicit user argument
(paths, `HEAD~3..HEAD`, branch) -> staged changes if `git diff --cached --stat` is non-empty ->
else the branch's whole change (`git diff $(git merge-base HEAD main)..HEAD` plus uncommitted
work, say both are included) -> nothing anywhere: stop and ask.

- Unchanged code is context, not a target - report against it only if the diff breaks it.
- Read every changed line at least once, no sampling. Past ~2000 changed lines, say so and review
  in file-groups.

### Gate 2 - Evidence: build the map before judging

- `git diff <target> -U15` - the default 3 lines hides the guard that already handles your
  "missing null check."
- Read the whole enclosing module/component of every hunk, not just the hunk.
- **Every changed function signature -> grep all call sites** (return type, new param, nullability,
  rename).
- **Every new IPC channel -> is it wired in all three places?** The name constant in
  `shared/ipc-channels.ts`, `ipcMain.handle`/`.on` in `main/index.ts`, and the typed wrapper in
  `preload/index.ts` — a channel missing any one of these fails silently or throws at the call
  site. A new `renderer/src/state/*-store.ts` module needs its `init*Store()` actually called from
  `App.tsx`'s `onMount`, or its effects never run.
- `git log --oneline -8 -- <most-changed-file>` - a change that re-opens a recently fixed bug is
  the highest-value finding available.

### Gate 3 - Hunt the lanes

Walk these, skip any the diff cannot touch, spend the budget where the diff is.

**L1 Correctness delta.** Per hunk: which input now produces a different result, and is that the
intent? Off-by-one, null/undefined, path/casing on Windows vs. POSIX, an `await` that should have
been there and isn't (or an extra one that reorders side effects).

**L2 Inert mechanism.** For any new guard, condition, or timer: can it actually fire? Is the arm
implied by or contradicted by the fire condition? Does any real input reach it?

**L3 Live-session lifecycle & async races.** This is where Navik's real bugs live (see
[CLAUDE.md](../../../CLAUDE.md) and git history). Specific, already-hit failure modes to check for:
- The placeholder-id -> real-session-id swap in `live-sessions.ts`, and the poll guard in
  `sessions-state.ts` (`liveSessionManager.isLiveAndRunning()`) — does a change to either risk the
  other overwriting an app-driven live session's running status?
- A reference to renderer/main-process state (a session object, a signal's current value) held
  across an `await`, then mutated afterward — if the underlying collection can be reassigned
  during that gap (a refresh, a push event), the mutation lands on an object no longer reachable
  from the live state and is silently lost. (Exact precedent: `sessions-state.ts`'s `stopSession`
  held a stale session reference across `stopRunningSession`'s async kill+verify.)
- A function that resumes/starts a subprocess or IPC action and returns success *before* the
  actual follow-up action it exists to perform. (Exact precedent: `sendDraft` returned right after
  a successful resume, never reaching the `sendMessage` call below it — the resumed session's
  first message silently vanished.)
- A subprocess's stdin/stdout handling - could a write race a process exit, or a read block
  forever on no output (stderr not drained)?

**L4 Wire-shape & event-ordering contract.** `claude-turn-parser.ts` is shared between
transcript-file reads and live-session stdout - a change to handle one `"assistant"`/`"user"`
shape must stay correct for both. A new field assumed present in `~/.claude` output that
older/newer CLI versions may not emit. For anything resolving a `Promise` from more than one event
handler (e.g. a `readline` `'line'` handler racing its own `'close'` handler): the **first**
`resolve()` call wins regardless of which handler looks like it "should" run first - closing a
resource before resolving with its result can hand the win to a fallback `resolve(null)` that
fires as a side effect of the close. (Exact precedent: `claude-model-catalog.ts`'s probe silently
returned the fallback model list every time because of exactly this ordering.)

**L5 SolidJS reactivity.** A signal only triggers a re-render through its setter or a full value
replacement - mutating a signal's held object/array in place is invisible to Solid. `createEffect`/
`createMemo` created outside an active component/root (e.g. bare module-level code) never gets
tracked for disposal - it must run from an `init*Store()` called inside a mounted component. JSX
nesting is defined by where closing tags actually land, not by source indentation - a misplaced
close compiles clean and only shows up as a visual bug. `<Show>`'s child callback receives an
accessor; the underlying DOM subtree is **not** destroyed/recreated just because the tracked value
changes while staying truthy - a component-local `let` cache (e.g. a bound-element reference) can
go stale across such a switch if not explicitly guarded by comparing the element reference.

**L6 Live verification, not just typecheck.** Does a way exist to actually exercise this change
(a smoke script against the real `claude` CLI, a Playwright-driven click) rather than only
`npm run typecheck`/`build`? There is no automated test suite - "it typechecks" has previously
shipped a live-session bug, a silently-dropped message, and a layout bug, all clean through both
`tsc` and a build. If the change touches `main/` process logic with no UI surface, a throwaway
script bundled with `esbuild --bundle --platform=node --format=cjs` and run via
`node_modules/electron/dist/electron.exe` (with `ELECTRON_RUN_AS_NODE` unset) is the fast path.

**L7 Idioms & hygiene.** No `any` used to paper over a type mismatch instead of fixing the shared
type in `shared/`. No back-compat shims (aliases, stubs, re-exports, commented-out code); comments
explain *why*, not what. `main/` never imports from `renderer/` or touches DOM APIs; `renderer/`
never imports Node/Electron APIs directly - everything crosses the boundary through the typed
`window.navik.*` surface in `preload/index.ts`.

**L8 Negative space.** What the diff *should* have contained and didn't: an un-updated caller, a
new IPC channel missing its `preload` wrapper, a config default, a doc that's now stale.

### Gate 4 - Kill every candidate

Every candidate must survive an attempt to kill it before it becomes a finding.

1. Re-read the whole path, caller through callee - not the diff excerpt.
2. Try to refute it: handled up/downstream? Prevented by a type? Already covered by a test?
3. Write the failure sentence with real identifiers: *given `<input/state>`, execution reaches
   `<file:line>`, producing `<wrong output/exception/state>`.* Can't write it concretely -> drop
   it, don't soften it into a "consider".
4. Prove it if provable: `npm run typecheck`, a targeted smoke script for the tight loop, a grep
   that proves the call-site count.
5. **Verdict:** `CONFIRMED` (traced or executed) or `PLAUSIBLE` (say what would settle it).
   Anything weaker is deleted.

**Self-police these false positives:** "could be undefined" without checking the type actually
allows it; "not thread-safe" for something that only ever runs on Node's single event-loop thread
with no `await` in between the two operations claimed to race; flagging a settled repo convention;
restating what the code does; a finding against an untouched line; two lanes reporting one defect
- merge them.

### Gate 5 - Report calibrated

**Verdict** first: `Ship it` / `Fix first - N blocking` / `Block - <one-line reason>`.

If `ReportFindings` is available, call it once with findings ranked most-severe-first and don't
also print them as text. Otherwise render each finding as:

```
### [1] <one-line claim - the defect, not the topic>  ·  High  ·  CONFIRMED
`path/to/file.ts:120-134`  ·  lane: L3 live-session lifecycle

**Fails when:** <input/state> -> reaches <file:line> -> <wrong output/state>
**Why:** <mechanism in 1-3 sentences, real identifiers>
**Fix:** <the specific change>
```

| Severity | Means |
|---|---|
| **Critical** | Data loss/corruption, a security hole, or an inert guard (protection believed present but absent in fact). |
| **High** | Wrong behavior in a realistic scenario; silent failure; a live-session state bug from L3/L4/L5. |
| **Medium** | Correct today but fragile under a realistic near-term change; nothing exercises this change besides typecheck. |
| **Low** | Idiom/readability with a concrete cost. Cap at ~5, one line each. |

Close with **Checked and clean** (what you verified, with evidence) and **Not checked** (anything
out of reach, e.g. can't launch a real live `claude` session in this environment). Never imply
coverage you don't have.

## Standing habits

- Steelman before flagging - assume the code is that way for a reason and name the reason.
- Finding nothing is a legitimate result.
- Read-only by default - don't silently fix while reviewing; fix only when the user asks.
