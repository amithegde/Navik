import { createSignal } from 'solid-js'

export const [toastMessage, setToastMessage] = createSignal<string | null>(null)
export const [toastIsError, setToastIsError] = createSignal(false)

let dismissTimer: ReturnType<typeof setTimeout> | null = null

export function showToast(message: string, isError = false): void {
  setToastMessage(message)
  setToastIsError(isError)

  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = setTimeout(() => setToastMessage(null), 4_000)
}

export function dismissToast(): void {
  if (dismissTimer) clearTimeout(dismissTimer)
  setToastMessage(null)
}
