import os from 'node:os'
import path from 'node:path'

export interface ClaudeHome {
  rootDir: string
  projectsDir: string
  sessionsDir: string
  historyFile: string
}

export function resolveClaudeHome(): ClaudeHome {
  const overridden = process.env.CLAUDE_CONFIG_DIR
  const rootDir = overridden && overridden.trim().length > 0 ? overridden : path.join(os.homedir(), '.claude')

  return {
    rootDir,
    projectsDir: path.join(rootDir, 'projects'),
    sessionsDir: path.join(rootDir, 'sessions'),
    historyFile: path.join(rootDir, 'history.jsonl')
  }
}
