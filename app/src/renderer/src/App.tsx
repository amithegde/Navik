import { onCleanup, onMount, Show } from 'solid-js'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import HomeView from './components/HomeView'
import DetailPanePlaceholder from './components/DetailPanePlaceholder'
import { initSessionsStore, refreshSessions, selectedSession } from './state/sessions-store'
import { installSearchShortcut } from './lib/search-shortcut'

export default function App() {
  onMount(() => {
    const unsubscribe = initSessionsStore()
    void refreshSessions()
    const uninstallShortcut = installSearchShortcut()
    onCleanup(() => {
      unsubscribe()
      uninstallShortcut()
    })
  })

  return (
    <div class="app-window">
      <TitleBar />
      <div class="app-shell">
        <Sidebar />
        <div class="pane-resizer" title="Drag to resize">
          <span class="resizer-grip">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
        <Show when={selectedSession()} fallback={<HomeView />}>
          {(session) => <DetailPanePlaceholder session={session()} />}
        </Show>
      </div>
    </div>
  )
}
