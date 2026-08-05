/**
 * Account usage / rate-limit information, sourced the same way the Claude Code VS Code extension
 * and chat webview get it: a bearer-token GET to Anthropic's OAuth usage endpoint. See
 * main/usage-fetcher.ts for the request and the token it reads from ~/.claude/.credentials.json.
 *
 * The utilization figures are percentages in the range 0–100 (the API returns e.g. 100.0 when a
 * weekly window is exhausted), matching what `claude` itself prints. `resetsAt` is an ISO-8601
 * string in UTC, or omitted when the window has no pending reset.
 */

export interface UsageLimitBar {
  /** Human label, e.g. "Session (5hr)", "Weekly (7 day)". */
  label: string
  /** 0–100. */
  utilization: number
  /** ISO-8601 UTC, when the window resets. */
  resetsAt?: string
}

/** Monthly usage-credits tracking (the `spend` block of the API response). Only present when the
 * account has credits/spend tracking enabled — Max/Team plans on weekly limits don't, so this is
 * undefined for them; pay-as-you-go / credit-backed accounts populate it. */
export interface UsageMonthly {
  /** Pre-formatted used amount, e.g. "$12.50". */
  usedLabel?: string
  /** Pre-formatted limit, e.g. "$50.00", when a cap is set. */
  limitLabel?: string
  /** 0–100. */
  percent: number
}

export interface UsageInfo {
  /** Rate-limit windows (session / weekly / model-scoped). */
  bars: UsageLimitBar[]
  /** Display name of the account's plan, e.g. "Claude Max". */
  plan?: string
  /** Monthly credits/spend, when the account tracks it. */
  monthly?: UsageMonthly
  /** epoch ms of the successful fetch, so the UI can show "updated Xs ago". */
  fetchedAt: number
}

/**
 * Three outcomes rather than throwing across IPC:
 *  - ok: we got a usable answer (possibly with zero bars if no window is active)
 *  - unavailable: signed in with an API key rather than Claude AI OAuth — usage tracking only exists
 *    for Claude AI subscribers, so there's nothing to fetch
 *  - error: the request failed (expired/revoked token, network, non-200) — message surfaces in the UI
 */
export type UsageResult =
  | { kind: 'ok'; info: UsageInfo }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; message: string }
