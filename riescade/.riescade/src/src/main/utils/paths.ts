import { app } from 'electron'
import { join, dirname, resolve } from 'path'
import { existsSync } from 'fs'

/**
 * Resolves paths relative to the application base directory.
 * In development, it uses the project root.
 * In production, it uses the directory where the executable is located.
 */
export function getRetroBatPath(): string {
  if (app.isPackaged) {
    const exeDir = dirname(app.getPath('exe'))
    // Check if we are in the root (where riescade/ is a subfolder)
    if (existsSync(join(exeDir, 'riescade'))) {
      return exeDir
    }
    // Otherwise assume we are inside riescade/.riescade/ folder
    return resolve(exeDir, '..', '..')
  }
  // In development, we are in riescade/.riescade/src/
  // Go up to RIESCADE OS root
  return resolve(process.cwd(), '..', '..', '..')
}

export function getConfigPath(): string {
  return join(getRetroBatPath(), 'riescade', '.emulationstation')
}

export function getCollectionsPath(): string {
  return join(getRetroBatPath(), 'riescade', 'collections')
}

export function getMusicPath(): string {
  return join(getRetroBatPath(), 'riescade', 'music')
}

export function getRiescadePath(): string {
  return join(getRetroBatPath(), 'riescade', '.riescade')
}

export function getStatePath(): string {
  return join(getRiescadePath(), 'state')
}

export function getRomsPath(): string {
  return join(getRetroBatPath(), 'roms')
}

export function getEmulatorsPath(): string {
  return join(getRetroBatPath(), 'emulators')
}

/**
 * Returns the path to the bundled default theme.
 * In production: it's inside app resources (extraResources).
 * In development: it's in the source tree (src/main/theme_default).
 */
export function getDefaultThemePath(): string {
  return join(app.getAppPath(), 'src', 'main', 'theme_default')
}

/**
 * Returns the path to the user themes directory.
 * This is always outside the app bundle: riescade/.riescade/themes/
 */
export function getUserThemesPath(): string {
  return join(getRetroBatPath(), 'riescade', 'themes')
}

/**
 * Returns the path to the SQLite database used for ROM indexing.
 * Located at: riescade/.riescade/riescade.db
 */
export function getDatabasePath(): string {
  return join(getRiescadePath(), 'riescade.db')
}

// ─── RIESCADE OS Specific Resource Resolvers ───
export function getResourcesPath(): string {
  return join(app.getAppPath(), 'src', 'main', 'resources')
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
