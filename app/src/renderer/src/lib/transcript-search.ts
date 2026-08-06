// DOM-level find-within-transcript helpers. Walks text nodes inside the transcript scroll
// container, wraps each match in a `<mark class="search-match">`, and exposes a way to flag the
// active match and clear highlights when the query changes.
//
// Text is walked per text node — matches never span node boundaries (e.g. across `<strong>` or
// `<code>`). That matches VS Code's behaviour inside rich text, and keeps the wrap logic a local
// splitText/insert rather than a range that crosses elements (which would require normalising the
// partially-wrapped parent afterwards).
//
// `<script>` / `<style>` text is skipped out of paranoia even though markdown-it renders no such
// tags (html:false). Already-wrapped `<mark>` text is skipped so a re-run on a stale tree (e.g.
// the effect firing twice before the prior clear lands) can't nest marks.

export interface SearchOptions {
  useRegex: boolean
  caseSensitive: boolean
}

export interface BuiltSearch {
  regex: RegExp
}

/** Build the matcher. Returns null (and throws nothing) when the query is empty OR the regex is
 * invalid; the regex-error string is reported via the thrown `Error.message` so callers can surface
 * it in the UI. Callers must catch. */
export function buildSearch(query: string, opts: SearchOptions): BuiltSearch | null {
  const trimmed = query
  if (trimmed.length === 0) return null
  const flags = `g${opts.caseSensitive ? '' : 'i'}`
  const source = opts.useRegex ? trimmed : escapeRegExp(trimmed)
  // Constructing a RegExp throws on a bad pattern (e.g. trailing `\` or unbalanced `(`); let it.
  return { regex: new RegExp(source, flags) }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MARK_CLASS = 'search-match'

/** Remove every `<mark class="search-match">` from `root`, restoring the original text nodes.
 * Safe to call on a tree with no marks. */
export function clearHighlights(root: ParentNode): void {
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`)
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}

/** Wrap every match in `root`'s text nodes. Returns the match count. The caller MUST clear
 * previous highlights first — this walk skips existing `<mark>` text but won't dedupe against
 * leftover marks from a prior run that have since had their text split. */
export function highlightMatches(root: ParentNode, regex: RegExp): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
      if (tag === 'MARK' && parent.classList.contains(MARK_CLASS)) {
        return NodeFilter.FILTER_REJECT
      }
      return node.nodeValue && node.nodeValue.length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    }
  })

  const targets: Text[] = []
  let current = walker.nextNode() as Text | null
  while (current) {
    targets.push(current)
    current = walker.nextNode() as Text | null
  }

  let count = 0
  for (const textNode of targets) {
    count += wrapMatchesInNode(textNode, regex)
  }
  return count
}

function wrapMatchesInNode(textNode: Text, regex: RegExp): number {
  const text = textNode.nodeValue ?? ''
  if (text.length === 0) return 0

  // Reset lastIndex defensively — the regex is freshly built each search, but a stale caller
  // reusing one across calls would otherwise get mismatched offsets.
  regex.lastIndex = 0
  const hits: Array<{ start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    // Skip zero-length matches (e.g. `\b`): they'd infinite-loop and there's nothing to wrap.
    if (end === start) {
      regex.lastIndex++
      continue
    }
    hits.push({ start, end })
  }
  if (hits.length === 0) return 0

  // Split from the end so earlier offsets remain valid as the node gets divided.
  const parent = textNode.parentNode
  if (!parent) return 0

  // After the first splitText, `textNode` holds the prefix and a new sibling holds the suffix.
  // We track a cursor from the end of the previous match to know where the next prefix ends.
  let cursor = 0
  let working = textNode
  for (const { start, end } of hits) {
    // Move the cursor forward by splitting off any plain text between the previous match and this
    // one — that becomes a leading text node we leave alone.
    if (start > cursor) {
      working = working.splitText(start - cursor)
      cursor = start
    }
    // Split off the matched span; `working` now contains exactly the match.
    const after = working.splitText(end - cursor)
    const mark = document.createElement('mark')
    mark.className = MARK_CLASS
    mark.appendChild(working)
    parent.insertBefore(mark, after)
    working = after
    cursor = end
  }
  return hits.length
}

/** Toggle the `.active` class on the `index`-th `<mark>` (and clear it on all others). Out-of-range
 * `index` just clears. */
export function setActiveMatch(root: ParentNode, index: number): void {
  const marks = root.querySelectorAll<HTMLElement>(`mark.${MARK_CLASS}`)
  marks.forEach((m, i) => m.classList.toggle('active', i === index))
}

/** Returns the `index`-th match element, or null if out of range. */
export function getMatchElement(root: ParentNode, index: number): HTMLElement | null {
  const marks = root.querySelectorAll<HTMLElement>(`mark.${MARK_CLASS}`)
  return marks[index] ?? null
}
