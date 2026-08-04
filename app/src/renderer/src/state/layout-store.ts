import { createSignal } from 'solid-js'

export const [isZenMode, setIsZenMode] = createSignal(false)

export function toggleZenMode(): void {
  setIsZenMode((v) => !v)
}
