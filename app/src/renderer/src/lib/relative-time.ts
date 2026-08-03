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
