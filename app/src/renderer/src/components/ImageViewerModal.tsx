import { createEffect, Show } from 'solid-js'

export interface ImagePreview {
  mediaType: string
  base64Data: string
}

export default function ImageViewerModal(props: { image: ImagePreview | null; onClose: () => void }) {
  let frameRef: HTMLDivElement | undefined

  createEffect(() => {
    if (props.image) frameRef?.focus()
  })

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') props.onClose()
  }

  return (
    <Show when={props.image}>
      {(image) => (
        <>
          <div class="text-viewer-overlay" onClick={() => props.onClose()} />
          <div class="image-viewer-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
            <button type="button" class="icon-btn image-viewer-close" title="Close (Esc)" onClick={() => props.onClose()}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </button>
            <img class="image-viewer-img" src={`data:${image().mediaType};base64,${image().base64Data}`} alt="Pasted image" />
          </div>
        </>
      )}
    </Show>
  )
}
