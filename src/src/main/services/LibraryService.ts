import { join, resolve, relative, dirname } from 'path'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { SystemsParser } from '../parsers/SystemsParser'
import { GamelistParser } from '../parsers/GamelistParser'
import { SettingsParser } from '../parsers/SettingsParser'
import { getConfigPath, getRomsPath, getRetroBatPath, getLogsPath } from '../utils/paths'
import { System, Game } from '../../shared/types'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function normalizePathForComparison(p: string): string {
  if (!p) return ''
  return p
    .replace(/\\/g, '/')          // Normalize slashes
    .replace(/^\.\//, '')         // Remove leading ./
    .replace(/^\//, '')           // Remove leading /
    .trim()
    .toLowerCase()
}

export class LibraryService {
  private systemsParser: SystemsParser
  private gamelistParser: GamelistParser

  constructor() {
    this.systemsParser = new SystemsParser()
    this.gamelistParser = new GamelistParser()
  }

  private static cachedGames: Map<string, Game[]> = new Map()
  private static isPreloaded = false

  public static clearCache(): void {
    LibraryService.isPreloaded = false
    LibraryService.cachedGames.clear()
    try {
      SystemsParser.clearCache()
    } catch (e) {}
  }

  public async preloadAll(forcePhysicalScan = false): Promise<void> {
    if (LibraryService.isPreloaded) return

    const { BrowserWindow } = require('electron')
    const sendProgress = (p: number) => {
      try {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          win.webContents.send('systems-loading-progress', p)
        }
      } catch (err) {}
    }

    sendProgress(10)
    await delay(50)

    LibraryService.isPreloaded = true
    sendProgress(100)
  }

  public async preloadSystem(systemName: string, forcePhysicalScan = false): Promise<void> {
    const nameLower = systemName.toLowerCase()
    
    // Clear only this system's cache
    LibraryService.cachedGames.delete(nameLower)
    
    // Preload games for only this specific system
    try {
      const games = this.getGamesRaw(systemName, forcePhysicalScan)
      LibraryService.cachedGames.set(nameLower, games)
    } catch (err) {
      console.error(`Failed to preload games for ${systemName}:`, err)
    }

    // Send final progress update
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.webContents.send('systems-loading-progress', 100)
      }
    } catch (err) {}
  }

  public preloadAllSync(forcePhysicalScan = false): void {
    if (LibraryService.isPreloaded) return
    LibraryService.isPreloaded = true
  }

  public getSystems(): System[] {
    if (!LibraryService.isPreloaded) {
      this.preloadAllSync()
    }

    const parsed = this.systemsParser.parse()
    const systems = parsed.map(s => ({ ...s }))
    const settings = new SettingsParser()
    const sortMode = settings.getSetting('SortSystems', 'string') || 'hardware'

    // Set gamecount from preloaded cache
    systems.forEach(s => {
      const cached = LibraryService.cachedGames.get(s.name.toLowerCase())
      if (cached) {
        s.gamecount = cached.length
      } else {
        s.gamecount = 0
      }
    })

    return systems.sort((sys1, sys2) => {
      const getPriority = (sys: System) => {
        const name = sys.name.toLowerCase()
        
        // 1. Real Game Systems (The rest)
        const isSpecial = ['library', 'magazine', 'manuals', 'retrobat', 'screenshots'].includes(name) || sys.hardware === 'system'
        if (!isSpecial) return 1

        // 2. Special / Maintenance Systems
        return 2
      }

      const p1 = getPriority(sys1)
      const p2 = getPriority(sys2)

      if (p1 !== p2) return p1 - p2

      // Within the same priority, sort by hardware THEN name
      if (p1 === 1) {
        const hw1 = (sys1.hardware || 'console').toLowerCase()
        const hw2 = (sys2.hardware || 'console').toLowerCase()
        if (hw1 !== hw2) return hw1.localeCompare(hw2)
      }

      const name1 = (sys1.fullname || sys1.name).toUpperCase()
      const name2 = (sys2.fullname || sys2.name).toUpperCase()
      return name1.localeCompare(name2)
    })
  }

  public getDisplayedSystems(): System[] {
    const settings = new SettingsParser()
    const visibleSetting = settings.getSetting('VisibleSystems', 'string') || ''
    const hiddenSetting = settings.getSetting('HiddenSystems', 'string') || ''
    
    const visibleList = String(visibleSetting).split(',').filter(v => v.trim() !== '')
    const hiddenList = String(hiddenSetting).split(';').filter(v => v.trim() !== '')

    const systems = this.systemsParser.parse()

    let baseSystems = visibleList.length > 0 
      ? systems.filter(s => visibleList.includes(s.name))
      : systems

    if (hiddenList.length > 0) {
      baseSystems = baseSystems.filter(s => !hiddenList.includes(s.name))
    }

    return baseSystems
  }

  public getGamesFromDisplayedSystems(): Game[] {
    const displayed = this.getDisplayedSystems()
    const allGames: Game[] = []
    
    for (const sys of displayed) {
      const sysGames = this.getGames(sys.name)
      allGames.push(...sysGames)
    }

    return allGames
  }

  public getGames(systemName: string): Game[] {
    const nameLower = systemName.toLowerCase()
    
    if (LibraryService.cachedGames.has(nameLower)) {
      return LibraryService.cachedGames.get(nameLower)!
    }

    if (nameLower === 'collections') {
      const settings = new SettingsParser()
      const customSetting = settings.getSetting('CollectionSystemsCustom', 'string') || ''
      const enabledCols = String(customSetting).split(',').map(s => s.trim()).filter(s => s.length > 0)
      
      return enabledCols.map(colName => ({
        id: `collection_${colName}`,
        name: colName,
        desc: `Coleção de jogos: ${colName}`,
        path: colName,
        system: 'collections',
        favorite: false,
        hidden: false,
        playcount: 0,
        isCollectionFolder: true
      } as any))
    }

    const games = this.getGamesRaw(systemName)
    LibraryService.cachedGames.set(nameLower, games)
    return games
  }

  public getGamesRaw(systemName: string, forcePhysicalScan = false): Game[] {
    const systems = this.systemsParser.parse()
    const system = systems.find(s => s.name.toLowerCase() === systemName.toLowerCase())

    const configPath = getConfigPath()
    let gamelistPath = join(configPath, 'gamelists', systemName, 'gamelist.xml')
    let romsGamelistPath = join(getRomsPath(), systemName, 'gamelist.xml')
    let systemGamelistPath = system ? join(system.path, 'gamelist.xml') : ''

    // Fix collision between physical arcade system and virtual auto-arcade collection
    if (systemName === 'auto-arcade') {
      gamelistPath = join(configPath, 'gamelists', 'arcade', 'gamelist.xml')
      romsGamelistPath = ''
      systemGamelistPath = ''
    } else if (systemName === 'arcade') {
      gamelistPath = '' // Physical arcade should only load roms/arcade/gamelist.xml
    }
    
    let xmlGames: Game[] = []
    let source = 'none'

    if (romsGamelistPath && existsSync(romsGamelistPath)) {
      xmlGames = this.gamelistParser.parse(romsGamelistPath, systemName)
      if (xmlGames.length > 0) source = 'romsGamelistPath'
    }
    
    if (xmlGames.length === 0 && gamelistPath && existsSync(gamelistPath)) {
      xmlGames = this.gamelistParser.parse(gamelistPath, systemName)
      if (xmlGames.length > 0) source = 'gamelistPath'
    }
    
    if (xmlGames.length === 0 && systemGamelistPath && existsSync(systemGamelistPath)) {
      xmlGames = this.gamelistParser.parse(systemGamelistPath, systemName)
      if (xmlGames.length > 0) source = 'systemGamelistPath'
    }

    let games: Game[] = []

    if (system && existsSync(system.path)) {
      const settings = new SettingsParser()
      const parseGamelistOnly = settings.getSetting('ParseGamelistOnly', 'bool') === true

      if (xmlGames.length > 0 && !forcePhysicalScan) {
        games = xmlGames
        source = `${source}+trustXml`
      } else {
        const extensions = (system.extension || '').split(/\s+/).filter(e => e.trim().length > 0)
        const physicalGames = this.scanPhysicalGames(system.path, extensions, systemName)
        
        const xmlGamesMap = new Map<string, Game>()
        xmlGames.forEach(g => {
          xmlGamesMap.set(normalizePathForComparison(g.path), g)
        })

        let hasNewGames = false
        physicalGames.forEach(pg => {
          const normPath = normalizePathForComparison(pg.path)
          const xmlGame = xmlGamesMap.get(normPath)
          if (xmlGame) {
            games.push({
              ...pg,
              ...xmlGame,
              system: systemName,
              path: pg.path,
              id: xmlGame.id && !xmlGame.id.includes('/') && !xmlGame.id.includes('\\') ? xmlGame.id : pg.id
            })
          } else {
            games.push(pg)
            hasNewGames = true
          }
        })

        if ((hasNewGames || xmlGames.length === 0) && games.length > 0 && romsGamelistPath) {
          try {
            const fs = require('fs')
            const dir = dirname(romsGamelistPath)
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true })
            }
            this.gamelistParser.save(romsGamelistPath, games)
          } catch (e) {
            console.error(`Failed to save complete gamelist to ${romsGamelistPath}:`, e)
          }
        }

        source = `${source}+physicalScan`
      }
    } else {
      games = xmlGames
    }

    try {
      const logDir = getLogsPath()
      const fs = require('fs')
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      const logStr = `getGames systemName: ${systemName}\n  systemFound: ${!!system}\n  systemPath: ${system ? system.path : 'N/A'}\n  gamelistPath: ${gamelistPath} (exists: ${existsSync(gamelistPath)})\n  romsGamelistPath: ${romsGamelistPath} (exists: ${romsGamelistPath ? existsSync(romsGamelistPath) : false})\n  systemGamelistPath: ${systemGamelistPath} (exists: ${systemGamelistPath ? existsSync(systemGamelistPath) : false})\n  finalSource: ${source}\n  gamesCount: ${games.length}\n\n`
      fs.appendFileSync(join(logDir, 'debug_games.log'), logStr, 'utf-8')
    } catch(e) {
      console.error('Failed to write debug_games.log:', e)
    }

    const processedGames = games.map(g => {
      const sysLower = String(g.system || systemName).toLowerCase()
      if (!g.image || String(g.image).trim() === '') {
        const ext = (g.path.includes('.') ? g.path.substring(g.path.lastIndexOf('.')) : '').toLowerCase()
        if (ext === '.png' || (sysLower === 'pico8' && ext === '.p8')) {
          if (system && system.path) {
            g.image = resolve(system.path, g.path).replace(/\\/g, '/')
          }
        }
      }
      return g
    })

    return processedGames.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }



  private scanPhysicalGames(systemPath: string, extensions: string[], systemName: string): Game[] {
    const games: Game[] = []
    const extSet = new Set(extensions.map(e => e.toLowerCase().trim()))

    // Common MAME / NeoGeo BIOS and support device zip files to exclude from the playable list (isArcadeAsset)
    const ARCADE_ASSETS = new Set([
      'neogeo', 'awbios', 'cpis', 'decocass', 'pgm', 'skns', 'konamih', 'segaboot',
      'naomi', 'naomiboot', 'naomi2', 'hikaru', 'chihiro', 'triforce', 'sys246', 'sys256',
      'playchoice', 'nss', 'megaplay', 'megatech', 'cvs', 'stvbios', 'targ', 'titan',
      'zn1', 'zn2', 'namcoc74', 'namcoc75', 'namcoc76', 'qsound', 'qsound_cia', 'ym2608',
      'ym2610', 'midssio', 'midyunit', 'midxunit', 'midtunit', 'sega_c2', 'cchip'
    ])

    const japanDefaults = ['pc88', 'pc98', 'pcenginecd', 'pcfx', 'satellaview', 'sg1000', 'sufami', 'wswan', 'wswanc', 'x68000']
    const sysLower = systemName.toLowerCase()

    // Limit scanning recursion to depth 2 to prevent freezing on huge/system directories
    const scanDir = (dir: string, depth: number) => {
      if (depth > 2) return
      if (!existsSync(dir)) return
      try {
        const files = readdirSync(dir)

        for (const file of files) {
          const fullPath = join(dir, file)
          
          let stat;
          try {
            stat = statSync(fullPath)
          } catch (e) {
            continue; // Skip inaccessible or broken links/files
          }

          const ext = (file.includes('.') ? file.substring(file.lastIndexOf('.')) : '').toLowerCase()
          const stem = (file.includes('.') ? file.substring(0, file.lastIndexOf('.')) : file).toLowerCase()

          if (stat.isDirectory()) {
            if (extSet.has(ext)) {
              // Folder matches a valid system extension (e.g. .teknoparrot). Treat folder as a game and block internal scan.
              const relPath = './' + relative(systemPath, fullPath).replace(/\\/g, '/')
              const displayName = file.substring(0, file.length - ext.length)

              const game: Game = {
                id: fullPath.replace(/\\/g, '/'),
                name: displayName,
                path: relPath,
                system: systemName,
                favorite: false,
                hidden: false,
                playcount: 0
              } as any

              games.push(game)
            } else {
              // wiiu ignore optimization: ignore "content" and "meta" directories
              if (sysLower === 'wiiu' && (file.toLowerCase() === 'content' || file.toLowerCase() === 'meta')) {
                continue
              }
              // vpinball ignore optimization: ignore "roms" directory
              if (sysLower === 'vpinball' && file.toLowerCase() === 'roms') {
                continue
              }

              scanDir(fullPath, depth + 1)
            }
          } else {
            // It's a file
            if (extSet.has(ext)) {
              // Arcade / NeoGeo BIOS/Device filter
              if ((sysLower === 'arcade' || sysLower === 'neogeo') && ARCADE_ASSETS.has(stem)) {
                continue
              }

              const relPath = './' + relative(systemPath, fullPath).replace(/\\/g, '/')
              const displayName = file.substring(0, file.length - ext.length)

              // Default region and language parsing (LangInfo::parse)
              let defaultRegion = ''
              let defaultLang = 'en'

              if (japanDefaults.includes(sysLower)) {
                defaultRegion = 'jp'
                defaultLang = 'jp'
              } else if (sysLower === 'thomson') {
                defaultRegion = 'eu'
                defaultLang = 'fr'
              } else if (sysLower === 'arcade' || sysLower === 'neogeo') {
                if (file.toLowerCase().includes('j.zip')) {
                  defaultRegion = 'jp'
                  defaultLang = 'jp'
                } else {
                  defaultRegion = 'us'
                  defaultLang = 'en'
                }
              }

              const game: Game = {
                id: fullPath.replace(/\\/g, '/'),
                name: displayName,
                path: relPath,
                system: systemName,
                favorite: false,
                hidden: false,
                playcount: 0,
                region: defaultRegion,
                lang: defaultLang
              } as any

              // If it's the screenshots system, set the image property to the absolute path of the file itself!
              if (systemName === 'screenshots') {
                game.image = fullPath.replace(/\\/g, '/')
              }

              games.push(game)
            }
          }
        }
      } catch (err) {
        console.error(`Error scanning directory ${dir}:`, err)
      }
    }

    scanDir(systemPath, 0)
    return games
  }

  public getCustomCollections(): string[] {
    return []
  }

  public getCollectionGames(collectionName: string): Game[] {
    return []
  }

  public updateGame(systemName: string, gameData: Game): void {
    const targetSystem = gameData.system || systemName
    const configPath = getConfigPath()
    const gamelistPath = join(configPath, 'gamelists', targetSystem, 'gamelist.xml')
    const romsGamelistPath = join(getRomsPath(), targetSystem, 'gamelist.xml')
    
    const systems = this.getSystems()
    const system = systems.find(s => s.name.toLowerCase() === targetSystem.toLowerCase())
    const systemGamelistPath = system ? join(system.path, 'gamelist.xml') : ''

    const targetPath = romsGamelistPath
    if (!existsSync(targetPath)) {
      const fs = require('fs')
      const dir = dirname(targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      // If there's an existing gamelist elsewhere, copy it to initialize targetPath
      let initialized = false
      if (existsSync(gamelistPath)) {
        try {
          fs.copyFileSync(gamelistPath, targetPath)
          initialized = true
        } catch (e) {
          console.error(`Failed to copy existing gamelist from ${gamelistPath} to ${targetPath}:`, e)
        }
      } else if (systemGamelistPath && existsSync(systemGamelistPath)) {
        try {
          fs.copyFileSync(systemGamelistPath, targetPath)
          initialized = true
        } catch (e) {
          console.error(`Failed to copy existing gamelist from ${systemGamelistPath} to ${targetPath}:`, e)
        }
      }
      if (!initialized) {
        fs.writeFileSync(targetPath, '<?xml version="1.0"?>\n<gameList>\n</gameList>\n', 'utf-8')
      }
    }

    const games = this.gamelistParser.parse(targetPath, targetSystem)
    const index = games.findIndex(g => normalizePathForComparison(g.path) === normalizePathForComparison(gameData.path))
    
    if (index !== -1) {
      games[index] = { ...games[index], ...gameData }
    } else {
      games.push(gameData)
    }

    this.gamelistParser.save(targetPath, games)

    const cached = LibraryService.cachedGames.get(targetSystem.toLowerCase())
    if (cached) {
      const cIdx = cached.findIndex(g => normalizePathForComparison(g.path) === normalizePathForComparison(gameData.path))
      if (cIdx !== -1) {
        cached[cIdx] = { ...cached[cIdx], ...gameData }
      } else {
        cached.push(gameData)
      }
    }

  }

  public deleteGame(systemName: string, gamePath: string, deletePhysical: boolean): void {
    const fs = require('fs')
    const configPath = getConfigPath()
    const targetSystem = systemName

    // 1. Identify all possible gamelist.xml paths for this system
    const systems = this.getSystems()
    const system = systems.find(s => s.name.toLowerCase() === targetSystem.toLowerCase())
    const systemGamelistPath = system ? join(system.path, 'gamelist.xml') : ''

    const gamelistPaths = [
      join(configPath, 'gamelists', targetSystem, 'gamelist.xml'),
      join(getRomsPath(), targetSystem, 'gamelist.xml'),
      systemGamelistPath
    ].filter(p => p && existsSync(p))

    // 2. Remove game from all existing gamelists
    for (const gp of gamelistPaths) {
      try {
        const games = this.gamelistParser.parse(gp, targetSystem)
        const filteredGames = games.filter(
          g => normalizePathForComparison(g.path) !== normalizePathForComparison(gamePath)
        )
        this.gamelistParser.save(gp, filteredGames)
      } catch (e) {
        console.error(`Failed to delete game from gamelist ${gp}:`, e)
      }
    }



    // 4. Update in-memory cache
    const cached = LibraryService.cachedGames.get(targetSystem.toLowerCase())
    if (cached) {
      const filtered = cached.filter(
        g => normalizePathForComparison(g.path) !== normalizePathForComparison(gamePath)
      )
      LibraryService.cachedGames.set(targetSystem.toLowerCase(), filtered)
    }

    // 5. If requested, delete the physical file/folder
    if (deletePhysical && system && system.path) {
      try {
        const absRomPath = resolve(system.path, gamePath)
        if (existsSync(absRomPath)) {
          const stat = statSync(absRomPath)
          if (stat.isDirectory()) {
            fs.rmSync(absRomPath, { recursive: true, force: true })
          } else {
            fs.rmSync(absRomPath, { force: true })
          }
          console.log(`Physically deleted ROM: ${absRomPath}`)
        }
      } catch (e) {
        console.error(`Failed to physically delete game file at ${gamePath}:`, e)
      }
    }

  }

  public getCollectionsForGame(systemName: string, gamePath: string): string[] {
    return []
  }

  public toggleGameInCollection(collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove'): boolean {
    return false
  }

  public cleanGamelists(): void {
    const fs = require('fs')
    const resolve = require('path').resolve
    const systems = this.getSystems()
    const configPath = getConfigPath()

    for (const sys of systems) {
      if (sys.name === 'collections' || sys.path.startsWith('virtual://')) continue

      const gamelistPaths = [
        join(configPath, 'gamelists', sys.name, 'gamelist.xml'),
        join(getRomsPath(), sys.name, 'gamelist.xml'),
        join(sys.path, 'gamelist.xml')
      ]

      for (const gp of gamelistPaths) {
        if (fs.existsSync(gp)) {
          try {
            const games = this.gamelistParser.parse(gp, sys.name)
            const cleanedGames: Game[] = []

            for (const game of games) {
              const absRomPath = resolve(sys.path, game.path)
              if (fs.existsSync(absRomPath)) {
                const mediaFields = ['image', 'video', 'marquee', 'thumbnail', 'fanart', 'mix', 'wheel']
                mediaFields.forEach(field => {
                  const mediaPath = (game as any)[field]
                  if (mediaPath && typeof mediaPath === 'string' && !mediaPath.startsWith('http')) {
                    if (!fs.existsSync(mediaPath)) {
                      delete (game as any)[field]
                    }
                  }
                })
                cleanedGames.push(game)
              }
            }

            this.gamelistParser.save(gp, cleanedGames)
          } catch (e) {
            console.error(`Failed to clean gamelist ${gp}:`, e)
          }
        }
      }
    }
    LibraryService.clearCache()
  }

  public resetGamelistUsage(): void {
    const fs = require('fs')
    const systems = this.getSystems()
    const configPath = getConfigPath()

    for (const sys of systems) {
      if (sys.name === 'collections' || sys.path.startsWith('virtual://')) continue

      const gamelistPaths = [
        join(configPath, 'gamelists', sys.name, 'gamelist.xml'),
        join(getRomsPath(), sys.name, 'gamelist.xml'),
        join(sys.path, 'gamelist.xml')
      ]

      for (const gp of gamelistPaths) {
        if (fs.existsSync(gp)) {
          try {
            const games = this.gamelistParser.parse(gp, sys.name)
            for (const game of games) {
              game.playcount = 0
              delete (game as any).lastplayed
              delete (game as any).gametime
            }
            this.gamelistParser.save(gp, games)
          } catch (e) {
            console.error(`Failed to reset usage for ${gp}:`, e)
          }
        }
      }
    }
    LibraryService.clearCache()
  }

  public resetFileExtensions(): void {
    const settingsParser = new SettingsParser()
    const systems = this.getSystems()
    for (const sys of systems) {
      if (sys.name === 'collections' || sys.path.startsWith('virtual://')) continue
      settingsParser.saveSetting(sys.name + '.HiddenExt', '', 'string')
    }
  }

  public clearCaches(): void {
    const fs = require('fs')
    const os = require('os')
    const configPath = getConfigPath()
    
    const deleteDirFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return
      try {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const fullPath = join(dir, file)
          const stat = fs.statSync(fullPath)
          if (stat.isFile()) {
            fs.unlinkSync(fullPath)
          } else if (stat.isDirectory()) {
            deleteDirFiles(fullPath)
            try {
              fs.rmdirSync(fullPath)
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error(`Failed to delete files in ${dir}:`, e)
      }
    }

    deleteDirFiles(join(configPath, 'tmp'))
    deleteDirFiles(join(os.tmpdir(), 'riescade'))
  }

  public getGameSaveStates(systemName: string, gamePath: string): any[] {
    const fs = require('fs')
    const path = require('path')
    
    const savesDir = path.join(getRetroBatPath(), 'saves', systemName)
    if (!fs.existsSync(savesDir)) {
      return []
    }

    const romFilename = path.basename(gamePath)
    const ext = path.extname(romFilename)
    const romName = romFilename.substring(0, romFilename.length - ext.length)

    try {
      // Helper to recursively scan for files inside a directory up to a given depth limit
      const getAllFiles = (dir: string, depth = 0): string[] => {
        if (depth > 3) return []
        let results: string[] = []
        try {
          if (!fs.existsSync(dir)) return []
          const list = fs.readdirSync(dir)
          for (const file of list) {
            const fullPath = path.join(dir, file)
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory()) {
              results = results.concat(getAllFiles(fullPath, depth + 1))
            } else if (stat.isFile()) {
              results.push(fullPath)
            }
          }
        } catch (e) {
          // Ignore read errors
        }
        return results
      }

      const allFiles = getAllFiles(savesDir)
      const saveStates: any[] = []

      // Helper to escape regex
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedRomName = escapeRegExp(romName)

      // Regexes:
      // Autosave: romName.state.auto
      const autoRegex = new RegExp(`^${escapedRomName}\\.state\\.auto$`, 'i')
      // Standard: romName.state OR romName.state<digits>
      const slotRegex = new RegExp(`^${escapedRomName}\\.state(\\d*)$`, 'i')

      for (const fullPath of allFiles) {
        const file = path.basename(fullPath)
        try {
          const stat = fs.statSync(fullPath)

          let isMatch = false
          let slot = -2

          if (autoRegex.test(file)) {
            isMatch = true
            slot = -1
          } else {
            const match = file.match(slotRegex)
            if (match) {
              isMatch = true
              slot = match[1] === '' ? 0 : parseInt(match[1], 10)
            }
          }

          if (isMatch) {
            const screenshotPath = fullPath + '.png'
            const hasScreenshot = fs.existsSync(screenshotPath)
            const screenshotUrl = hasScreenshot 
              ? `file:///${screenshotPath.replace(/\\/g, '/')}`
              : undefined

            saveStates.push({
              slot,
              path: fullPath,
              date: stat.mtimeMs,
              screenshotUrl
            })
          }
        } catch (e) {
          console.error(`Error reading stats for save file ${file}:`, e)
        }
      }

      // Sort: Autosave (-1) first, then other slots in descending order of last modified date
      saveStates.sort((a, b) => {
        if (a.slot === -1) return -1
        if (b.slot === -1) return 1
        return b.date - a.date
      })

      return saveStates
    } catch (e) {
      console.error(`Error scanning save states in ${savesDir}:`, e)
      return []
    }
  }
}
