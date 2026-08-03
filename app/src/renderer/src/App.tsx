import { createSignal, onCleanup, onMount } from 'solid-js'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import DetailPane from './components/DetailPane'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import { initSessionsStore, refreshSessions, selectedSession, selectSession } from './state/sessions-store'
import { initLiveConversationStore } from './state/live-conversation-store'
import { initComposerStore } from './state/composer-store'
import { initCatalogStore } from './state/catalog-store'
import { toastIsError, toastMessage, showToast } from './state/toast-store'
import { installSearchShortcut } from './lib/search-shortcut'
import { installNewSessionShortcut } from './lib/new-session-shortcut'
import { installScrollbarHover } from './lib/scrollbar-hover'
import { installPaneResizer } from './lib/pane-resizer'

export default function App() {
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false)
  let resizerRef: HTMLDivElement | undefined

  const startNewSessionInCurrentProject = (): void => {
    const session = selectedSession()
    if (!session) {
      showToast('Select a project first, or right-click one for a new session.', true)
      return
    }
    void window.navik.live.startNew(session.projectPath).then((result) => {
      if (result.success && result.placeholderId) selectSession(result.placeholderId)
      showToast(result.success ? `Starting a new session in ${session.projectPath}…` : result.error ?? 'Failed to launch.', !result.success)
    })
  }

  onMount(() => {
    const unsubscribeSessions = initSessionsStore()
    const unsubscribeLive = initLiveConversationStore()
    initComposerStore()
    initCatalogStore()
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
      <TitleBar onStartNewSession={startNewSessionInCurrentProject} onOpenShortcuts={() => setShortcutsOpen(true)} />
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
