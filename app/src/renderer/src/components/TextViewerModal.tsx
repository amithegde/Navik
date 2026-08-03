import { createEffect, Show } from 'solid-js'
import type { TextViewerRequest } from './TranscriptTurnView'

export default function TextViewerModal(props: { view: TextViewerRequest | null; onClose: () => void; onCopy: (text: string) => void }) {
  let frameRef: HTMLDivElement | undefined

  // Focus the modal frame, not the textarea — focusing a textarea puts the caret at the end and
  // scrolls it to the tail.
  createEffect(() => {
    if (props.view) frameRef?.focus()
  })

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') props.onClose()
  }

  return (
    <Show when={props.view}>
      {(view) => (
        <>
          <div class="text-viewer-overlay" onClick={() => props.onClose()} />
          <div class="text-viewer-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
            <div class="text-viewer-head">
              <div class="text-viewer-titles">
                <span class="text-viewer-title">{view().title}</span>
                <span class="text-viewer-subtitle">{view().subtitle}</span>
                <span class="text-viewer-size">{view().text.length.toLocaleString('en-US')} chars</span>
              </div>
              <div class="text-viewer-actions">
                <button type="button" class="btn subtle" title="Copy the full text" onClick={() => props.onCopy(view().text)}>
                  Copy
                </button>
                <button type="button" class="icon-btn" title="Close (Esc)" onClick={() => props.onClose()}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <textarea class="text-viewer-body" readonly spellcheck={false} value={view().text} />
          </div>
        </>
      )}
    </Show>
  )
}
