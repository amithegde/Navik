import fs from 'node:fs'
import path from 'node:path'
import { resolveClaudeHome } from './claude-home'
import type { UsageInfo, UsageLimitBar, UsageMonthly, UsageResult } from '../shared/usage-types'

// Endpoint + OAuth client config, copied from the Claude Code VS Code extension (extension.js):
// the usage figure comes from `${BASE_API_URL}/api/oauth/usage` and expiring access tokens are
// refreshed through `${TOKEN_URL}` with the CLI's own client id. These are public values baked
// into the extension; no secret is introduced here.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const ANTHROPIC_BETA = 'oauth-2025-04-20'
const REQUEST_TIMEOUT_MS = 8000

// Refresh a little before the real expiry, the way the extension does (5-minute skew) — otherwise a
// token that's still technically valid for a few more seconds can 401 mid-flight.
const REFRESH_SKEW_MS = 5 * 60_000

interface ClaudeAiOauth {
  accessToken?: string
  refreshToken?: string | null
  expiresAt?: number | null
  scopes?: string[]
  subscriptionType?: string | null
}

interface CredentialsFile {
  claudeAiOauth?: ClaudeAiOauth
}

interface UsageWindow {
  utilization: number | null
  resets_at?: string | null
}

interface ModelScopedWindow {
  display_name?: string
  utilization?: number | null
  resets_at?: string | null
}

interface Money {
  amount_minor?: number
  currency?: string
  exponent?: number
}

interface Spend {
  enabled?: boolean
  used?: Money | null
  limit?: Money | null
  balance?: Money | null
  percent?: number | null
}

interface LimitEntry {
  kind?: string
  group?: string
  percent?: number | null
  severity?: string | null
  resets_at?: string | null
  is_active?: boolean | null
  scope?: { model?: { display_name?: string | null } | null; surface?: string | null } | null
}

interface UsageResponse {
  five_hour?: UsageWindow | null
  seven_day?: UsageWindow | null
  seven_day_sonnet?: UsageWindow | null
  model_scoped?: ModelScopedWindow[] | null
  limits?: LimitEntry[] | null
  spend?: Spend | null
}

function credentialsPath(): string {
  return path.join(resolveClaudeHome().rootDir, '.credentials.json')
}

function readCredentials(): CredentialsFile {
  try {
    const raw = fs.readFileSync(credentialsPath(), 'utf8')
    return JSON.parse(raw) as CredentialsFile
  } catch {
    return {}
  }
}

function isExpiringSoon(expiresAt: number | null | undefined): boolean {
  if (typeof expiresAt !== 'number') return true
  return Date.now() + REFRESH_SKEW_MS >= expiresAt
}

interface RefreshResult {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

/** Refreshes the OAuth access token via the same token endpoint the CLI uses, and persists the new
 * token back to ~/.claude/.credentials.json so subsequent fetches (and the CLI itself) reuse it.
 * Returns null if no refresh token is available or the refresh fails — caller falls back to the
 * existing access token and lets the usage request 401 if it's truly dead. */
async function refreshOAuthToken(oauth: ClaudeAiOauth): Promise<RefreshResult | null> {
  const refreshToken = oauth.refreshToken
  if (!refreshToken) return null

  const body = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    scope: (oauth.scopes && oauth.scopes.length > 0 ? oauth.scopes : DEFAULT_SCOPES).join(' ')
  }

  let resp: Response
  try {
    resp = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    return null
  }
  if (!resp.ok) return null

  let data: { access_token?: string; refresh_token?: string; expires_in?: number }
  try {
    data = await resp.json()
  } catch {
    return null
  }
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) return null

  const result: RefreshResult = {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : refreshToken,
    expiresAt: Date.now() + (typeof data.expires_in === 'number' ? data.expires_in * 1000 : 3600_000)
  }

  persistRefreshedToken(result)
  return result
}

/** Read-modify-write of the credentials file, touching only the OAuth fields we refreshed. The CLI
 * also writes this file, so we re-read immediately before writing to avoid clobbering unrelated
 * fields (e.g. mcpOAuth) that may have changed under us. Best-effort: a failure here just means the
 * stale token stays on disk until the CLI refreshes it itself. */
function persistRefreshedToken(result: RefreshResult): void {
  try {
    const current = readCredentials()
    const merged: CredentialsFile = {
      ...current,
      claudeAiOauth: {
        ...(current.claudeAiOauth ?? {}),
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt
      }
    }
    fs.writeFileSync(credentialsPath(), JSON.stringify(merged, null, 2), 'utf8')
  } catch {
    // Non-fatal — see jsdoc.
  }
}

async function getAuthHeaders(): Promise<{ headers: Record<string, string> } | null> {
  const oauth = readCredentials().claudeAiOauth
  if (!oauth || typeof oauth.accessToken !== 'string' || oauth.accessToken.length === 0) return null

  let accessToken = oauth.accessToken
  if (isExpiringSoon(oauth.expiresAt)) {
    const refreshed = await refreshOAuthToken(oauth)
    if (refreshed) accessToken = refreshed.accessToken
  }

  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'anthropic-beta': ANTHROPIC_BETA
    }
  }
}

/** Fetches current account usage. Mirrors the Claude Code webview's row construction so the bars
 * shown here match what `claude` reports: the 5-hour session window, the rolling 7-day window, the
 * Sonnet weekly window (Max/Team plans), and any model-scoped weekly windows. Windows whose
 * utilization is null are dropped — they aren't being tracked for this account. */
export async function fetchUsage(): Promise<UsageResult> {
  const auth = await getAuthHeaders()
  if (!auth) {
    return {
      kind: 'unavailable',
      reason: 'Sign in to Claude AI to see usage. Usage tracking is only available for Claude AI subscribers.'
    }
  }

  let resp: Response
  try {
    resp = await fetchWithTimeout(USAGE_URL, { method: 'GET', headers: auth.headers })
  } catch (e) {
    return { kind: 'error', message: `Couldn't reach Anthropic: ${messageOf(e)}` }
  }

  if (resp.status === 401 || resp.status === 403) {
    return { kind: 'error', message: 'Authentication failed — your Claude session may have expired.' }
  }
  if (!resp.ok) {
    return { kind: 'error', message: `Usage request failed (HTTP ${resp.status}).` }
  }

  let data: UsageResponse
  try {
    data = (await resp.json()) as UsageResponse
  } catch {
    return { kind: 'error', message: 'Usage response was not valid JSON.' }
  }

  const subscription = readCredentials().claudeAiOauth?.subscriptionType
  const includeSonnet = subscription === 'max' || subscription === 'team' || !subscription

  const bars = buildBars(data, includeSonnet)
  const info: UsageInfo = {
    bars,
    plan: planLabel(subscription),
    monthly: buildMonthly(data.spend),
    fetchedAt: Date.now()
  }
  return { kind: 'ok', info }
}

function buildBars(data: UsageResponse, includeSonnet: boolean): UsageLimitBar[] {
  const candidates: { label: string; window: UsageWindow | null | undefined }[] = [
    { label: 'Session (5hr)', window: data.five_hour },
    { label: 'Weekly (7 day)', window: data.seven_day }
  ]
  if (includeSonnet) candidates.push({ label: 'Weekly Sonnet', window: data.seven_day_sonnet })

  const bars: UsageLimitBar[] = []
  for (const { label, window } of candidates) {
    if (!window || window.utilization == null) continue
    bars.push({ label, utilization: clampPct(window.utilization), resetsAt: window.resets_at ?? undefined })
  }

  // Model-scoped weekly windows (e.g. per-model caps on newer plans) use a different shape but map
  // to the same bar. Added after the fixed windows so the primary windows stay on top. The API
  // exposes these two ways: a `model_scoped` array (preferred) or, when that's absent, nested
  // inside the `limits` array as `weekly_scoped` entries — read whichever is present so a
  // model-specific cap is never silently dropped.
  const seenModels = new Set<string>()
  if (Array.isArray(data.model_scoped)) {
    for (const scoped of data.model_scoped) {
      if (!scoped || scoped.utilization == null) continue
      const name = modelLabel(scoped.display_name)
      seenModels.add(name)
      bars.push({
        label: `Weekly ${name}`,
        utilization: clampPct(scoped.utilization),
        resetsAt: scoped.resets_at ?? undefined
      })
    }
  } else if (Array.isArray(data.limits)) {
    for (const limit of data.limits) {
      if (!limit || limit.kind !== 'weekly_scoped') continue
      if (limit.percent == null) continue
      const name = modelLabel(limit.scope?.model?.display_name)
      if (seenModels.has(name)) continue
      seenModels.add(name)
      bars.push({
        label: `Weekly ${name}`,
        utilization: clampPct(limit.percent),
        resetsAt: limit.resets_at ?? undefined
      })
    }
  }

  return bars
}

/** Builds the monthly credits/spend row from the `spend` block. Returns undefined when spend
 * tracking isn't enabled (Max/Team plans on weekly limits have no monthly dollar quota), so the UI
 * simply omits the section rather than showing an empty "$0 of nothing". */
function buildMonthly(spend: Spend | null | undefined): UsageMonthly | undefined {
  if (!spend || !spend.enabled) return undefined
  return {
    usedLabel: formatMoney(spend.used),
    limitLabel: formatMoney(spend.limit),
    percent: clampPct(typeof spend.percent === 'number' ? spend.percent : 0)
  }
}

function planLabel(subscription: string | null | undefined): string | undefined {
  if (!subscription) return undefined
  const known: Record<string, string> = {
    max: 'Claude Max',
    team: 'Claude Team',
    pro: 'Claude Pro',
    enterprise: 'Claude Enterprise'
  }
  const mapped = known[subscription]
  if (mapped) return mapped
  return `Claude ${subscription.charAt(0).toUpperCase()}${subscription.slice(1)}`
}

function modelLabel(name: string | null | undefined): string {
  return typeof name === 'string' && name.length > 0 ? name : 'model'
}

function formatMoney(money: Money | null | undefined): string | undefined {
  if (!money || typeof money.amount_minor !== 'number') return undefined
  const exponent = typeof money.exponent === 'number' ? money.exponent : 0
  const value = money.amount_minor / Math.pow(10, exponent)
  const currency = typeof money.currency === 'string' ? money.currency : 'USD'
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value)
  } catch {
    return `${value.toFixed(exponent)} ${currency}`.trim()
  }
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

async function fetchWithTimeout(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

const DEFAULT_SCOPES = [
  'user:profile',
  'user:inference',
  'user:sessions:claude_code',
  'user:mcp_servers',
  'user:file_upload'
]
