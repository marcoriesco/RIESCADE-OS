import { readFileSync, existsSync, opendirSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { System } from '../../shared/types'
import { getRiescadePath, getRetroBatPath } from '../utils/paths'
import { SettingsParser } from './SettingsParser'

export class SystemsParser {
  private static cachedSystems: System[] | null = null

  public static clearCache(): void {
    SystemsParser.cachedSystems = null
  }

  constructor() {}

  public parse(): System[] {
    if (SystemsParser.cachedSystems) {
      return SystemsParser.cachedSystems;
    }

    const systemsJsonPath = join(getRiescadePath(), 'configs', 'systems.json')
    let systems: System[] = []

    if (existsSync(systemsJsonPath)) {
      try {
        const content = readFileSync(systemsJsonPath, 'utf-8')
        const data = JSON.parse(content)
        if (data && Array.isArray(data.systems)) {
          systems = data.systems.map((s: any) => {
            const sName = String(s.name || '').toLowerCase()
            let sHardware = String(s.hardware || '')
            if (!sHardware) {
              if (['magazine', 'manuals', 'retrobat', 'emulators', 'screenshots', 'windows'].includes(sName)) {
                sHardware = 'system'
              } else {
                sHardware = 'console'
              }
            }
            return {
              name: String(s.name || ''),
              fullname: String(s.fullname || s.name || ''),
              path: String(s.path || ''),
              extension: String(s.extension || ''),
              command: String(s.command || ''),
              platform: String(s.platform || ''),
              theme: String(s.theme || s.name || ''),
              hardware: sHardware,
              group: s.group ? String(s.group) : undefined,
              emulators: Array.isArray(s.emulators) ? s.emulators.map((e: any) => ({
                name: String(e.name || ''),
                cores: Array.isArray(e.cores) ? e.cores.map((c: any) => String(c)) : [],
                command: e.command ? String(e.command) : undefined,
                source: e.source ? String(e.source) : undefined
              })) : []
            }
          })
        }
      } catch (err) {
        console.error(`Error parsing systems.json from ${systemsJsonPath}:`, err)
      }
    } else {
      console.warn(`systems.json not found at ${systemsJsonPath}`)
    }

    const settings = new SettingsParser()
    const showEmpty = settings.getSetting('LoadEmptySystems', 'bool')

    // Resolve all system paths and count games first
    const resolvedSystems = systems.map(s => {
      const fullPath = this.resolveRomPath(s.path)
      const pathExists = existsSync(fullPath)
      const count = pathExists ? this.countGames(fullPath) : 0
      
      return {
        ...s,
        path: fullPath,
        gamecount: count,
        _pathExists: pathExists
      }
    })

    try {
      const debugContent = resolvedSystems.map(s => `System: ${s.name}, Path: ${s.path}, Exists: ${s._pathExists}, Count: ${s.gamecount}`).join('\n')
      const logsDir = join(getRiescadePath(), 'logs')
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true })
      }
      writeFileSync(join(logsDir, 'debug_systems.log'), debugContent, 'utf-8')
    } catch (e) {
      console.error('Failed to write debug_systems.log:', e)
    }

    // Filter systems that have existing ROM folders or act as master groups for systems with games
    const filteredSystems = resolvedSystems.filter(s => {
      // 1. Keep if it has a physical ROM path and contains games (or showEmpty is active)
      if (s._pathExists && (s.gamecount > 0 || showEmpty)) {
        return true
      }

      // 2. Keep if it is a group master (another system has s.group === s.name) and that system has games
      const hasGroupedChildrenWithGames = resolvedSystems.some(child => 
        child.group && 
        child.group.toLowerCase() === s.name.toLowerCase() && 
        child._pathExists && 
        child.gamecount > 0
      )

      if (hasGroupedChildrenWithGames) {
        return true
      }

      return false
    }).map(s => {
      // Clean up the temporary field
      const { _pathExists, ...rest } = s as any
      return rest
    })

    SystemsParser.cachedSystems = filteredSystems
    return filteredSystems
  }

  private resolveRomPath(romPath: string): string {
    if (!romPath || romPath.trim() === '') {
      return ''
    }
    let path = romPath.replace('~', join(getRetroBatPath(), 'riescade'))
    return resolve(path)
  }

  private countGames(path: string): number {
    try {
      if (!existsSync(path)) return 0
      const dir = opendirSync(path)
      let hasFiles = false
      let entry = dir.readSync()
      while (entry) {
        if (!entry.name.startsWith('.')) {
          hasFiles = true
          break
        }
        entry = dir.readSync()
      }
      dir.closeSync()
      return hasFiles ? 1 : 0
    } catch {
      return 0
    }
  }
}
