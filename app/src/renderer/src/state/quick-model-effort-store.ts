import { createSignal } from 'solid-js'

const [isOpen, setIsOpen] = createSignal(false)

export function openQuickModelEffort(): void {
  setIsOpen(true)
}

export function closeQuickModelEffort(): void {
  setIsOpen(false)
}

export { isOpen as quickModelEffortOpen }
