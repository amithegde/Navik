import { createEffect, createMemo, For, onCleanup, onMount, Show } from 'solid-js'
import type { ClaudeCommandOption } from '@shared/transcript-types'
import {
  commandMenuIndex,
  commandMenuOpen,
  draftText,
  pendingImages,
  removePendingImage,
  setCommandMenuIndex,
  setCommandMenuOpen,
  setDraftText,
  setImagePreview,
  setPendingImages
} from '../state/composer-store'
import { availableCommands, availableModels } from '../state/catalog-store'
import { isLive, liveState, paneModel, panePermissionMode, resumingSessionId, sendDraft, setCurrentModel, setCurrentPermissionMode } from '../state/live-conversation-store'
import { selectedSession } from '../state/sessions-store'
import { showToast } from '../state/toast-store'
import { autosizeTextarea, installComposerAutosizeWidthObserver } from '../lib/composer-autosize'
import ModelPicker from './ModelPicker'
import PermissionModePicker from './PermissionModePicker'

// A slash command is only recognized as the first token of the draft — once whitespace appears,
// whatever follows is argument text, not more of the command name.
function trySlashFragment(draft: string): string | null {
  if (!draft.startsWith('/')) return null
  if (/[ \t\n]/.test(draft)) return null
  return draft.slice(1)
}

function matchesFragment(cmd: ClaudeCommandOption, fragment: string): boolean {
  if (fragment.length === 0) return true
  const lower = fragment.toLowerCase()
  return cmd.name.toLowerCase().startsWith(lower) || cmd.aliases.some((a) => a.toLowerCase().startsWith(lower))
}

function isImeComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229
}

export default function Composer() {
  let textareaRef: HTMLTextAreaElement | undefined

  const isResuming = (): boolean => resumingSessionId() === selectedSession()?.sessionId
  const isBusy = (): boolean => isLive() && liveState()!.isBusy
  const currentModel = (): string => (isLive() ? liveState()!.model : paneModel())
  const currentPermissionMode = (): string => (isLive() ? liveState()!.permissionMode : panePermissionMode())

  const filteredCommands = createMemo<ClaudeCommandOption[]>(() => {
    const fragment = trySlashFragment(draftText())
    if (fragment === null) return []
    return availableCommands().filter((c) => matchesFragment(c, fragment))
  })

  const canOpenCommandMenu = (): boolean => availableCommands().length > 0 && (draftText().length === 0 || draftText().startsWith('/'))

  const commandMenuButtonTitle = (): string => {
    if (availableCommands().length === 0) return 'Loading commands…'
    return canOpenCommandMenu() ? 'Browse commands (/compact, /clear, /effort, /model…)' : 'Clear the draft first to browse commands'
  }

  function resizeNow(): void {
    if (textareaRef) autosizeTextarea(textareaRef)
  }

  function acceptCommand(cmd: ClaudeCommandOption): void {
    setDraftText(`/${cmd.name} `)
    setCommandMenuOpen(false)
    textareaRef?.focus()
    resizeNow()
  }

  function openCommandMenu(): void {
    if (draftText().length === 0) setDraftText('/')
    setCommandMenuOpen(filteredCommands().length > 0)
    setCommandMenuIndex(0)
    textareaRef?.focus()
  }

  async function handleSend(): Promise<void> {
    const text = draftText()
    const images = pendingImages()
    if (!text.trim() && images.length === 0) return

    const session = selectedSession()
    if (!session || isResuming()) return

    setDraftText('')
    setPendingImages([])
    setCommandMenuOpen(false)
    resizeNow()

    const result = await sendDraft(text, images.length > 0 ? images : undefined, panePermissionMode(), paneModel())

    if (!result.success) {
      if (selectedSession()?.sessionId === session.sessionId) {
        setDraftText(text)
        setPendingImages(images)
      }
      showToast(result.error ?? 'Failed to start.', true)
      return
    }

    if (result.wasRunningElsewhere) showToast("Took over — don't send messages from the other window now.")
  }

  function onInput(e: InputEvent & { currentTarget: HTMLTextAreaElement }): void {
    const value = e.currentTarget.value
    setDraftText(value)
    resizeNow()
    setCommandMenuOpen(filteredCommands().length > 0)
    setCommandMenuIndex(0)
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (commandMenuOpen()) {
      const filtered = filteredCommands()
      if (filtered.length === 0) {
        setCommandMenuOpen(false)
      } else {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setCommandMenuIndex((i) => (i + 1) % filtered.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setCommandMenuIndex((i) => (i - 1 + filtered.length) % filtered.length)
          return
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
          e.preventDefault()
          acceptCommand(filtered[commandMenuIndex()])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setCommandMenuOpen(false)
          return
        }
      }
    }

    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.metaKey) return
    if (isImeComposing(e)) return
    e.preventDefault()
    void handleSend()
  }

  function onPaste(e: ClipboardEvent): void {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length === 0) return
    e.preventDefault()

    // Read serially, not in parallel, to preserve paste order.
    const readNext = (index: number): void => {
      if (index >= imageFiles.length) return
      const file = imageFiles[index]
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1)
        setPendingImages((current) => [...current, { mediaType: file.type, base64Data }])
        readNext(index + 1)
      }
      reader.readAsDataURL(file)
    }
    readNext(0)
  }

  async function attachFile(): Promise<void> {
    const session = selectedSession()
    if (!session) return

    const relative = await window.navik.sessions.pickFile(session.projectPath)
    if (!relative) return

    const mention = `@${relative} `
    setDraftText((current) => (current.length === 0 ? mention : current.trimEnd() + ' ' + mention))
    resizeNow()
  }

  onMount(() => {
    if (!textareaRef) return
    resizeNow()
    onCleanup(installComposerAutosizeWidthObserver(textareaRef))
  })

  createEffect(() => {
    draftText()
    resizeNow()
  })

  const placeholder = (): string => (isResuming() ? 'Starting…' : isBusy() ? 'Queue another message…' : 'Message Claude…')
  const sendDisabled = (): boolean => isResuming() || (!draftText().trim() && pendingImages().length === 0)

  return (
    <div class="composer">
      <Show when={commandMenuOpen() && filteredCommands().length > 0}>
        <div class="command-menu">
          <For each={filteredCommands()}>
            {(cmd, i) => (
              <button
                type="button"
                class="command-option"
                classList={{ active: i() === commandMenuIndex() }}
                title={`/${cmd.name} — ${cmd.description}`}
                onMouseEnter={() => setCommandMenuIndex(i())}
                onClick={() => acceptCommand(cmd)}
              >
                <span class="command-option-body">
                  <span class="command-option-name">/{cmd.name}</span>
                  <span class="command-option-desc">{cmd.description}</span>
                </span>
                <Show when={cmd.argumentHint}>
                  <span class="command-option-hint">{cmd.argumentHint}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={pendingImages().length > 0}>
        <div class="composer-attachments">
          <For each={pendingImages()}>
            {(image, i) => (
              <div class="composer-attachment-chip" title="Click to preview">
                <img
                  class="composer-attachment-thumb"
                  src={`data:${image.mediaType};base64,${image.base64Data}`}
                  alt="Pasted image"
                  onClick={() => setImagePreview(image)}
                />
                <button type="button" class="composer-attachment-remove" title="Remove image" onClick={() => removePendingImage(i())}>
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="composer-box">
        <textarea
          ref={textareaRef}
          class="composer-input"
          rows="1"
          value={draftText()}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder()}
          title="Enter to send, Shift+Enter for a new line. Start with / for commands. Sending while Claude is working queues the message for when it's ready. Ctrl+N starts a new session in this project."
          disabled={isResuming()}
        />
        <div class="composer-toolbar">
          <button type="button" class="composer-icon-btn" title="Reference a file by path" disabled={isResuming()} onClick={() => void attachFile()}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path
                d="M11.5 4.5l-6 6a2.5 2.5 0 0 0 3.5 3.5l6-6a4 4 0 0 0-5.5-5.5l-6 6a5.5 5.5 0 0 0 7.5 7.5"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="composer-icon-btn"
            title={commandMenuButtonTitle()}
            disabled={isResuming() || !canOpenCommandMenu()}
            onClick={openCommandMenu}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10.5 2.5l-5 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
          <PermissionModePicker value={currentPermissionMode()} disabled={isResuming()} onChange={(m) => void setCurrentPermissionMode(m)} />
          <ModelPicker value={currentModel()} options={availableModels()} disabled={isResuming()} onChange={(m) => void setCurrentModel(m)} />
          <div class="composer-toolbar-spacer" />
          <button
            type="button"
            class="composer-send-icon"
            title={isBusy() ? 'Queue message (Enter)' : 'Send (Enter)'}
            disabled={sendDisabled()}
            onClick={() => void handleSend()}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
