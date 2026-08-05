import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { refreshUsage, usageLoading, usageResult } from '../state/usage-store'
import { formatRemaining, formatUpdatedAgo } from '../lib/relative-time'
import type { UsageInfo, UsageLimitBar, UsageMonthly } from '@shared/usage-types'

/** Severity bucket for a utilization percent — drives the bar + text color so a near-exhausted
 * window reads as a warning before it blocks the next request. */
function severity(pct: number): 'normal' | 'warning' | 'critical' {
  if (pct >= 100) return 'critical'
  if (pct >= 80) return 'warning'
  return 'normal'
}

export default function UsagePanel() {
  // Tick periodically so the reset countdowns and "updated ago" footer stay fresh without a
  // refetch. Forces re-render only; no network.
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    onCleanup(() => clearInterval(id))
  })

  const result = () => usageResult()
  const loading = () => usageLoading()

  return (
    <div class="usage-panel" data-now={now()}>
      <div class="usage-header">
        <div class="home-section-title">Usage</div>
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

      <Switch>
        <Match when={loading() && !result()}>
          <div class="usage-hint">Loading usage…</div>
        </Match>
        <Match when={result()?.kind === 'ok'}>
          <UsageBars info={(result() as { kind: 'ok'; info: UsageInfo }).info} now={now} />
        </Match>
        <Match when={result()?.kind === 'unavailable'}>
          <div class="usage-hint">{(result() as { kind: 'unavailable'; reason: string }).reason}</div>
        </Match>
        <Match when={result()?.kind === 'error'}>
          <div class="usage-error">{(result() as { kind: 'error'; message: string }).message}</div>
        </Match>
      </Switch>
    </div>
  )
}

function UsageBars(props: { info: UsageInfo; now: () => number }) {
  // Read `now()` here so the footer's "Updated Xs ago" recomputes as the tick fires — without it,
  // formatUpdatedAgo (built on non-reactive Date.now()) would compute once and go stale.
  const updated = createMemo(() => {
    void props.now()
    return formatUpdatedAgo(props.info.fetchedAt)
  })
  return (
    <>
      <Show when={props.info.plan}>
        <div class="usage-plan">{props.info.plan}</div>
      </Show>

      <Show when={props.info.bars.length > 0} fallback={<div class="usage-hint">No active rate limits right now.</div>}>
        <div class="usage-bars">
          <For each={props.info.bars}>{(bar) => <UsageBar bar={bar} now={props.now} />}</For>
        </div>
      </Show>

      <Show when={props.info.monthly}>
        {(monthly) => <MonthlyBar monthly={monthly()} />}
      </Show>

      <div class="usage-footer">Updated {updated()}</div>
    </>
  )
}

function MonthlyBar(props: { monthly: UsageMonthly }) {
  const pct = createMemo(() => Math.round(props.monthly.percent))
  const level = createMemo(() => severity(props.monthly.percent))
  const fillWidth = createMemo(() => `${Math.min(100, Math.max(0, props.monthly.percent)).toFixed(0)}%`)
  const detail = createMemo(() => {
    const used = props.monthly.usedLabel
    const limit = props.monthly.limitLabel
    if (used && limit) return `${used} of ${limit}`
    if (used) return `${used} used`
    return undefined
  })
  return (
    <Show when={detail()}>
      <div class="usage-monthly">
        <div class="usage-bar" data-severity={level()}>
          <div class="usage-bar-top">
            <span class="usage-bar-label">Monthly credits</span>
            <span class="usage-bar-value">{pct()}%</span>
          </div>
          <div class="usage-bar-track">
            <div class="usage-bar-fill" style={{ width: fillWidth() }} />
          </div>
        </div>
        <div class="usage-bar-reset">{detail()}</div>
      </div>
    </Show>
  )
}

function UsageBar(props: { bar: UsageLimitBar; now: () => number }) {
  const pct = createMemo(() => Math.round(props.bar.utilization))
  const level = createMemo(() => severity(props.bar.utilization))
  const fillWidth = createMemo(() => `${Math.min(100, Math.max(0, props.bar.utilization)).toFixed(0)}%`)
  // Read `now()` so the countdown recomputes on each tick; formatRemaining uses non-reactive
  // Date.now(), so without this the memo would freeze at its first value.
  const resetLabel = createMemo(() => {
    void props.now()
    const iso = props.bar.resetsAt
    if (!iso) return undefined
    const absolute = new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
    return `resets in ${formatRemaining(iso)} · ${absolute}`
  })

  return (
    <div class="usage-bar" data-severity={level()}>
      <div class="usage-bar-top">
        <span class="usage-bar-label">{props.bar.label}</span>
        <span class="usage-bar-value">{pct()}%</span>
      </div>
      <div class="usage-bar-track">
        <div class="usage-bar-fill" style={{ width: fillWidth() }} />
      </div>
      <Show when={resetLabel()}>
        <div class="usage-bar-reset">{resetLabel()}</div>
      </Show>
    </div>
  )
}
