import { XMLParser } from 'fast-xml-parser'
import { readFileSync, writeFileSync, existsSync, readdirSync, opendirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { System } from '../../shared/types'
import { getConfigPath, getRomsPath, getLogosPath, getArtsPath } from '../utils/paths'
import { SettingsParser } from './SettingsParser'

export class SystemsParser {
  private parser: XMLParser
  private static cachedSystems: System[] | null = null

  public static clearCache(): void {
    SystemsParser.cachedSystems = null
  }

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      processEntities: {
        maxTotalExpansions: 99999,
        maxExpandedLength: 1000000
      }
    })
  }

  public parse(): System[] {
    if (SystemsParser.cachedSystems) {
      return SystemsParser.cachedSystems;
    }

    const configPath = getConfigPath()
    const { app } = require('electron')
    const appPath = app.getAppPath()

    const possiblePaths = [
      join(appPath, 'src', 'main', 'resources', 'riescade_systems.json'),
      join(appPath, 'out', 'main', 'resources', 'riescade_systems.json'),
      join(__dirname, 'resources', 'riescade_systems.json'),
      join(__dirname, '..', 'resources', 'riescade_systems.json'),
      join(__dirname, '..', 'src', 'main', 'resources', 'riescade_systems.json'),
      join(process.cwd(), 'src', 'main', 'resources', 'riescade_systems.json')
    ]

    let jsonPath = ''
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        jsonPath = p
        break
      }
    }

    let systems: System[] = []

    if (jsonPath) {
      try {
        console.log(`[SystemsParser] Loading systems from local JSON database: ${jsonPath}`)
        const jsonContent = readFileSync(jsonPath, 'utf-8')
        systems = JSON.parse(jsonContent)
      } catch (err) {
        console.error('[SystemsParser] Failed to parse riescade_systems.json, falling back to XMLs:', err)
      }
    }

    if (systems.length === 0) {
      console.log('[SystemsParser] Falling back to standard XML files parsing')
      const mainSystemsPath = join(configPath, 'es_systems.cfg')
      const cfgFiles: string[] = []
      if (existsSync(mainSystemsPath)) cfgFiles.push(mainSystemsPath)

      if (existsSync(configPath)) {
        const files = readdirSync(configPath)
        files.forEach(f => {
          if (f.startsWith('es_systems_') && f.endsWith('.cfg')) {
            cfgFiles.push(join(configPath, f))
          }
        })
      }

      for (const cfgFile of cfgFiles) {
        const fileSystems = this.parseFile(cfgFile)
        systems = this.mergeSystems(systems, fileSystems)
      }
    }

    const settings = new SettingsParser()
    const showEmpty = settings.getSetting('LoadEmptySystems', 'bool')

    // Resolve all system paths and count games first
    const { BrowserWindow } = require('electron')
    let resolvedCount = 0
    const resolvedSystems = systems.map(s => {
      const fullPath = join(getRomsPath(), s.name)
      const pathExists = existsSync(fullPath)
      
      const nameLower = s.name.toLowerCase()
      let logoFile = join(getLogosPath(), `${s.name}.png`)
      if (!existsSync(logoFile)) {
        logoFile = join(getLogosPath(), `${nameLower}.png`)
      }
      const finalLogo = existsSync(logoFile) ? `file:///${logoFile.replace(/\\/g, '/')}` : ''

      let artFile = join(getArtsPath(), `${s.name}.jpg`)
      if (!existsSync(artFile)) {
        artFile = join(getArtsPath(), `${nameLower}.jpg`)
      }
      if (!existsSync(artFile)) {
        artFile = join(getArtsPath(), `${s.name}.png`)
      }
      if (!existsSync(artFile)) {
        artFile = join(getArtsPath(), `${nameLower}.png`)
      }
      const finalArt = existsSync(artFile) ? `file:///${artFile.replace(/\\/g, '/')}` : ''
      
      resolvedCount++
      const progress = Math.round((resolvedCount / systems.length) * 20)
      
      try {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('systems-loading-progress', progress)
        }
      } catch (err) {
        // Safe check in case window is not initialized yet
      }

      return {
        ...s,
        path: fullPath,
        gamecount: 0,
        logo: finalLogo,
        art: finalArt,
        _pathExists: pathExists
      }
    })

    try {
      const debugContent = resolvedSystems.map(s => `System: ${s.name}, Path: ${s.path}, Exists: ${s._pathExists}`).join('\n')
      const debugPath = join(configPath, '..', '.riescade', 'src', 'debug_systems.log')
      const debugDir = dirname(debugPath)
      const fs = require('fs')
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true })
      }
      writeFileSync(debugPath, debugContent, 'utf-8')
    } catch (e) {
      console.error('Failed to write debug_systems.log:', e)
    }

    // Filter systems that have existing ROM folders or act as master groups
    const filteredSystems = resolvedSystems.filter(s => {
      // 1. Keep if it has a physical ROM path (or showEmpty is active)
      if (s._pathExists || showEmpty) {
        return true
      }

      // 2. Keep if it is a group master (another system has s.group === s.name) and that system's folder exists
      const hasGroupedChildren = resolvedSystems.some(child => 
        child.group && 
        child.group.toLowerCase() === s.name.toLowerCase() && 
        child._pathExists
      )

      if (hasGroupedChildren) {
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

  private parseFile(filePath: string): System[] {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const jsonObj = this.parser.parse(content)
      const systemList = jsonObj.systemList?.system

      if (!systemList) return []

      const list = Array.isArray(systemList) ? systemList : [systemList]

      return list.map((s: any) => {
        const sName = String(s.name || '').toLowerCase()
        let sHardware = String(s.hardware || '')
        if (!sHardware) {
          if (['library', 'magazine', 'manuals', 'retrobat', 'screenshots', 'windows'].includes(sName)) {
            sHardware = 'system'
          } else {
            sHardware = 'console'
          }
        }

        return {
          name: String(s.name),
          fullname: String(s.fullname || s.name),
          path: String(s.path),
          extension: String(s.extension || ''),
          command: String(s.command || ''),
          platform: String(s.platform || ''),
          theme: String(s.theme || s.name),
          hardware: sHardware,
          group: s.group ? String(s.group) : undefined,
          emulators: this.parseEmulators(s.emulators)
        }
      })
    } catch (error) {
      console.error(`Error parsing systems file ${filePath}:`, error)
      return []
    }
  }

  private resolveRomPath(romPath: string): string {
    const configPath = getConfigPath()
    // Resolve ~ to configPath parent (RetroBat root)
    let path = romPath.replace('~', join(configPath, '..'))
    // Handle relative paths
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

  private parseEmulators(emulators: any): any[] {
    if (!emulators || !emulators.emulator) return []
    const emulatorList = Array.isArray(emulators.emulator) ? emulators.emulator : [emulators.emulator]

    return emulatorList.map((e: any) => ({
      name: e['@_name'],
      cores: this.parseCores(e.cores)
    }))
  }

  private parseCores(cores: any): string[] {
    if (!cores || !cores.core) return []
    return Array.isArray(cores.core) ? cores.core : [cores.core]
  }

  private mergeSystems(base: System[], custom: System[]): System[] {
    const map = new Map<string, System>()
    base.forEach((s) => map.set(s.name, s))
    custom.forEach((s) => map.set(s.name, s))
    return Array.from(map.values())
  }
}
