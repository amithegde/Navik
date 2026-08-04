import { createSignal, For, Show } from 'solid-js'
import { editorAvailability, openInEditor } from '../state/editor-store'
import { showToast } from '../state/toast-store'
import type { EditorKind } from '@shared/editor-types'

interface EditorOption {
  kind: EditorKind
  label: string
}

function editorLabel(kind: EditorKind): string {
  return kind === 'vscode-insiders' ? 'VS Code Insiders' : 'VS Code'
}

export default function EditorButton(props: { folderPath: string }) {
  const [open, setOpen] = createSignal(false)

  const options = (): EditorOption[] => {
    const avail = editorAvailability()
    const opts: EditorOption[] = []
    if (avail.vscode) opts.push({ kind: 'vscode', label: 'VS Code' })
    if (avail.vscodeInsiders) opts.push({ kind: 'vscode-insiders', label: 'VS Code Insiders' })
    return opts
  }

  // The saved preference can name an editor that isn't actually installed on this machine (e.g. a
  // settings file carried over from elsewhere) — fall back to whichever was actually found.
  const activeEditor = (): EditorKind | null => {
    const avail = editorAvailability()
    const opts = options()
    if (opts.length === 0) return null
    return opts.some((o) => o.kind === avail.preferred) ? avail.preferred : opts[0].kind
  }

  async function launch(kind: EditorKind): Promise<void> {
    setOpen(false)
    const result = await openInEditor(kind, props.folderPath)
    if (!result.success) showToast(result.error ?? `Failed to open in ${editorLabel(kind)}.`, true)
  }

  return (
    <Show when={activeEditor()}>
      {(active) => (
        <div class="editor-picker">
          <button
            type="button"
            class="transcript-tool-btn"
            title={`Open this project in ${editorLabel(active())}`}
            onClick={() => void launch(active())}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <Show when={options().length > 1}>
            <button type="button" class="editor-picker-caret" title="Choose an editor" onClick={() => setOpen(!open())}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                <path d="M3 5.5l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <Show when={open()}>
              <div class="theme-menu-overlay" onClick={() => setOpen(false)} />
              <div class="editor-menu">
                <For each={options()}>
                  {(opt) => (
                    <button
                      type="button"
                      class="editor-option"
                      classList={{ active: opt.kind === active() }}
                      onClick={() => void launch(opt.kind)}
                    >
                      {opt.label}
                      <Show when={opt.kind === active()}>
                        <span class="editor-option-check">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      )}
    </Show>
  )
}
