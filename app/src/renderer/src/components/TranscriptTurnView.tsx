import { For, Show } from 'solid-js'
import type { TranscriptEntry, ToolUseSummary, ToolResultSummary } from '@shared/transcript-types'
import { renderMarkdown } from '../lib/markdown'

export interface TextViewerRequest {
  title: string
  subtitle: string
  text: string
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function IoTextButton(props: { preview: string; full: string; title: string; subtitle: string; onExpand: (r: TextViewerRequest) => void }) {
  return (
    <button
      type="button"
      class="tool-io-text"
      title="Click to see the full text"
      onClick={() => props.onExpand({ title: props.title, subtitle: props.subtitle, text: props.full })}
    >
      <span class="tool-io-preview">{props.preview}</span>
      <span class="tool-io-expand" aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path
            d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.5 2.5l-4.5 4.5M2.5 13.5l4.5-4.5"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}

function ToolUseCard(props: { tool: ToolUseSummary; onExpandText: (r: TextViewerRequest) => void }) {
  return (
    <div class="tool-call-card">
      <div class="tool-call-head">
        <span class="tool-call-dot" classList={{ pending: !props.tool.result, error: !!props.tool.result?.isError }} />
        <span class="tool-name">{props.tool.name}</span>
        <Show when={props.tool.description}>
          <span class="tool-desc-inline">{props.tool.description}</span>
        </Show>
      </div>
      <Show when={props.tool.detail !== undefined || props.tool.result}>
        <div class="tool-io-grid">
          <Show when={props.tool.detail !== undefined}>
            <div class="tool-io-row">
              <span class="tool-io-label">IN</span>
              <IoTextButton
                preview={props.tool.detail ?? ''}
                full={props.tool.fullDetail ?? props.tool.detail ?? ''}
                title={props.tool.name}
                subtitle="Input"
                onExpand={props.onExpandText}
              />
            </div>
          </Show>
          <Show when={props.tool.result}>
            {(result) => (
              <div class="tool-io-row result" classList={{ error: result().isError }}>
                <span class="tool-io-label">{result().isError ? 'ERROR' : 'OUT'}</span>
                <IoTextButton
                  preview={result().text}
                  full={result().fullText}
                  title={props.tool.name}
                  subtitle={result().isError ? 'Error' : 'Output'}
                  onExpand={props.onExpandText}
                />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

function OrphanResultCard(props: { result: ToolResultSummary; onExpandText: (r: TextViewerRequest) => void }) {
  return (
    <div class="tool-call-card">
      <div class="tool-io-grid">
        <div class="tool-io-row result" classList={{ error: props.result.isError }}>
          <span class="tool-io-label">{props.result.isError ? 'ERROR' : 'OUT'}</span>
          <IoTextButton
            preview={props.result.text}
            full={props.result.fullText}
            title="Tool result"
            subtitle={props.result.isError ? 'Error' : 'Output'}
            onExpand={props.onExpandText}
          />
        </div>
      </div>
    </div>
  )
}

export default function TranscriptTurnView(props: { entry: TranscriptEntry; isLast: boolean; onExpandText: (r: TextViewerRequest) => void; onCopyText: (text: string) => void }) {
  return (
    <div class="transcript-turn" classList={{ user: props.entry.role === 'user', assistant: props.entry.role === 'assistant', last: props.isLast }}>
      <div class="turn-rail">
        <div class="turn-avatar">
          <Show
            when={props.entry.role === 'assistant'}
            fallback={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="3" stroke="currentColor" stroke-width="1.3" />
                <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              </svg>
            }
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#D97757">
              <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
            </svg>
          </Show>
        </div>
      </div>
      <div class="turn-body">
        <div class="turn-meta">
          <span class="turn-role">{props.entry.role === 'user' ? 'You' : 'Claude'}</span>
          <span class="turn-time">{formatTime(props.entry.timestampUtc)}</span>
          <Show when={props.entry.isMeta}>
            <span class="meta-tag">system</span>
          </Show>
        </div>

        <For each={props.entry.textBlocks}>
          {(text) =>
            props.entry.role === 'assistant' ? (
              <div class="turn-text md-content" innerHTML={renderMarkdown(text)} />
            ) : (
              <div class="turn-text plain">{text}</div>
            )
          }
        </For>

        <Show when={props.entry.toolUses.length > 0}>
          <div class="tool-call-list">
            <For each={props.entry.toolUses}>{(tool) => <ToolUseCard tool={tool} onExpandText={props.onExpandText} />}</For>
          </div>
        </Show>

        <For each={props.entry.toolResults}>{(result) => <OrphanResultCard result={result} onExpandText={props.onExpandText} />}</For>

        <Show when={props.entry.role === 'assistant' && props.entry.textBlocks.length > 0}>
          <div class="turn-actions">
            <button
              type="button"
              class="turn-copy-btn"
              title="Copy response"
              onClick={() => props.onCopyText(props.entry.textBlocks.join('\n\n'))}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3" />
                <path d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.3" />
              </svg>
              <span>Copy</span>
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}
