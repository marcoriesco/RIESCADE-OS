import { app } from 'electron'
import { join, dirname, resolve } from 'path'
import { existsSync } from 'fs'

/**
 * Resolves the root folder of RIESCADE OS.
 * In packaged mode, the executable is at c:\tmp\RIESCADE OS\.riescade\RIESCADE.exe, so root is parent.
 * In development, we run from c:\tmp\RIESCADE OS\src, so root is parent.
 */
export function getRetroBatPath(): string {
  if (app.isPackaged) {
    return resolve(dirname(app.getPath('exe')), '..')
  }
  return resolve(process.cwd(), '..')
}

export function getConfigPath(): string {
  // Configs are stored inside the consolidated .riescade/config/ folder
  return join(getRiescadePath(), 'config')
}

export function getRiescadePath(): string {
  return join(getRetroBatPath(), '.riescade')
}

export function getRomsPath(): string {
  return join(getRetroBatPath(), 'roms')
}

export function getEmulatorsPath(): string {
  return join(getRetroBatPath(), 'emulators')
}

export function getDefaultThemePath(): string {
  return join(getUserThemesPath(), 'default')
}

export function getUserThemesPath(): string {
  return join(getRiescadePath(), 'themes')
}

export function getResourcesPath(): string {
  const devPath = join(getRetroBatPath(), 'src', 'src', 'main', 'resources')
  if (existsSync(devPath)) {
    return devPath
  }
  return join(getRiescadePath(), 'resources')
}

export function getLogosPath(): string {
  return join(getResourcesPath(), 'logos')
}

export function getArtsPath(): string {
  return join(getResourcesPath(), 'arts')
}

export function getFontsPath(): string {
  return join(getResourcesPath(), 'fonts')
}

export function getLogsPath(): string {
  return join(getRiescadePath(), 'logs')
}

