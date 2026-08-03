import { createEffect, createSignal } from 'solid-js'
import { selectedSession } from './sessions-store'
import type { ClaudeModelOption, ClaudeCommandOption } from '@shared/transcript-types'

const defaultModelOption: ClaudeModelOption = {
  value: 'default',
  displayName: 'Default (recommended)',
  description: "Whatever your account's default model is"
}

export const [availableModels, setAvailableModels] = createSignal<ClaudeModelOption[]>([defaultModelOption])
export const [availableCommands, setAvailableCommands] = createSignal<ClaudeCommandOption[]>([])

let loadedForProject: string | null = null

/** Probes the CLI's model/command list once per distinct project directory — must be called from
 * a component with an active reactive root (App.tsx's onMount). */
export function initCatalogStore(): void {
  createEffect(() => {
    const session = selectedSession()
    if (!session || session.projectPath === loadedForProject) return
    loadedForProject = session.projectPath

    void window.navik.catalog.getModels(session.projectPath).then(setAvailableModels)
    void window.navik.catalog.getCommands(session.projectPath).then(setAvailableCommands)
  })
}
