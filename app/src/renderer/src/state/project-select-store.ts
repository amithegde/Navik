import { createSignal } from 'solid-js'

const [isOpen, setIsOpen] = createSignal(false)

export function openProjectSelectModal(): void {
  setIsOpen(true)
}

export function closeProjectSelectModal(): void {
  setIsOpen(false)
}

export { isOpen as projectSelectModalOpen }
