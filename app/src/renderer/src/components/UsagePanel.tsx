import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { refreshUsage, usageLoading, usageResult } from '../state/usage-store'
import { showToast } from '../state/toast-store'
import { formatRemaining, formatUpdatedAgo } from '../lib/relative-time'
import type { UsageInfo, UsageLimitBar, UsageMonthly } from '@shared/usage-types'

const USAGE_PORTAL_URL = 'https://claude.ai/new#settings/usage'

/** Severity bucket for a utilization percent — drives the chip fill + value color so a
 * near-exhausted window reads as a warning before it blocks the next request. */
function severity(pct: number): 'normal' | 'warning' | 'critical' {
  if (pct >= 100) return 'critical'
  if (pct >= 80) return 'warning'
  return 'normal'
}

export default function UsagePanel() {
  // Tick periodically so the "updated ago" footer stays fresh without a refetch.
  // Forces re-render only; no network.
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    onCleanup(() => clearInterval(id))
  })

  const result = () => usageResult()
  const loading = () => usageLoading()
  const info = createMemo((): UsageInfo | undefined => {
    const r = result()
    return r && r.kind === 'ok' ? r.info : undefined
  })
  // Read `now()` here so the "Updated Xs ago" text recomputes on each tick — formatUpdatedAgo
  // is built on non-reactive Date.now(), so without this the memo would freeze at its first value.
  const updatedAgo = createMemo(() => {
    const i = info()
    if (!i) return undefined
    void now()
    return formatUpdatedAgo(i.fetchedAt)
  })

  async function openUsagePortal(): Promise<void> {
    const result = await window.navik.shell.openExternal(USAGE_PORTAL_URL)
    if (!result.success) showToast(result.error ?? 'Could not open the usage page.', true)
  }

  return (
    <div class="usage-panel" data-now={now()}>
      <span class="usage-tag">Usage</span>

      <Show when={info()?.plan}>
        <span class="usage-plan-pill">{info()!.plan}</span>
      </Show>

      <Switch>
        <Match when={loading() && !result()}>
          <span class="usage-inline-hint">Loading usage…</span>
        </Match>
        <Match when={info()}>
          <Show
            when={info()!.bars.length > 0}
            fallback={<span class="usage-inline-hint">No active rate limits.</span>}
          >
            <div class="usage-chips">
              <For each={info()!.bars}>{(bar) => <UsageChip bar={bar} now={now} />}</For>
            </div>
          </Show>
          <Show when={info()?.monthly}>
            <MonthlyChip monthly={info()!.monthly!} />
          </Show>
        </Match>
        <Match when={result()?.kind === 'unavailable'}>
          <span class="usage-inline-hint">
            {(result() as { kind: 'unavailable'; reason: string }).reason}
          </span>
        </Match>
        <Match when={result()?.kind === 'error'}>
          <span class="usage-inline-error">
            {(result() as { kind: 'error'; message: string }).message}
          </span>
        </Match>
      </Switch>

      <div class="usage-inline-foot">
        <button
          type="button"
          class="usage-portal-link"
          title="Open usage on claude.ai"
          onClick={() => void openUsagePortal()}
        >
          Manage
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 3h7v7M13 3L6.5 9.5M11 9v4H3V5h4"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <Show when={updatedAgo()}>
          <span class="usage-inline-updated">Updated {updatedAgo()}</span>
        </Show>
        <button
          class="icon-btn usage-refresh"
          classList={{ spinning: loading() }}
          title={loading() ? 'Refreshing…' : 'Refresh usage'}
          onClick={() => void refreshUsage()}
        >
          <svg class="refresh-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5h-2.5"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** A single rate-limit window as a compact inline chip: label · mini track · percent.
 * The reset countdown lives in the `title` tooltip to keep the row to one line. */
function UsageChip(props: { bar: UsageLimitBar; now: () => number }) {
  const pct = createMemo(() => Math.round(props.bar.utilization))
  const level = createMemo(() => severity(props.bar.utilization))
  const fillWidth = createMemo(() => `${Math.min(100, Math.max(0, props.bar.utilization)).toFixed(0)}%`)
  // Read `now()` so the tooltip countdown recomputes on each tick; formatRemaining uses
  // non-reactive Date.now(), so without this the memo would freeze at its first value.
  const tooltip = createMemo(() => {
    void props.now()
    const iso = props.bar.resetsAt
    if (!iso) return props.bar.label
    const absolute = new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
    return `${props.bar.label} · resets in ${formatRemaining(iso)} · ${absolute}`
  })

  return (
    <div class="usage-chip" data-severity={level()} title={tooltip()}>
      <span class="usage-chip-name">{props.bar.label}</span>
      <span class="usage-chip-track">
        <span class="usage-chip-fill" style={{ width: fillWidth() }} />
      </span>
      <span class="usage-chip-pct">{pct()}%</span>
    </div>
  )
}

function MonthlyChip(props: { monthly: UsageMonthly }) {
  const level = createMemo(() => severity(props.monthly.percent))
  const fillWidth = createMemo(() => `${Math.min(100, Math.max(0, props.monthly.percent)).toFixed(0)}%`)
  const value = createMemo(() => {
    const used = props.monthly.usedLabel
    const limit = props.monthly.limitLabel
    if (used && limit) return `${used} / ${limit}`
    if (used) return used
    return `${Math.round(props.monthly.percent)}%`
  })

  return (
    <div class="usage-chip usage-chip--monthly" data-severity={level()} title="Monthly credits">
      <span class="usage-chip-name">Monthly</span>
      <span class="usage-chip-track">
        <span class="usage-chip-fill" style={{ width: fillWidth() }} />
      </span>
      <span class="usage-chip-pct">{value()}</span>
    </div>
  )
}
