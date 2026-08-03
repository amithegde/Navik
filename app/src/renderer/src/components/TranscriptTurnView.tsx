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

export default function TranscriptTurnView(props: { entry: TranscriptEntry; isLast: boolean; onExpandText: (r: TextViewerRequest) => void }) {
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#D97757" fill-rule="nonzero">
              <path d="M4.5 14.5c0-1.5 1-2.7 2.4-3.1L4.7 5.6c-.2-.5.1-1 .6-1.1.5-.2 1 .1 1.1.6l2.1 5.7h6.9l2.1-5.7c.2-.5.7-.7 1.1-.6.5.2.7.6.6 1.1l-2.2 5.8c1.4.4 2.4 1.6 2.4 3.1v.3c0 1.8-1.5 3.2-3.3 3.2h-8c-1.8 0-3.3-1.4-3.3-3.2v-.3z" />
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
      </div>
    </div>
  )
}
