export function formatRelativeTime(iso: string): string {
  const utc = new Date(iso)
  const spanMs = Date.now() - utc.getTime()
  const spanMinutes = spanMs / 60_000

  if (spanMinutes < 1) return 'just now'
  if (spanMinutes < 60) return `${Math.floor(spanMinutes)}m ago`
  if (spanMinutes < 60 * 24) return `${Math.floor(spanMinutes / 60)}h ago`
  if (spanMinutes < 60 * 24 * 7) return `${Math.floor(spanMinutes / (60 * 24))}d ago`

  return utc.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Absolute local date+time for table columns where relative time is less useful (e.g. history). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Time-since for an epoch-ms timestamp, second-granular for the first minute (so "updated 3s ago"
 * reads naturally next to a Refresh button). */
export function formatUpdatedAgo(epochMs: number): string {
  const spanMs = Date.now() - epochMs
  if (spanMs < 5000) return 'just now'
  const spanSeconds = spanMs / 1000
  if (spanSeconds < 60) return `${Math.floor(spanSeconds)}s ago`
  const spanMinutes = spanSeconds / 60
  if (spanMinutes < 60) return `${Math.floor(spanMinutes)}m ago`
  const spanHours = spanMinutes / 60
  if (spanHours < 24) return `${Math.floor(spanHours)}h ago`
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Countdown to a future ISO timestamp, e.g. "13h 35m". Falls back to the absolute local time for
 * anything past a week (where a countdown stops being useful). */
export function formatRemaining(iso: string): string {
  const target = new Date(iso).getTime()
  const spanMs = target - Date.now()
  if (spanMs <= 0) return 'now'
  const totalMinutes = Math.floor(spanMs / 60_000)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60) % 24
  const days = Math.floor(totalMinutes / (60 * 24))
  if (days >= 7) return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
