export interface RunningProcessInfo {
  pid: number
  sessionId: string
  cwd: string
  name?: string
  status?: string
  kind?: string
  entrypoint?: string
  startedAtUtc?: string
  updatedAtUtc?: string
}

export interface ClaudeSession {
  sessionId: string
  projectPath: string
  projectDisplayName: string
  title: string
  transcriptPath: string
  lastActivityUtc: string
  gitBranch?: string
  running?: RunningProcessInfo
}

export interface ClaudeProject {
  path: string
  displayName: string
  sessionCount: number
  runningCount: number
  lastActivityUtc: string
}

export interface SessionsSnapshot {
  sessions: ClaudeSession[]
  projects: ClaudeProject[]
  pinnedSessionIds: string[]
}
