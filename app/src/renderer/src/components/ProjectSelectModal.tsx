import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { projects, setProjectFilter } from '../state/sessions-store'
import { startNewSessionInProject } from '../state/live-conversation-store'
import { closeProjectSelectModal, projectSelectModalOpen } from '../state/project-select-store'

export default function ProjectSelectModal() {
  let frameRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined
  let rowRefs: (HTMLButtonElement | undefined)[] = []
  const [pathInput, setPathInput] = createSignal('')
  // Logical keyboard cursor over a single ring: 0..N-1 select a known project, N lands focus on
  // the new-path input. Up/Down wrap end-to-end, so holding either arrow eventually cycles the
  // input into focus and back — same loop the quick model/effort switcher uses.
  const [cursor, setCursor] = createSignal(0)

  const textBoxPos = (): number => projects().length

  createEffect(() => {
    if (!projectSelectModalOpen()) return
    setPathInput('')
    setCursor(0)
    // Defer past the Solid flush: this effect can run before the <Show> that mounts the frame has
    // committed its DOM, in which case frameRef/inputRef are still undefined and a synchronous
    // focus() is a no-op — leaving focus on whatever opened the modal, so arrow keys never reach
    // the frame's onKeyDown. The microtask lands after the frame is mounted.
    queueMicrotask(() => {
      if (projectSelectModalOpen()) focusCursor()
    })
  })

  // While open, keep DOM focus inside the modal so arrow keys always reach the frame's handler —
  // if focus escaped to the composer textarea, keystrokes would type into the draft instead.
  createEffect(() => {
    if (!projectSelectModalOpen()) return
    const reclaim = (e: FocusEvent): void => {
      const frame = frameRef
      if (!frame) return
      const target = e.target as HTMLElement | null
      if (target && !frame.contains(target)) frame.focus()
    }
    document.addEventListener('focusin', reclaim, true)
    onCleanup(() => document.removeEventListener('focusin', reclaim, true))
  })

  // Keep the highlighted row scrolled into view as the cursor moves.
  createEffect(() => {
    const c = cursor()
    queueMicrotask(() => {
      if (c < textBoxPos()) rowRefs[c]?.scrollIntoView({ block: 'nearest' })
    })
  })

  // Known projects use their canonical, already-discovered path, so filtering the sidebar to it
  // is safe. A freshly typed path skips that — it hasn't round-tripped through the CLI's own
  // `cwd` yet, and that may not byte-for-byte match what the user typed (separators, casing),
  // which would leave the sidebar filter silently stuck on a project nothing matches.
  const startKnownProject = (projectPath: string): void => {
    setProjectFilter(projectPath)
    startNewSessionInProject(projectPath)
    closeProjectSelectModal()
  }

  const startNewProject = (rawPath: string): void => {
    const trimmed = rawPath.trim()
    if (!trimmed) return
    startNewSessionInProject(trimmed)
    closeProjectSelectModal()
  }

  function focusCursor(): void {
    if (cursor() === textBoxPos()) inputRef?.focus()
    else frameRef?.focus()
  }

  function move(delta: number): void {
    const n = textBoxPos() + 1
    if (n <= 1) return
    setCursor((c) => (c + delta + n) % n)
    focusCursor()
  }

  function onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Enter': {
        e.preventDefault()
        const c = cursor()
        const list = projects()
        if (c < list.length) startKnownProject(list[c].path)
        else startNewProject(pathInput())
        break
      }
      case 'Escape':
        e.preventDefault()
        closeProjectSelectModal()
        break
    }
  }

  const onSubmit = (e: SubmitEvent): void => {
    e.preventDefault()
    startNewProject(pathInput())
  }

  // Refocuses the text input after picking so a follow-up Enter submits the form — the browse
  // button is left focused after its own click, and Enter on a focused type="button" re-triggers
  // that button rather than the form's submit. Keep the cursor in sync with where focus lands.
  const browse = async (): Promise<void> => {
    const picked = await window.navik.projects.pickFolder()
    if (picked) setPathInput(picked)
    setCursor(textBoxPos())
    inputRef?.focus()
  }

  return (
    <Show when={projectSelectModalOpen()}>
      <div class="project-select-overlay" onClick={() => closeProjectSelectModal()} />
      <div class="project-select-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
        <div class="project-select-head">
          <span class="project-select-title">Select a project</span>
          <button type="button" class="icon-btn" title="Close (Esc)" onClick={() => closeProjectSelectModal()}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <Show when={projects().length > 0}>
          <div class="project-select-list">
            <For each={projects()}>
              {(project, i) => (
                <button
                  type="button"
                  tabindex="-1"
                  class="project-select-row"
                  classList={{ active: i() === cursor() }}
                  title={project.path}
                  ref={(el) => (rowRefs[i()] = el)}
                  onClick={() => startKnownProject(project.path)}
                >
                  <span class="project-select-row-name">{project.displayName}</span>
                  <span class="chip-count">{project.sessionCount}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={projects().length === 0}>
          <div class="project-select-empty">No projects yet — start one below.</div>
        </Show>

        <form class="project-select-form" onSubmit={onSubmit}>
          <span class="project-select-form-label">Or start a new project</span>
          <div class="project-select-form-row">
            <input
              ref={inputRef}
              class="project-select-input"
              type="text"
              placeholder="Directory path…"
              value={pathInput()}
              onInput={(e) => setPathInput(e.currentTarget.value)}
              onFocus={() => setCursor(textBoxPos())}
            />
            <button type="button" class="icon-btn" title="Browse for a folder" onClick={() => void browse()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.4l1.2 1.5H12.5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button type="submit" class="icon-btn icon-btn-lg" title="Start session" disabled={!pathInput().trim()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </Show>
  )
}
