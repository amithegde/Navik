import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const executableNames = ['claude.exe', 'claude.cmd', 'claude']

/** Resolves the claude executable path, or null if it could not be found. */
export function locateClaudeCli(): string | null {
  return locate(process.env.CLAUDE_NAVIK_CLI_PATH, process.env.PATH ?? '', os.homedir())
}

/** Core lookup, parameterized so it can be exercised against a fixture PATH/profile in tests. */
export function locate(overridePath: string | undefined, pathVariable: string, userProfile: string): string | null {
  if (overridePath && overridePath.trim() && existsSync(overridePath)) return overridePath

  for (const dir of pathVariable.split(path.delimiter).filter((d) => d.length > 0)) {
    for (const name of executableNames) {
      const candidate = path.join(dir.replace(/^"|"$/g, ''), name)
      if (existsSync(candidate)) return candidate
    }
  }

  for (const name of executableNames) {
    const candidate = path.join(userProfile, '.local', 'bin', name)
    if (existsSync(candidate)) return candidate
  }

  return null
}
