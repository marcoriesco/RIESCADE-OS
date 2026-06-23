import { readFileSync, existsSync, opendirSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { System } from '../../shared/types'
import { getConfigPath, getRiescadePath, getRetroBatPath } from '../utils/paths'
import { SettingsParser } from './SettingsParser'
import { XMLParser } from 'fast-xml-parser'

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

    const configPath = getConfigPath()
    const mainSystemsPath = join(configPath, 'es_systems.cfg')
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: true,
      ignoreDeclaration: true
    })

    const parseSystemFile = (filePath: string): System[] => {
      if (!existsSync(filePath)) return []
      try {
        const content = readFileSync(filePath, 'utf-8')
        const xmlObj = parser.parse(content)
        const systemList = xmlObj.systemList?.system
        if (!systemList) return []
        const list = Array.isArray(systemList) ? systemList : [systemList]
        
        return list.map((s: any) => {
          const parseEmulators = (emulators: any) => {
            if (!emulators || !emulators.emulator) return []
            const emuList = Array.isArray(emulators.emulator) ? emulators.emulator : [emulators.emulator]
            return emuList.map((e: any) => ({
              name: String(e['@_name'] || ''),
              cores: e.cores?.core ? (Array.isArray(e.cores.core) ? e.cores.core : [e.cores.core]).map((c: any) => {
                if (c && typeof c === 'object') {
                  return String(c['#text'] || '').trim()
                }
                return String(c).trim()
              }) : [],
              command: e['@_command'] ? String(e['@_command']) : undefined
            }))
          }

          const sName = String(s.name || '').toLowerCase()
          let sHardware = String(s.hardware || '')
          if (!sHardware) {
            if (['library', 'magazine', 'manuals', 'retrobat', 'emulators', 'screenshots', 'windows'].includes(sName)) {
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
            emulators: parseEmulators(s.emulators)
          }
        })
      } catch (err) {
        console.error(`Error parsing system file ${filePath}:`, err)
        return []
      }
    }

    let systems: System[] = []
    const systemMap = new Map<string, System>()

    if (existsSync(mainSystemsPath)) {
      const mainSystems = parseSystemFile(mainSystemsPath)
      mainSystems.forEach(sys => {
        if (sys.name) {
          systemMap.set(sys.name.toLowerCase(), sys)
        }
      })

      // Load overrides (es_systems_*.cfg)
      try {
        const files = readdirSync(configPath)
        files.forEach(f => {
          if (f.startsWith('es_systems_') && f.endsWith('.cfg')) {
            const overrideSystems = parseSystemFile(join(configPath, f))
            overrideSystems.forEach(sys => {
              if (sys.name) {
                systemMap.set(sys.name.toLowerCase(), sys)
              }
            })
          }
        })
      } catch (err) {
        console.error('Error reading overrides in configs directory:', err)
      }

      systems = Array.from(systemMap.values())
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

    // Inject Auto Collections
    const autoColsString = settings.getSetting('CollectionSystemsAuto', 'string') || ''
    if (autoColsString) {
      const enabledCols = autoColsString.split(',').filter(c => c.trim() !== '' && c.trim().toLowerCase() !== 'arcade')
      
      // Map specific collection names to their ES theme folders
      const specificThemes: Record<string, string> = {
        'all': 'auto-allgames',
        'recent': 'auto-lastplayed',
        'favorites': 'auto-favorites',
        '2players': 'auto-at2players',
        '4players': 'auto-at4players',
        'neverplayed': 'auto-neverplayed',
        'retroachievements': 'auto-retroachievements',
        'vertical': 'auto-verticalarcade',
        'lightgun': 'auto-lightgun',
        'wheel': 'auto-wheel',
        'trackball': 'auto-trackball',
        'spinner': 'auto-spinner'
      }

      enabledCols.forEach(col => {
        let themeName = specificThemes[col] || col
        let displayName = col

        if (col.startsWith('_')) {
          // Genre collection: _action -> theme: auto-action
          themeName = `auto-${col.substring(1)}`
          displayName = col.substring(1)
        } else if (col.startsWith('z') && !specificThemes[col]) {
          // Arcade collection: znamco -> theme: namco
          themeName = col.substring(1)
          displayName = col.substring(1)
        } else if (!specificThemes[col]) {
          themeName = `auto-${col}`
          displayName = col
        }

        // Avoid duplicate system names if possible (e.g. arcade conflict)
        const isDuplicate = filteredSystems.some(s => s.name === col)
        const systemName = isDuplicate ? `auto-${col}` : col

        filteredSystems.push({
          name: systemName,
          fullname: displayName.toUpperCase(),
          path: `virtual://${col}`,
          extension: '',
          command: '',
          platform: 'pc',
          theme: themeName,
          hardware: 'auto collection',
          emulators: [],
          gamecount: 0
        })
      })
    }

    SystemsParser.cachedSystems = filteredSystems
    return filteredSystems
  }

  private resolveRomPath(romPath: string): string {
    const configPath = getConfigPath()
    let path = romPath.replace('~', join(getRetroBatPath(), 'riescade'))
    return resolve(configPath, path)
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
