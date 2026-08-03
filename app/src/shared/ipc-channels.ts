export const IpcChannels = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowMaximizedChanged: 'window:maximized-changed',

  sessionsRefresh: 'sessions:refresh',
  sessionsChanged: 'sessions:changed',
  sessionsTogglePinned: 'sessions:toggle-pinned',
  sessionsReadTranscript: 'sessions:read-transcript',
  sessionsOpenInTerminal: 'sessions:open-in-terminal',
  sessionsStop: 'sessions:stop',

  liveStartNew: 'live:start-new',
  liveResume: 'live:resume',
  liveSendMessage: 'live:send-message',
  liveSetModel: 'live:set-model',
  liveSetPermissionMode: 'live:set-permission-mode',
  liveGetState: 'live:get-state',
  liveConversationChanged: 'live:conversation-changed',

  catalogGetModels: 'catalog:get-models',
  catalogGetCommands: 'catalog:get-commands'
} as const
