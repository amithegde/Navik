import { createSignal } from 'solid-js'
import type { UsageResult } from '@shared/usage-types'

export const [usageResult, setUsageResult] = createSignal<UsageResult | null>(null)
export const [usageLoading, setUsageLoading] = createSignal(false)

let inFlight: Promise<void> | null = null

/** Fetches the latest usage from the main process. Dedups concurrent calls onto a single in-flight
 * request so a double-click on Refresh doesn't fire two hits. */
export function refreshUsage(): Promise<void> {
  if (inFlight) return inFlight
  setUsageLoading(true)
  const p = window.navik.usage
    .get()
    .then((result) => {
      setUsageResult(result)
    })
    .finally(() => {
      setUsageLoading(false)
      inFlight = null
    })
  inFlight = p
  return p
}

/** Pulls usage once on startup. Called from App.tsx's onMount, like the other init*Store functions. */
export function initUsageStore(): void {
  void refreshUsage()
}
