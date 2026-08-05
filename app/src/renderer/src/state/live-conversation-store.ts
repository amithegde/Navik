import { createEffect, createMemo, createSignal } from 'solid-js'
import type { TranscriptEntry, ImageAttachment } from '@shared/transcript-types'
import type { LiveConversationState } from '@shared/live-session-types'
import { selectedProjectFilter, selectedSession, selectSession } from './sessions-store'
import { showToast } from './toast-store'
import { openProjectSelectModal } from './project-select-store'

const externalPollIntervalMs = 4_000

const [liveState, setLiveState] = createSignal<LiveConversationState | null>(null)
const [historicalEntries, setHistoricalEntries] = createSignal<TranscriptEntry[] | null>(null)
const [isLoadingTranscript, setIsLoadingTranscript] = createSignal(false)
const [resumingSessionId, setResumingSessionId] = createSignal<string | null>(null)

// Pane-level defaults for the *next* launch/resume — deliberately persist across session
// switches (including to Home and back), unlike the draft text and pending images which are
// per-session composer state.
export const [paneModel, setPaneModel] = createSignal('default')
export const [panePermissionMode, setPanePermissionMode] = createSignal('auto')
// '' = Auto: no --effort flag at launch, the model uses its own default effort.
export const [paneEffort, setPaneEffort] = createSignal('')

let loadedSessionId: string | null = null
let externalPollTimer: ReturnType<typeof setInterval> | null = null

export const isLive = createMemo(() => liveState() !== null && !liveState()!.hasExited)

export const displayEntries = createMemo<TranscriptEntry[] | null>(() => {
  const live = liveState()
  if (live) return live.entries
  return historicalEntries()
})

async function loadForSelection(session: ReturnType<typeof selectedSession>): Promise<void> {
  if (!session) {
    setLiveState(null)
    setHistoricalEntries(null)
    loadedSessionId = null
    return
  }

  const live = await window.navik.live.getState(session.sessionId)
  // Bail if the selection moved again while that lookup was in flight.
  if (selectedSession()?.sessionId !== session.sessionId) return

  if (live) {
    setLiveState(live)
    setHistoricalEntries(null)
    loadedSessionId = session.sessionId
    return
  }

  setLiveState(null)
  if (session.sessionId === loadedSessionId) return

  loadedSessionId = session.sessionId
  if (!session.transcriptPath) {
    setHistoricalEntries([])
    return
  }

  setIsLoadingTranscript(true)
  try {
    const entries = await window.navik.sessions.readTranscript(session.transcriptPath)
    if (selectedSession()?.sessionId === session.sessionId) setHistoricalEntries(entries)
  } catch {
    if (selectedSession()?.sessionId === session.sessionId) setHistoricalEntries([])
  } finally {
    if (selectedSession()?.sessionId === session.sessionId) setIsLoadingTranscript(false)
  }
}

// Only polls a session that's running *outside* this app (VS Code, another terminal) — one this
// app is live-driving already streams over `conversationChanged`, and re-reading its transcript
// file mid-write would race the CLI's own writer.
async function pollExternalTranscript(): Promise<void> {
  const session = selectedSession()
  if (!session || liveState() || !session.running || isLoadingTranscript()) return

  try {
    const entries = await window.navik.sessions.readTranscript(session.transcriptPath)
    if (selectedSession()?.sessionId === session.sessionId && !liveState()) setHistoricalEntries(entries)
  } catch {
    // Transcript unreadable/mid-write; retry next tick.
  }
}

export function initLiveConversationStore(): () => void {
  createEffect(() => {
    const session = selectedSession()
    void loadForSelection(session)
  })

  const unsubscribeConversation = window.navik.live.onConversationChanged((state) => {
    const current = selectedSession()
    if (!current) return
    if (state.key.toLowerCase() === current.sessionId.toLowerCase() || state.key.toLowerCase() === liveState()?.key.toLowerCase()) {
      setLiveState(state)
    }
  })

  externalPollTimer = setInterval(() => void pollExternalTranscript(), externalPollIntervalMs)

  return () => {
    unsubscribeConversation()
    if (externalPollTimer) clearInterval(externalPollTimer)
  }
}

/** The single send/resume path: resumes a not-yet-live session first (if needed), then sends.
 * The message is delivered to the session it was composed for even if the user switches away
 * while the resume is connecting. */
export async function sendDraft(
  text: string,
  images: ImageAttachment[] | undefined,
  permissionMode: string,
  model: string,
  effort: string
): Promise<{ success: boolean; error?: string; wasRunningElsewhere?: boolean }> {
  const session = selectedSession()
  if (!session) return { success: false }
  if (!text.trim() && !(images && images.length > 0)) return { success: false }

  if (resumingSessionId() === session.sessionId) return { success: false }

  let key = liveState()?.key
  let wasRunningElsewhere = false

  if (!isLive()) {
    wasRunningElsewhere = !!session.running
    setResumingSessionId(session.sessionId)
    try {
      const result = await window.navik.live.resume(session.sessionId, session.projectPath, session.transcriptPath, permissionMode, model, effort)
      if (!result.success) return { success: false, error: result.error ?? 'Failed to start.' }

      const freshState = await window.navik.live.getState(session.sessionId)
      if (!freshState) return { success: false, error: 'Failed to start.' }
      key = freshState.key
      if (selectedSession()?.sessionId === session.sessionId) setLiveState(freshState)
    } finally {
      if (resumingSessionId() === session.sessionId) setResumingSessionId(null)
    }
  }

  if (!key) return { success: false }
  await window.navik.live.sendMessage(key, text, images)
  return { success: true, wasRunningElsewhere }
}

export async function stopCurrentSession(): Promise<{ outcome: string; error?: string } | null> {
  const session = selectedSession()
  if (!session) return null
  return window.navik.sessions.stop(session.sessionId)
}

/** Sets the pane-level default and, if a live conversation is up, switches it in place — the
 * local field always tracks the pick; only a live, not-exited process gets the CLI push.
 * Throwing here (a rejected control request) is the caller's cue to roll the picker's
 * displayed value back and show an error. */
export async function setCurrentModel(model: string): Promise<void> {
  setPaneModel(model)
  if (isLive()) await window.navik.live.setModel(liveState()!.key, model)
}

export async function setCurrentPermissionMode(mode: string): Promise<void> {
  setPanePermissionMode(mode)
  if (isLive()) await window.navik.live.setPermissionMode(liveState()!.key, mode)
}

/** Same shape as the model/permission setters: track the pick locally, and push to the live
 * process if one is up. /effort has no control-request form, so the live push is the slash
 * command — the CLI acknowledges it as a zero-cost turn, and any rejection surfaces there rather
 * than as a thrown promise here (the picker only offers levels the model supports, so a reject
 * isn't reachable from the UI). */
export async function setCurrentEffort(level: string): Promise<void> {
  setPaneEffort(level)
  if (isLive()) await window.navik.live.setEffort(liveState()!.key, level)
}

/** Launches a new session directly in the given project — model and permission mode are left
 * unset so the main process falls back to its own defaults; the project-select modal and the
 * sidebar's one-click path both funnel through here rather than prompting for anything else. */
export function startNewSessionInProject(projectPath: string): void {
  void window.navik.live.startNew(projectPath).then((result) => {
    if (result.success && result.placeholderId) selectSession(result.placeholderId)
    showToast(result.success ? `Starting a new session in ${projectPath}…` : result.error ?? 'Failed to launch.', !result.success)
  })
}

/** The one-click entry point for starting a session in the project currently selected via the
 * sidebar's project-chip filter — the sidebar "New session" button and the Ctrl+N shortcut both
 * funnel through here rather than through a dialog asking what they already know (the project).
 * With no project selected, opens the project-select modal instead of guessing. */
export function startNewSessionInCurrentProject(): void {
  const projectPath = selectedProjectFilter()
  if (!projectPath) {
    openProjectSelectModal()
    return
  }
  startNewSessionInProject(projectPath)
}

export { liveState, historicalEntries, isLoadingTranscript, resumingSessionId }
