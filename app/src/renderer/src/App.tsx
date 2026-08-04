import { createSignal, onCleanup, onMount } from 'solid-js'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import DetailPane from './components/DetailPane'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import { initSessionsStore, refreshSessions } from './state/sessions-store'
import { initLiveConversationStore, startNewSessionInCurrentProject } from './state/live-conversation-store'
import { initComposerStore } from './state/composer-store'
import { initCatalogStore } from './state/catalog-store'
import { initEditorStore } from './state/editor-store'
import { toastIsError, toastMessage } from './state/toast-store'
import { installSearchShortcut } from './lib/search-shortcut'
import { installNewSessionShortcut } from './lib/new-session-shortcut'
import { installScrollbarHover } from './lib/scrollbar-hover'
import { installPaneResizer } from './lib/pane-resizer'

export default function App() {
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false)
  let resizerRef: HTMLDivElement | undefined

  onMount(() => {
    const unsubscribeSessions = initSessionsStore()
    const unsubscribeLive = initLiveConversationStore()
    initComposerStore()
    initCatalogStore()
    initEditorStore()
    void refreshSessions()

    const uninstallSearchShortcut = installSearchShortcut()
    const uninstallNewSessionShortcut = installNewSessionShortcut(startNewSessionInCurrentProject)
    const uninstallScrollbarHover = installScrollbarHover()
    const uninstallPaneResizer = resizerRef ? installPaneResizer(resizerRef) : undefined

    onCleanup(() => {
      unsubscribeSessions()
      unsubscribeLive()
      uninstallSearchShortcut()
      uninstallNewSessionShortcut()
      uninstallScrollbarHover()
      uninstallPaneResizer?.()
    })
  })

  return (
    <div class="app-window">
      <TitleBar onOpenShortcuts={() => setShortcutsOpen(true)} />
      <div class="app-shell">
        <Sidebar />
        <div class="pane-resizer" title="Drag to resize" ref={resizerRef}>
          <span class="resizer-grip">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
        <DetailPane />
      </div>
      {toastMessage() && (
        <div class="toast" classList={{ error: toastIsError() }}>
          {toastMessage()}
        </div>
      )}
      <KeyboardShortcutsModal isOpen={shortcutsOpen()} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
