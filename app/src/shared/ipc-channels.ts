export const IpcChannels = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowMaximizedChanged: 'window:maximized-changed',
  sessionsRefresh: 'sessions:refresh',
  sessionsChanged: 'sessions:changed',
  sessionsTogglePinned: 'sessions:toggle-pinned'
} as const
