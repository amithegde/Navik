import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface LocatedEditors {
  vscode: string | null
  vscodeInsiders: string | null
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  const hits = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        return null
      }
    })
  )
  return hits.find((hit): hit is string => hit !== null) ?? null
}

function pathCandidates(names: string[]): string[] {
  const pathVar = process.env.PATH ?? ''
  const dirs = pathVar.split(path.delimiter).filter((d) => d.length > 0)
  const candidates: string[] = []
  for (const dir of dirs) {
    for (const name of names) {
      candidates.push(path.join(dir.replace(/^"|"$/g, ''), name))
    }
  }
  return candidates
}

function windowsCandidates(binName: string, dirName: string): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
  return [
    ...pathCandidates([`${binName}.cmd`, `${binName}.exe`]),
    path.join(localAppData, 'Programs', dirName, 'bin', `${binName}.cmd`),
    path.join('C:\\Program Files', dirName, 'bin', `${binName}.cmd`),
    path.join('C:\\Program Files (x86)', dirName, 'bin', `${binName}.cmd`)
  ]
}

function macCandidates(binName: string, appName: string): string[] {
  const home = os.homedir()
  return [
    ...pathCandidates([binName]),
    path.join('/Applications', `${appName}.app`, 'Contents', 'Resources', 'app', 'bin', binName),
    path.join(home, 'Applications', `${appName}.app`, 'Contents', 'Resources', 'app', 'bin', binName)
  ]
}

function linuxCandidates(binName: string): string[] {
  return [...pathCandidates([binName]), path.join('/snap/bin', binName), path.join('/usr/share/code/bin', binName)]
}

function candidatesFor(binName: string, windowsDirName: string, macAppName: string): string[] {
  if (process.platform === 'win32') return windowsCandidates(binName, windowsDirName)
  if (process.platform === 'darwin') return macCandidates(binName, macAppName)
  return linuxCandidates(binName)
}

/** Best-effort scan for VS Code / VS Code Insiders across common PATH and install locations. */
export async function locateEditors(): Promise<LocatedEditors> {
  const [vscode, vscodeInsiders] = await Promise.all([
    firstExisting(candidatesFor('code', 'Microsoft VS Code', 'Visual Studio Code')),
    firstExisting(candidatesFor('code-insiders', 'Microsoft VS Code Insiders', 'Visual Studio Code - Insiders'))
  ])
  return { vscode, vscodeInsiders }
}
