import { createEffect, createSignal, For, Show } from 'solid-js'
import { projects, setProjectFilter } from '../state/sessions-store'
import { startNewSessionInProject } from '../state/live-conversation-store'
import { closeProjectSelectModal, projectSelectModalOpen } from '../state/project-select-store'

export default function ProjectSelectModal() {
  let frameRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined
  const [pathInput, setPathInput] = createSignal('')

  createEffect(() => {
    if (projectSelectModalOpen()) {
      setPathInput('')
      frameRef?.focus()
    }
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

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeProjectSelectModal()
  }

  const onSubmit = (e: SubmitEvent): void => {
    e.preventDefault()
    startNewProject(pathInput())
  }

  // Refocuses the text input after picking so a follow-up Enter submits the form — the browse
  // button is left focused after its own click, and Enter on a focused type="button" re-triggers
  // that button rather than the form's submit.
  const browse = async (): Promise<void> => {
    const picked = await window.navik.projects.pickFolder()
    if (picked) setPathInput(picked)
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
              {(project) => (
                <button type="button" class="project-select-row" title={project.path} onClick={() => startKnownProject(project.path)}>
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
