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
  sessionsPickFile: 'sessions:pick-file',

  projectsPickFolder: 'projects:pick-folder',

  liveStartNew: 'live:start-new',
  liveResume: 'live:resume',
  liveSendMessage: 'live:send-message',
  liveSetModel: 'live:set-model',
  liveSetPermissionMode: 'live:set-permission-mode',
  liveSetEffort: 'live:set-effort',
  liveGetState: 'live:get-state',
  liveConversationChanged: 'live:conversation-changed',
  liveRowSwapped: 'live:row-swapped',

  catalogGetModels: 'catalog:get-models',
  catalogGetCommands: 'catalog:get-commands',

  usageGet: 'usage:get',

  editorsGetAvailable: 'editors:get-available',
  editorsOpen: 'editors:open',

  terminalCreate: 'terminal:create',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const
