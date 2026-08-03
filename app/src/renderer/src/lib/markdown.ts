import MarkdownIt from 'markdown-it'

// html:false escapes raw <...> rather than interpreting it, since assistant text is
// untrusted-ish model output rendered into the app chrome.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

export function renderMarkdown(text: string): string {
  return md.render(text)
}
