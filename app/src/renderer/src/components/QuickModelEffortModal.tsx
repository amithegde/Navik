import { createEffect, createMemo, createSignal, For, JSX, onCleanup, Show, untrack } from 'solid-js'
import { availableModels } from '../state/catalog-store'
import { isLive, liveState, paneEffort, paneModel, setCurrentEffort, setCurrentModel } from '../state/live-conversation-store'
import { closeQuickModelEffort, quickModelEffortOpen } from '../state/quick-model-effort-store'

// Display-only effort metadata, mirrored from EffortPicker so the quick picker reads identically.
const effortInfo: Record<string, { label: string; description: string }> = {
  low: { label: 'Low', description: 'Quick, straightforward answers with minimal overhead' },
  medium: { label: 'Medium', description: 'Balanced thinking for everyday tasks' },
  high: { label: 'High', description: 'Deeper reasoning for complex work' },
  xhigh: { label: 'Extra high', description: 'Maximum thinking for the hardest problems' },
  max: { label: 'Max', description: 'Sustained peak effort; slowest and most thorough' }
}
function effortLabel(v: string): string {
  if (v === '') return 'Auto'
  return effortInfo[v]?.label ?? v.charAt(0).toUpperCase() + v.slice(1)
}
function effortDescription(v: string): string {
  if (v === '') return "Use the model's own default effort"
  return effortInfo[v]?.description ?? ''
}

type Section = 'model' | 'effort'

export default function QuickModelEffortModal() {
  let frameRef: HTMLDivElement | undefined
  const [modelIndex, setModelIndex] = createSignal(0)
  const [effortIndex, setEffortIndex] = createSignal(0)
  const [focused, setFocused] = createSignal<Section>('model')

  const currentModelValue = (): string => (isLive() ? liveState()!.model : paneModel())
  const currentEffortValue = (): string => (isLive() ? liveState()!.effort : paneEffort())

  // Effort options track the model currently highlighted in the picker (not the session's model),
  // so the right levels are offered as the user arrows through models. '' (Auto) always leads.
  const effortOptions = createMemo<string[]>(() => {
    const opt = availableModels()[modelIndex()]
    const levels = opt && opt.supportsEffort ? opt.supportedEffortLevels ?? [] : []
    return ['', ...levels]
  })
  const effortSupported = createMemo(() => effortOptions().length > 1)

  // Reset selection to the session's current model/effort each time the picker opens. untrack()
  // so the live/pane reads inside don't become deps — otherwise a turn completing while the
  // picker is open would re-run this and clobber the user's in-progress arrow selection.
  createEffect(() => {
    if (!quickModelEffortOpen()) return
    untrack(() => {
      const models = availableModels()
      const mIdx = Math.max(0, models.findIndex((m) => m.value === currentModelValue()))
      setModelIndex(mIdx)
      // effortOptions reads modelIndex(); read it fresh after the set above.
      const levels = (models[mIdx]?.supportsEffort ? models[mIdx]?.supportedEffortLevels ?? [] : [])
      const opts = ['', ...levels]
      const eIdx = opts.indexOf(currentEffortValue())
      setEffortIndex(eIdx < 0 ? 0 : eIdx)
      setFocused('model')
    })
    // Defer past the Solid flush: this effect can run before the <Show> that mounts the frame has
    // committed its DOM, in which case frameRef is still undefined and a synchronous focus() is a
    // no-op — leaving focus in the composer textarea the user was typing in. The microtask lands
    // after the frame is mounted.
    queueMicrotask(() => {
      if (quickModelEffortOpen()) frameRef?.focus()
    })
  })

  // Invariant guard: while the picker is open, focus must never rest outside the modal (e.g. in
  // the composer textarea, where keystrokes would type into the draft). If focus escapes, pull it
  // back to the frame. Active only while open.
  createEffect(() => {
    if (!quickModelEffortOpen()) return
    const reclaim = (e: FocusEvent): void => {
      const frame = frameRef
      if (!frame) return
      const target = e.target as HTMLElement | null
      if (target && !frame.contains(target)) frame.focus()
    }
    document.addEventListener('focusin', reclaim, true)
    onCleanup(() => document.removeEventListener('focusin', reclaim, true))
  })

  // Keep the highlighted row scrolled into view as the arrows move it.
  let modelRowRefs: (HTMLButtonElement | undefined)[] = []
  let effortRowRefs: (HTMLButtonElement | undefined)[] = []
  createEffect(() => {
    const mi = modelIndex()
    const ei = effortIndex()
    const f = focused()
    queueMicrotask(() => {
      const el = f === 'model' ? modelRowRefs[mi] : effortRowRefs[ei]
      el?.scrollIntoView({ block: 'nearest' })
    })
  })

  function clampEffort(): void {
    const max = effortOptions().length - 1
    setEffortIndex((i) => (i > max ? 0 : i))
  }
  function moveModel(delta: number): void {
    const n = availableModels().length
    if (n === 0) return
    setModelIndex((i) => (i + delta + n) % n)
    clampEffort()
  }
  function moveEffort(delta: number): void {
    const n = effortOptions().length
    if (n <= 1) return
    setEffortIndex((i) => (i + delta + n) % n)
  }

  // Applies the current selection through the same setters the composer pickers use — for a
  // not-yet-live session this just sets the pane default that the next send picks up; for a live
  // one it pushes immediately via the control request / /effort slash command, exactly like the
  // dropdowns. No new "deferred" path: that would silently never reach an already-running CLI,
  // since sendDraft only carries model/effort at resume time, not on sendMessage.
  function apply(): void {
    const chosenModel = availableModels()[modelIndex()]?.value
    const chosenEffort = effortOptions()[effortIndex()] ?? ''
    const prevModel = currentModelValue()
    const prevEffort = currentEffortValue()
    closeQuickModelEffort()
    if (chosenModel && chosenModel !== prevModel) void setCurrentModel(chosenModel)
    if (chosenEffort !== prevEffort) void setCurrentEffort(chosenEffort)
  }

  function onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focused() === 'model' ? moveModel(1) : moveEffort(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        focused() === 'model' ? moveModel(-1) : moveEffort(-1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        setFocused('model')
        break
      case 'ArrowRight':
        e.preventDefault()
        setFocused('effort')
        break
      case 'Tab':
        // Pane switching is on ←/→; swallow Tab so it can't move focus off the frame.
        e.preventDefault()
        break
      case 'Enter':
        e.preventDefault()
        apply()
        break
      case 'Escape':
        e.preventDefault()
        closeQuickModelEffort()
        break
    }
  }

  return (
    <Show when={quickModelEffortOpen()}>
      <div class="shortcuts-overlay" onClick={() => closeQuickModelEffort()} />
      <div class="quick-picker-modal" tabindex="-1" ref={frameRef} onKeyDown={onKeyDown}>
        <div class="shortcuts-head">
          <span class="shortcuts-title">Quick switch</span>
          <button type="button" class="icon-btn" title="Close (Esc)" onClick={() => closeQuickModelEffort()}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="quick-picker-body">
          <div class="quick-picker-section" classList={{ focused: focused() === 'model' }}>
            <div class="quick-picker-section-head">
              <span class="quick-picker-section-title">Model</span>
              <Show when={focused() === 'model'}>
                <span class="quick-picker-hint">↑↓ to choose · → for effort</span>
              </Show>
            </div>
            <div class="quick-picker-list">
              <For each={availableModels()}>
                {(model, i) => (
                  <QuickRow
                    ref={(el) => (modelRowRefs[i()] = el)}
                    title={model.displayName}
                    desc={model.description}
                    active={i() === modelIndex()}
                    onClick={() => {
                      setModelIndex(i())
                      clampEffort()
                      frameRef?.focus()
                    }}
                  />
                )}
              </For>
            </div>
          </div>

          <div class="quick-picker-section" classList={{ focused: focused() === 'effort' }}>
            <div class="quick-picker-section-head">
              <span class="quick-picker-section-title">Effort</span>
              <Show when={focused() === 'effort'}>
                <span class="quick-picker-hint">↑↓ to choose · ← for model</span>
              </Show>
            </div>
            <Show
              when={effortSupported()}
              fallback={<div class="quick-picker-empty">This model doesn't take an effort level — Auto only.</div>}
            >
              <div class="quick-picker-list">
                <For each={effortOptions()}>
                  {(level, i) => (
                    <QuickRow
                      ref={(el) => (effortRowRefs[i()] = el)}
                      title={effortLabel(level)}
                      desc={effortDescription(level)}
                      active={i() === effortIndex()}
                      onClick={() => {
                        setEffortIndex(i())
                        frameRef?.focus()
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <div class="quick-picker-foot">
          <span class="quick-picker-foot-hint">
            <kbd class="shortcuts-kbd">↑↓</kbd> select
            <kbd class="shortcuts-kbd">←/→</kbd> switch
            <kbd class="shortcuts-kbd">Enter</kbd> apply
            <kbd class="shortcuts-kbd">Esc</kbd> cancel
          </span>
        </div>
      </div>
    </Show>
  )
}

function QuickRow(props: {
  ref: (el: HTMLButtonElement) => void
  title: string
  desc?: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      tabindex="-1"
      class="mode-option quick-picker-row"
      classList={{ active: props.active }}
      ref={props.ref}
      onClick={props.onClick}
    >
      <span class="mode-option-body">
        <span class="mode-option-title">{props.title}</span>
        <Show when={props.desc}>
          <span class="mode-option-desc">{props.desc}</span>
        </Show>
      </span>
      <Show when={props.active}>
        <span class="mode-option-check">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </Show>
    </button>
  )
}
