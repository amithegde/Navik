import TitleBar from './components/TitleBar'

export default function App() {
  return (
    <div class="app-window">
      <TitleBar />
      <div class="app-shell">
        <div class="sidebar">
          <div class="empty-list-hint">Session discovery lands in the next phase.</div>
        </div>
        <div class="pane-resizer" title="Drag to resize">
          <span class="resizer-grip">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
        <div class="detail-pane">
          <div class="home-empty-hint">Select or start a session to see it here.</div>
        </div>
      </div>
    </div>
  )
}
