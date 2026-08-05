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

function VsCodeMark(props: { size: number }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M29.01,5.03,23.244,2.254a1.742,1.742,0,0,0-1.989.338L2.38,19.8A1.166,1.166,0,0,0,2.3,21.447c.025.027.05.053.077.077l1.541,1.4a1.165,1.165,0,0,0,1.489.066L28.142,5.75A1.158,1.158,0,0,1,30,6.672V6.605A1.748,1.748,0,0,0,29.01,5.03Z"
        fill="#0065a9"
      />
      <path
        d="M29.01,26.97l-5.766,2.777a1.745,1.745,0,0,1-1.989-.338L2.38,12.2A1.166,1.166,0,0,1,2.3,10.553c.025-.027.05-.053.077-.077l1.541-1.4A1.165,1.165,0,0,1,5.41,9.01L28.142,26.25A1.158,1.158,0,0,0,30,25.328V25.4A1.749,1.749,0,0,1,29.01,26.97Z"
        fill="#007acc"
      />
      <path
        d="M23.244,29.747a1.745,1.745,0,0,1-1.989-.338A1.025,1.025,0,0,0,23,28.684V3.316a1.024,1.024,0,0,0-1.749-.724,1.744,1.744,0,0,1,1.989-.339l5.765,2.772A1.748,1.748,0,0,1,30,6.6V25.4a1.748,1.748,0,0,1-.991,1.576Z"
        fill="#1f9cf0"
      />
    </svg>
  )
}

function VsCodeInsidersMark(props: { size: number }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M29.01,5.03,23.244,2.254a1.742,1.742,0,0,0-1.989.338L2.38,19.8A1.166,1.166,0,0,0,2.3,21.447c.025.027.05.053.077.077l1.541,1.4a1.165,1.165,0,0,0,1.489.066L28.142,5.75A1.158,1.158,0,0,1,30,6.672V6.605A1.748,1.748,0,0,0,29.01,5.03Z"
        fill="#16825d"
      />
      <path
        d="M29.01,26.97l-5.766,2.777a1.745,1.745,0,0,1-1.989-.338L2.38,12.2A1.166,1.166,0,0,1,2.3,10.553c.025-.027.05-.053.077-.077l1.541-1.4A1.165,1.165,0,0,1,5.41,9.01L28.142,26.25A1.158,1.158,0,0,0,30,25.328V25.4A1.749,1.749,0,0,1,29.01,26.97Z"
        fill="#1fae74"
      />
      <path
        d="M23.244,29.747a1.745,1.745,0,0,1-1.989-.338A1.025,1.025,0,0,0,23,28.684V3.316a1.024,1.024,0,0,0-1.749-.724,1.744,1.744,0,0,1,1.989-.339l5.765,2.772A1.748,1.748,0,0,1,30,6.6V25.4a1.748,1.748,0,0,1-.991,1.576Z"
        fill="#37bb91"
      />
    </svg>
  )
}

function EditorMark(props: { kind: EditorKind; size: number }) {
  return props.kind === 'vscode-insiders' ? (
    <VsCodeInsidersMark size={props.size} />
  ) : (
    <VsCodeMark size={props.size} />
  )
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
            <EditorMark kind={active()} size={16} />
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
                      <EditorMark kind={opt.kind} size={16} />
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
