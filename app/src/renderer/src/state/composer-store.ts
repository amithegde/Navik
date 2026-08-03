import { createEffect, createSignal } from 'solid-js'
import { selectedSessionId } from './sessions-store'
import type { ImageAttachment } from '@shared/transcript-types'

// Deliberately persists across session switches (including to Home and back) — a stray sentence
// left in the box is a far smaller mistake than losing a half-typed message.
export const [draftText, setDraftText] = createSignal('')

// Pasted images and the command menu are per-session composer state — cleared on any switch.
export const [pendingImages, setPendingImages] = createSignal<ImageAttachment[]>([])
export const [imagePreview, setImagePreview] = createSignal<ImageAttachment | null>(null)
export const [commandMenuOpen, setCommandMenuOpen] = createSignal(false)
export const [commandMenuIndex, setCommandMenuIndex] = createSignal(0)

let pendingImagesSessionId: string | null = null

/** Must be called once from a component with an active reactive root (App.tsx's onMount) — a
 * bare module-level createEffect would run outside any root and never get tracked for disposal. */
export function initComposerStore(): void {
  createEffect(() => {
    const id = selectedSessionId()
    if (id !== pendingImagesSessionId) {
      setPendingImages([])
      setImagePreview(null)
      setCommandMenuOpen(false)
      pendingImagesSessionId = id
    }
  })
}

export function removePendingImage(index: number): void {
  setPendingImages((current) => (index < 0 || index >= current.length ? current : current.filter((_, i) => i !== index)))
}
