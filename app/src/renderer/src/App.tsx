import { createSignal, onCleanup, onMount } from 'solid-js'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import DetailPane from './components/DetailPane'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import ProjectSelectModal from './components/ProjectSelectModal'
import SettingsModal from './components/SettingsModal'
import { initSessionsStore, refreshSessions } from './state/sessions-store'
import { initLiveConversationStore, startNewSessionInCurrentProject } from './state/live-conversation-store'
import { initComposerStore } from './state/composer-store'
import { initCatalogStore } from './state/catalog-store'
import { initUsageStore } from './state/usage-store'
import { initEditorStore } from './state/editor-store'
import { initSettingsStore } from './state/settings-store'
import { isZenMode } from './state/layout-store'
import { toastIsError, toastMessage } from './state/toast-store'
import { installSearchShortcut } from './lib/search-shortcut'
import { installNewSessionShortcut } from './lib/new-session-shortcut'
import { installNavShortcut } from './lib/nav-shortcut'
import { installScrollbarHover } from './lib/scrollbar-hover'
import { installPaneResizer } from './lib/pane-resizer'
import { installZenModeEscapeHatch } from './lib/zen-mode-shortcut'

export default function App() {
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false)
  let resizerRef: HTMLDivElement | undefined

  onMount(() => {
    const unsubscribeSessions = initSessionsStore()
    const unsubscribeLive = initLiveConversationStore()
    initComposerStore()
    initCatalogStore()
    initUsageStore()
    initEditorStore()
    initSettingsStore()
    void refreshSessions()

    const uninstallSearchShortcut = installSearchShortcut()
    const uninstallNewSessionShortcut = installNewSessionShortcut(startNewSessionInCurrentProject)
    const uninstallNavShortcut = installNavShortcut()
    const uninstallScrollbarHover = installScrollbarHover()
    const uninstallPaneResizer = resizerRef ? installPaneResizer(resizerRef) : undefined
    const uninstallZenModeEscapeHatch = installZenModeEscapeHatch()

    onCleanup(() => {
      unsubscribeSessions()
      unsubscribeLive()
      uninstallSearchShortcut()
      uninstallNewSessionShortcut()
      uninstallNavShortcut()
      uninstallScrollbarHover()
      uninstallPaneResizer?.()
      uninstallZenModeEscapeHatch()
    })
  })

  return (
    <div class="app-window">
      <TitleBar onOpenShortcuts={() => setShortcutsOpen(true)} />
      <div class="app-shell" classList={{ 'zen-mode': isZenMode() }}>
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
      <ProjectSelectModal />
      <SettingsModal />
    </div>
  )
}
