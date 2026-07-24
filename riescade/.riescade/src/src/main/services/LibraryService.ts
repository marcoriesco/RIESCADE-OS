import { join, resolve, relative, dirname } from 'path'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { SystemsParser } from '../parsers/SystemsParser'
import { SettingsParser } from '../parsers/SettingsParser'
import { getConfigPath, getRomsPath, getRetroBatPath, getDatabasePath, getRiescadePath, getLogosPath, getArtsPath } from '../utils/paths'
import { System, Game } from '../../shared/types'
import { DatabaseService } from './DatabaseService'

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
  private static databaseService: DatabaseService = new DatabaseService()

  constructor() {
    this.systemsParser = new SystemsParser()
  }

  public static isDbMode(): boolean {
    return true // Always DB mode
  }

  /**
   * Get the shared DatabaseService instance.
   */
  public static getDatabase(): DatabaseService {
    return LibraryService.databaseService
  }

  private static cachedGames: Map<string, Game[]> = new Map()
  private static fullyLoadedSystems: Set<string> = new Set()
  private static quickAutoCounts: Map<string, number> = new Map()
  private static isPreloaded = false

  /**
   * GamesDB control type data: maps controlType -> systemName -> Set<gameId>
   * Used for wheel, trackball, spinner, lightgun auto-collections.
   */
  private static gamesDbControlData: Map<string, Map<string, Set<string>>> | null = null
  /** Vertical arcade game IDs (from gamesdb.xml <vertical/> tags or genre fallback) */
  private static verticalGameIds: Set<string> | null = null

  public static clearCache(): void {
    LibraryService.isPreloaded = false
    LibraryService.cachedGames.clear()
    LibraryService.fullyLoadedSystems.clear()
    LibraryService.quickAutoCounts.clear()
    LibraryService.genreMap = null
    LibraryService.gamesDbControlData = null
    LibraryService.verticalGameIds = null
    try {
      SystemsParser.clearCache()
    } catch (e) {
      console.warn('[LibraryService] Failed to clear systems cache.', e)
    }
    // Note: DB is NOT cleared on cache clear - it persists across sessions
  }

  /**
   * Build a mapping from ES collection key (e.g. 'shootemup', 'beatemup') to
   * all possible localized genre names that should match, based on genres.xml.
   * This replicates the ES C++ logic from CollectionSystemManager::getSystemDecls().
   */
  private static genreMap: Map<string, Set<string>> | null = null

  private buildGenreMap(): Map<string, Set<string>> {
    if (LibraryService.genreMap) return LibraryService.genreMap

    const genreMap = new Map<string, Set<string>>()
    const genresXmlPath = join(getRetroBatPath(), 'emulationstation', 'resources', 'genres.xml')
    
    if (!existsSync(genresXmlPath)) {
      LibraryService.genreMap = genreMap
      return genreMap
    }

    try {
      const { XMLParser } = require('fast-xml-parser')
      const parser = new XMLParser({ ignoreAttributes: false })
      const xmlContent = readFileSync(genresXmlPath, 'utf8')
      const parsed = parser.parse(xmlContent)
      const genres = parsed.genres?.genre
      if (!genres) {
        LibraryService.genreMap = genreMap
        return genreMap
      }

      const genreList = Array.isArray(genres) ? genres : [genres]
      
      // Build index by id
      const byId = new Map<number, any>()
      for (const g of genreList) {
        if (g.id) byId.set(Number(g.id), g)
      }

      // ES logic: collection key = toLower(nom_en).replace(/ |'|,|-/g, '').replace(/game/g, '')
      const toColKey = (name: string): string => {
        return name.toLowerCase()
          .replace(/[\s',\-]/g, '')
          .replace(/game/g, '')
      }

      // For each top-level genre (parentId == 0 or no parent), create a collection entry
      for (const g of genreList) {
        if (g.parent) continue // skip child genres for collection key generation
        
        const nomEn = String(g.nom_en || '')
        if (!nomEn) continue
        
        const colKey = toColKey(nomEn)
        if (!colKey) continue

        // Collect ALL localized names for this genre and its children
        const names = new Set<string>()
        const addNames = (genre: any) => {
          const fields = ['nom_en', 'nom_fr', 'nom_de', 'nom_es', 'nom_pt', 'nom_ja']
          for (const f of fields) {
            if (genre[f]) names.add(String(genre[f]).toUpperCase())
          }
          // Add alt names
          if (genre.altname) {
            const alts = Array.isArray(genre.altname) ? genre.altname : [genre.altname]
            for (const alt of alts) names.add(String(alt).toUpperCase())
          }
        }

        addNames(g)
        
        // Find children of this genre
        for (const child of genreList) {
          if (Number(child.parent) === Number(g.id)) {
            addNames(child)
            // Also add "Parent / Child" format names
            const parentFields = ['nom_en', 'nom_fr', 'nom_de', 'nom_es', 'nom_pt', 'nom_ja']
            const childFields = ['nom_en', 'nom_fr', 'nom_de', 'nom_es', 'nom_pt', 'nom_ja']
            for (const pf of parentFields) {
              for (const cf of childFields) {
                if (g[pf] && child[cf]) {
                  names.add((String(g[pf]) + ' / ' + String(child[cf])).toUpperCase())
                }
              }
            }
          }
        }

        genreMap.set(colKey, names)
      }
    } catch (e) {
      console.error('Error parsing genres.xml:', e)
    }

    LibraryService.genreMap = genreMap
    return genreMap
  }

  /**
   * Parse gamesdb.xml to build control type data (wheel, trackball, spinner, lightgun).
   * Returns: controlType -> systemId -> Set<gameId>
   * This replicates the C++ MameNames logic used by isWheelGame(), isTrackballGame(), etc.
   */
  private static readonly CONTROL_TYPE_TAGS = ['wheel', 'trackball', 'spinner', 'gun'] as const
  private static readonly TAG_TO_COLKEY: Record<string, string> = { wheel: 'wheel', trackball: 'trackball', spinner: 'spinner', gun: 'lightgun' }

  private parseGamesDb(): Map<string, Map<string, Set<string>>> {
    if (LibraryService.gamesDbControlData) return LibraryService.gamesDbControlData

    const controlData = new Map<string, Map<string, Set<string>>>()
    const gamesDbPath = join(getRetroBatPath(), 'emulationstation', 'resources', 'gamesdb.xml')

    if (!existsSync(gamesDbPath)) {
      LibraryService.gamesDbControlData = controlData
      return controlData
    }

    try {
      const content = readFileSync(gamesDbPath, 'utf8')
      // Parse each <system> block
      const systemRegex = /<system\s+id="([^"]+)">([\s\S]*?)<\/system>/gi
      let sysMatch: RegExpExecArray | null
      while ((sysMatch = systemRegex.exec(content)) !== null) {
        const systemId = sysMatch[1].toLowerCase()
        const systemBlock = sysMatch[2]

        // Parse each <game> block within this system
        const gameRegex = /<game\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/game>/gi
        let gameMatch: RegExpExecArray | null
        while ((gameMatch = gameRegex.exec(systemBlock)) !== null) {
          const gameId = gameMatch[1].toLowerCase()
          const gameBlock = gameMatch[2]

          // Check for control type tags
          for (const tag of LibraryService.CONTROL_TYPE_TAGS) {
            if (new RegExp(`<${tag}[\\s/>]`, 'i').test(gameBlock)) {
              const colKey = LibraryService.TAG_TO_COLKEY[tag]
              if (!controlData.has(colKey)) controlData.set(colKey, new Map())
              const systemMap = controlData.get(colKey)!
              if (!systemMap.has(systemId)) systemMap.set(systemId, new Set())
              systemMap.get(systemId)!.add(gameId)
            }
          }
        }
      }
    } catch (e) {
      console.error('Error parsing gamesdb.xml:', e)
    }

    LibraryService.gamesDbControlData = controlData
    return controlData
  }


  private getQuickGameCount(systemName: string): number {
    try {
      const configPath = getConfigPath()
      const systems = this.systemsParser.parse()
      const system = systems.find(s => s.name.toLowerCase() === systemName.toLowerCase())
      const paths = [
        join(getRomsPath(), systemName, 'gamelist.xml'),
        join(configPath, 'gamelists', systemName, 'gamelist.xml'),
        system ? join(system.path, 'gamelist.xml') : ''
      ].filter(Boolean)

      for (const p of paths) {
        if (existsSync(p)) {
          const content = readFileSync(p, 'utf8')
          const matches = content.match(/<game[\s>]/g)
          return matches ? matches.length : 0
        }
      }

      if (system && existsSync(system.path)) {
        const files = readdirSync(system.path)
        return files.filter(f => !f.startsWith('.')).length
      }
    } catch (e) {
      console.error(`Error in getQuickGameCount for ${systemName}:`, e)
    }
    return 0
  }

  public async preloadAll(forcePhysicalScan = false): Promise<void> {
    if (LibraryService.isPreloaded) return

    const { BrowserWindow } = require('electron')
    const sendProgress = (p: number, statusKey?: string) => {
      try {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          console.log(`[StartLoader:Backend] sendProgress(${p}, '${statusKey}')`)
          win.webContents.send('systems-loading-progress', p, statusKey)
        }
      } catch (err) {
        console.warn(`[LibraryService] Failed to inspect system configuration at ${p}.`, err)
      }
    }

    const useDb = LibraryService.isDbMode()
    const dbService = LibraryService.databaseService
    if (useDb) {
      dbService.open()
    }

    // Perform robust fast-path validation without parsing systems.json upfront
    let needsSync = false
    let changedSystemsCount = 0
    let systemsCheckedCount = 0

    if (useDb && dbService.migrationOccurred) {
      console.log('[SyncCheck] Database schema migration occurred. Sync required.')
      needsSync = true
    } else if (useDb && !forcePhysicalScan && dbService.getIndexedSystemCount() > 0) {
      console.log('[SyncCheck] Starting startup synchronization check...')
      
      const systemsJsonPath = join(getRiescadePath(), 'configs', 'systems.json')
      let currentSystemsJsonMtime = 0
      let currentEsSystemsFileCount = 0
      try {
        if (existsSync(systemsJsonPath)) {
          currentSystemsJsonMtime = Math.round(statSync(systemsJsonPath).mtimeMs)
          currentEsSystemsFileCount = 1
        }
      } catch (error) {
        console.warn(`[LibraryService] Failed to inspect systems configuration at ${systemsJsonPath}.`, error)
      }

      // Check es_systems.cfg and overrides modification
      const systemsJsonRecord = dbService.getSystemSyncMetadata('__es_systems.cfg')
      if (!systemsJsonRecord) {
        console.log('[SyncCheck] Virtual record for es_systems.cfg not found in DB. Sync required.')
        needsSync = true
      } else if (
        currentSystemsJsonMtime !== systemsJsonRecord.folder_mtime ||
        currentEsSystemsFileCount !== systemsJsonRecord.file_count
      ) {
        console.log(`[SyncCheck] es_systems.cfg or overrides modified: DB mtime ${systemsJsonRecord.folder_mtime} vs Disk mtime ${currentSystemsJsonMtime}, DB file count ${systemsJsonRecord.file_count} vs Disk file count ${currentEsSystemsFileCount}. Sync required.`)
        needsSync = true
      }

      if (!needsSync) {
        const syncMetadata = dbService.getAllSystemsSyncMetadata()
        for (const sys of syncMetadata) {
          if (!sys.path || sys.path.startsWith('virtual://') || sys.name === 'collections') continue
          
          systemsCheckedCount++
          const folderExists = existsSync(sys.path)
          if (!folderExists) {
            console.log(`[SyncCheck] Folder for system ${sys.name} does not exist at ${sys.path}. Sync required.`)
            needsSync = true
            changedSystemsCount++
            continue
          }

          let currentMtime = 0
          let currentFileCount = 0
          try {
            currentMtime = statSync(sys.path).mtimeMs
            currentFileCount = readdirSync(sys.path).length
          } catch (err) {
            console.error(`[SyncCheck] Failed to stat or read directory for system ${sys.name}:`, err)
            needsSync = true
            changedSystemsCount++
            continue
          }

          const mtimeMatches = currentMtime === sys.folder_mtime
          const fileCountMatches = currentFileCount === sys.file_count

          if (!mtimeMatches || !fileCountMatches) {
            console.log(`[SyncCheck] System '${sys.name}' changed: mtime matches: ${mtimeMatches} (${sys.folder_mtime} vs ${currentMtime}), fileCount matches: ${fileCountMatches} (${sys.file_count} vs ${currentFileCount})`)
            needsSync = true
            changedSystemsCount++
          }
        }
      }
    } else if (useDb) {
      needsSync = true // First run or forced scan
    }

    // Fast path: DB already indexed and no modifications detected, skip re-sync and just load cached data
    const isDbAlreadyIndexed = useDb && !forcePhysicalScan && dbService.getIndexedSystemCount() > 0 && !needsSync
    if (isDbAlreadyIndexed) {
      LibraryService.isPreloaded = true
      console.log(`[SyncCheck] All ${systemsCheckedCount} systems are up-to-date. SQLite fast path active.`)
      sendProgress(10, 'LOADING_PLATFORMS')

      sendProgress(80, 'LOADING_PLATFORMS')
      await delay(50)
      sendProgress(100, 'READY')
      return
    }

    if (useDb && changedSystemsCount > 0) {
      console.log(`[SyncCheck] ${changedSystemsCount}/${systemsCheckedCount} system(s) require synchronization. Initiating re-indexing.`)
    }

    const isFirstRun = useDb && dbService.getIndexedSystemCount() === 0
    const initialStatusKey = useDb 
      ? (isFirstRun ? 'INDEXING_DATABASE' : 'UPDATING_DATABASE')
      : 'LOADING_PLATFORMS'

    sendProgress(5, initialStatusKey)
    await delay(50)

    if (useDb) {
      // ─── DB Mode: sync systems into SQLite ───
      // Parse all systems first
      const allSystems = this.systemsParser.parse()
      sendProgress(10, initialStatusKey)

      // Sync all systems (only changed ones will be re-indexed)
      const scanFn = this.scanPhysicalGames.bind(this)
      await dbService.syncAll(allSystems, scanFn, (sysName, current, total) => {
        const progress = 10 + Math.round((current / total) * 40)
        sendProgress(progress, initialStatusKey)
      })

      sendProgress(50, initialStatusKey)

      sendProgress(80, initialStatusKey)
    }

    await delay(50)

    LibraryService.isPreloaded = true
    sendProgress(100, initialStatusKey)
  }

  public async preloadSystem(systemName: string, forcePhysicalScan = false): Promise<void> {
    const nameLower = systemName.toLowerCase()
    
    // Clear only this system's cache
    LibraryService.cachedGames.delete(nameLower)
    
    const dbService = LibraryService.databaseService
    dbService.open()

    const systems = this.systemsParser.parse()
    const systemObj = systems.find(s => s.name.toLowerCase() === nameLower)
    if (systemObj) {
      try {
        const scanFn = this.scanPhysicalGames.bind(this)
        dbService.syncSystem(systemObj, scanFn, true)
      } catch (err) {
        console.error(`Failed to sync system database for ${systemName}:`, err)
      }
    }

    try {
      const settings = new SettingsParser()
      const showHidden = settings.getSetting('ShowHidden', 'bool') === true
      const games = dbService.getGamesBySystem(systemName, showHidden)
      LibraryService.cachedGames.set(nameLower, games)
    } catch (err) {
      console.error(`Failed to load games from DB after update for ${systemName}:`, err)
    }
    
    // Re-resolve and update all auto-collections based on the new cached games
    const displayed = this.getDisplayedSystems()
    const autoColSystems = this.systemsParser.parse().filter(s => s.hardware === 'auto collection')
    
    for (const autoSys of autoColSystems) {
      const nameLow = autoSys.name.toLowerCase()
      const cleanCol = nameLow.startsWith('auto-') ? nameLow.substring(5) : nameLow
      let resolveKey = cleanCol
      if (cleanCol.startsWith('_')) resolveKey = cleanCol.substring(1)
      else if (cleanCol.startsWith('z')) resolveKey = cleanCol.substring(1)
      
      const cacheKey = nameLow
      if (LibraryService.cachedGames.has(cacheKey)) {
        try {
          const colGames = this.resolveAutoCollectionGames(resolveKey)
          LibraryService.cachedGames.set(cacheKey, colGames)
        } catch (err) {
          console.error(`Failed to preload auto collection ${autoSys.name} after system update:`, err)
        }
      }
    }

    // Send final progress update
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        const isFirstRun = LibraryService.databaseService.isOpen() && LibraryService.databaseService.getIndexedSystemCount() === 0
        const statusKey = isFirstRun ? 'INDEXING_DATABASE' : 'UPDATING_DATABASE'
        win.webContents.send('systems-loading-progress', 100, statusKey)
      }
    } catch (err) {
      console.warn('[LibraryService] Failed to initialize or synchronize the database.', err)
    }
  }

  public async rebuildDatabase(onProgress?: (systemName: string, current: number, total: number) => void): Promise<void> {
    const dbService = LibraryService.databaseService
    dbService.open()
    const allSystems = this.systemsParser.parse()
    const scanFn = this.scanPhysicalGames.bind(this)
    await dbService.rebuildAll(allSystems, scanFn, onProgress)
  }

  public preloadAllSync(forcePhysicalScan = false): void {
    if (LibraryService.isPreloaded) return
    
    const dbService = LibraryService.databaseService
    dbService.open()
    
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

    // Set gamecount from preloaded cache or quick count
    const useDbForCounts = LibraryService.isDbMode() && LibraryService.databaseService.isOpen()
    const dbGameCounts = useDbForCounts ? LibraryService.databaseService.getAllGameCounts() : null

    systems.forEach(s => {
      const themeLower = (s.theme || s.name || '').toLowerCase()
      const logoFile = join(getLogosPath(), `${themeLower}.webp`)
      const artFile = join(getArtsPath(), `${themeLower}.webp`)
      
      if (existsSync(logoFile)) {
        s.logo = `file:///${logoFile.replace(/\\/g, '/')}`
      }
      if (existsSync(artFile)) {
        s.art = `file:///${artFile.replace(/\\/g, '/')}`
      }

      const nameLower = s.name.toLowerCase()
      const cleanColName = nameLower.startsWith('auto-') ? nameLower.substring(5) : nameLower

      const cached = LibraryService.cachedGames.get(nameLower)
      const isSpecial = ['magazine', 'manuals', 'retrobat', 'emulators', 'screenshots'].includes(nameLower) || s.hardware === 'system'

      if (cached) {
        s.gamecount = cached.length
      } else if (s.hardware === 'auto collection') {
        // Try direct key first, then strip _ or z prefix for genre/manufacturer collections
        let countKey = cleanColName
        if (!LibraryService.quickAutoCounts.has(countKey)) {
          if (cleanColName.startsWith('_')) {
            countKey = cleanColName.substring(1)
          } else if (cleanColName.startsWith('z')) {
            countKey = cleanColName.substring(1)
          }
        }
        s.gamecount = LibraryService.quickAutoCounts.get(countKey) || 0
      } else if (isSpecial) {
        s.gamecount = this.getQuickGameCount(s.name)
      } else if (dbGameCounts) {
        // DB mode: use batch SQL counts
        s.gamecount = dbGameCounts.get(s.name) || 0
      } else {
        s.gamecount = this.getQuickGameCount(s.name)
      }
    })

    return systems.sort((sys1, sys2) => {
      const getPriority = (sys: System) => {
        const name = sys.name.toLowerCase()
        if (name === 'all') return 1
        if (name === 'favorites') return 2
        if (name === 'collections') return 3
        if (name === 'retrobat') return 4
        if (name === 'screenshots') return 5
        return 6
      }

      const p1 = getPriority(sys1)
      const p2 = getPriority(sys2)

      if (p1 !== p2) return p1 - p2

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
      ? systems.filter(s => 
          visibleList.includes(s.name) || 
          s.name === 'collections' ||
          s.path.startsWith('virtual://')
        )
      : systems

    if (hiddenList.length > 0) {
      baseSystems = baseSystems.filter(s => !hiddenList.includes(s.name))
    }

    return baseSystems.filter(s => 
      s.name !== 'collections' && 
      !s.path.startsWith('virtual://') && 
      s.hardware !== 'auto collection' &&
      s.hardware !== 'system' &&
      s.hardware !== 'custom-collections'
    )
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

    if (nameLower === 'collections') {
      const enabledCols = this.getCustomCollections()
      const countsMap = this.getCustomCollectionsGameCounts()
      
      return enabledCols.map(colName => {
        const normName = colName.toLowerCase().replace(/[^a-z0-9]/g, '')
        
        let logoFile = join(getLogosPath(), 'collections', `${normName}.webp`)
        if (!existsSync(logoFile)) {
          logoFile = join(getLogosPath(), 'collections', `${colName}.webp`)
        }
        
        let artFile = join(getArtsPath(), 'collections', `${normName}.webp`)
        if (!existsSync(artFile)) {
          artFile = join(getArtsPath(), 'collections', `${colName}.webp`)
        }
        
        const gameObj: any = {
          id: `collection_${colName}`,
          name: colName,
          desc: `Coleção de jogos: ${colName}`,
          path: colName,
          system: 'collections',
          favorite: false,
          hidden: false,
          playcount: 0,
          isCollectionFolder: true,
          gameCount: countsMap.get(colName) || 0
        }

        if (existsSync(logoFile)) {
          const logoPath = `file:///${logoFile.replace(/\\/g, '/')}`
          gameObj.marquee = logoPath
          gameObj.logo = logoPath
        }
        if (existsSync(artFile)) {
          const artPath = `file:///${artFile.replace(/\\/g, '/')}`
          gameObj.fanart = artPath
          gameObj.cover = artPath
        }

        return gameObj
      })
    }

    if (nameLower === 'all' || nameLower === 'favorites') {
      if (LibraryService.cachedGames.has(nameLower)) {
        return LibraryService.cachedGames.get(nameLower)!
      }

      if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
        const displayed = this.getDisplayedSystems()
        const displayedNames = displayed.map(s => s.name)
        const games = LibraryService.databaseService.getAutoCollectionGames(nameLower, displayedNames)
        LibraryService.cachedGames.set(nameLower, games)
        return games
      }

      const games = this.resolveAutoCollectionGames(nameLower)
      LibraryService.cachedGames.set(nameLower, games)
      return games
    }

    // Check if it is an auto-collection by looking up system hardware
    const allSystems = this.systemsParser.parse()
    const matchedSystem = allSystems.find(s => s.name.toLowerCase() === nameLower)

    if (matchedSystem && matchedSystem.hardware === 'auto collection') {
      if (LibraryService.cachedGames.has(nameLower)) {
        return LibraryService.cachedGames.get(nameLower)!
      }
      let cleanColName = nameLower.startsWith('auto-') ? nameLower.substring(5) : nameLower
      if (cleanColName.startsWith('_')) cleanColName = cleanColName.substring(1)
      else if (cleanColName.startsWith('z')) cleanColName = cleanColName.substring(1)

      // DB mode: use SQL queries for auto-collections
      if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
        const displayed = this.getDisplayedSystems()
        const displayedNames = displayed.map(s => s.name)
        const games = LibraryService.databaseService.getAutoCollectionGames(cleanColName, displayedNames)
        LibraryService.cachedGames.set(nameLower, games)
        return games
      }

      const games = this.resolveAutoCollectionGames(cleanColName)
      LibraryService.cachedGames.set(nameLower, games)
      return games
    }

    // Bypass database queries for special/system directories
    const isSpecial = ['magazine', 'manuals', 'retrobat', 'emulators', 'screenshots'].includes(nameLower) || (matchedSystem && matchedSystem.hardware === 'system')
    if (isSpecial) {
      if (LibraryService.cachedGames.has(nameLower)) {
        return LibraryService.cachedGames.get(nameLower)!
      }
      const games = this.getGamesRaw(systemName, false)
      LibraryService.cachedGames.set(nameLower, games)
      LibraryService.fullyLoadedSystems.add(nameLower)
      return games
    }

    // ─── DB Mode: load from SQLite for physical systems ───
    // Load from SQLite for physical systems
    if (LibraryService.cachedGames.has(nameLower)) {
      return LibraryService.cachedGames.get(nameLower)!
    }
    const settings = new SettingsParser()
    const showHidden = settings.getSetting('ShowHidden', 'bool') === true
    const games = LibraryService.databaseService.isOpen()
      ? LibraryService.databaseService.getGamesBySystem(systemName, showHidden)
      : []
    LibraryService.cachedGames.set(nameLower, games)
    LibraryService.fullyLoadedSystems.add(nameLower)
    return games
  }

  public getGamesRaw(systemName: string, forcePhysicalScan = false): Game[] {
    const systems = this.systemsParser.parse()
    const system = systems.find(s => s.name.toLowerCase() === systemName.toLowerCase())
    const settings = new SettingsParser()

    let games: Game[] = []

    if (system && existsSync(system.path)) {
      const extensions = (system.extension || '').split(/\s+/).filter(e => e.trim().length > 0)
      games = this.scanPhysicalGames(system.path, extensions, systemName)
    }

    const showHidden = settings.getSetting('ShowHidden', 'bool') === true
    const visibleGames = showHidden ? games : games.filter(g => g.hidden !== true && String(g.hidden) !== 'true')

    return visibleGames.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }

  private resolveAutoCollectionGames(colKey: string): Game[] {
    const allDisplayedGames = this.getGamesFromDisplayedSystems()
    colKey = colKey.toLowerCase()

    let filtered: Game[] = []

    if (colKey === 'all') {
      filtered = allDisplayedGames
    } else if (colKey === 'favorites') {
      filtered = allDisplayedGames.filter(g => g.favorite === true || String(g.favorite) === 'true' || String(g.favorite) === '1')
    } else if (colKey === 'recent') {
      filtered = allDisplayedGames.filter(g => (g.playcount && g.playcount > 0) || g.lastplayed)
      filtered.sort((a, b) => String(b.lastplayed || '').localeCompare(String(a.lastplayed || '')))
    } else if (colKey === 'neverplayed') {
      filtered = allDisplayedGames.filter(g => !g.playcount || g.playcount === 0)
    } else if (colKey === '2players') {
      filtered = allDisplayedGames.filter(g => {
        const p = String(g.players || '').trim()
        return p === '2' || p.includes('2') || (p.includes('-') && p.split('-')[0] <= '2' && p.split('-')[1] >= '2')
      })
    } else if (colKey === '4players') {
      filtered = allDisplayedGames.filter(g => {
        const p = String(g.players || '').trim()
        return p === '4' || p.includes('4') || (p.includes('-') && p.split('-')[0] <= '4' && p.split('-')[1] >= '4')
      })
    } else if (colKey === 'retroachievements') {
      filtered = allDisplayedGames.filter(g => g.cheevosId || g.cheevosHash)
    } else if (['wheel', 'trackball', 'spinner', 'lightgun', 'vertical'].includes(colKey)) {
      // Control type collections: use gamesdb.xml data
      const gamesDbData = this.parseGamesDb()
      filtered = allDisplayedGames.filter(g => {
        const sysName = String(g.system || '').toLowerCase()
        // Get ROM stem from path
        const pathVal = String(g.path || '')
        const fileName = pathVal.replace(/^.*[\/\\]/, '').replace(/\.[^.]+$/, '').toLowerCase()

        if (colKey === 'vertical') {
          // Check gamesdb vertical data first
          const vertMap = gamesDbData.get('vertical')
          if (vertMap) {
            const sysIds = vertMap.get(sysName)
            if (sysIds && sysIds.has(fileName)) return true
          }
          // Fallback: check genre for "Vertical"
          const genreUpper = String(g.genre || '').toUpperCase()
          return genreUpper.includes('VERTICAL')
        }

        // wheel, trackball, spinner, lightgun: check gamesdb.xml
        const systemMap = gamesDbData.get(colKey)
        if (!systemMap) return false
        const sysGameIds = systemMap.get(sysName)
        return !!(sysGameIds && sysGameIds.has(fileName))
      })
    } else {
      // Check if this is a genre-based collection
      const genreMap = this.buildGenreMap()
      const matchNames = genreMap.get(colKey)
      
      if (matchNames && matchNames.size > 0) {
        // Genre-based collection: match game genre against known localized names
        filtered = allDisplayedGames.filter(g => {
          const genreUpper = String(g.genre || '').toUpperCase()
          if (!genreUpper) return false
          for (const name of matchNames) {
            if (genreUpper === name || genreUpper.startsWith(name + ' /') || genreUpper.startsWith(name + ',')) {
              return true
            }
          }
          return false
        })
      } else {
        // Manufacturer collection or unknown: check publisher/developer AND fallback to genre/name/desc
        filtered = allDisplayedGames.filter(g => {
          const pubLower = String((g as any).publisher || '').toLowerCase()
          const devLower = String((g as any).developer || '').toLowerCase()
          if (pubLower.includes(colKey) || devLower.includes(colKey)) return true
          // Also fallback to genre/name for unknown collections
          const genreLower = String(g.genre || '').toLowerCase()
          const nameLower = String(g.name || '').toLowerCase()
          return genreLower.includes(colKey) || nameLower.includes(colKey)
        })
      }
    }

    if (colKey !== 'recent') {
      filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    }

    return filtered
  }

  public scanPhysicalGames(systemPath: string, extensions: string[], systemName: string): Game[] {
    const games: Game[] = []
    const extSet = new Set(extensions.map(e => e.toLowerCase().trim()))

    // Common MAME / NeoGeo BIOS and support device zip files to exclude from the playable list
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
              // Folder matches a valid system extension. Treat folder as a game and block internal scan.
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
              // wiiu ignore optimization
              if (sysLower === 'wiiu' && (file.toLowerCase() === 'content' || file.toLowerCase() === 'meta')) {
                continue
              }
              // vpinball ignore optimization
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

              // Default region and language parsing
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

              // If it's the screenshots system, set the fanart property to the absolute path of the file itself
              if (systemName === 'screenshots') {
                game.fanart = fullPath.replace(/\\/g, '/')
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
    if (LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCustomCollections()
    }
    LibraryService.databaseService.open()
    return LibraryService.databaseService.getCustomCollections()
  }

  public getCustomCollectionsGameCounts(): Map<string, number> {
    if (LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCustomCollectionsGameCounts()
    }
    LibraryService.databaseService.open()
    return LibraryService.databaseService.getCustomCollectionsGameCounts()
  }

  public getCollectionGames(collectionName: string): Game[] {
    if (LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCollectionGames(collectionName)
    }
    LibraryService.databaseService.open()
    return LibraryService.databaseService.getCollectionGames(collectionName)
  }

  public updateGame(systemName: string, gameData: Game): void {
    const targetSystem = gameData.system || systemName
    
    // Update in SQLite database
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      try {
        LibraryService.databaseService.upsertGame(gameData)
      } catch (e) {
        console.error('Failed to update game in database:', e)
      }
    }

    // Invalidate the cache for this system so that getGames queries the database and runs rowToGame
    // to build proper absolute paths for media files.
    LibraryService.cachedGames.delete(targetSystem.toLowerCase())

    this.rebuildAutoCollections()
  }

  public deleteGame(systemName: string, gamePath: string, deletePhysical: boolean): void {
    const fs = require('fs')
    const targetSystem = systemName

    const systems = this.getSystems()
    const system = systems.find(s => s.name.toLowerCase() === targetSystem.toLowerCase())

    // 1. Remove game from custom collections
    try {
      const collections = this.getCollectionsForGame(targetSystem, gamePath)
      for (const col of collections) {
        this.toggleGameInCollection(col, targetSystem, gamePath, 'remove')
      }
    } catch (e) {
      console.error(`Failed to remove game from custom collections:`, e)
    }

    // 2. Delete from SQLite database
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      try {
        LibraryService.databaseService.deleteGameFromDb(targetSystem, gamePath)
      } catch (e) {
        console.error('Failed to delete game from database:', e)
      }
    }

    // 3. Update in-memory cache
    const cached = LibraryService.cachedGames.get(targetSystem.toLowerCase())
    if (cached) {
      const filtered = cached.filter(
        g => normalizePathForComparison(g.path) !== normalizePathForComparison(gamePath)
      )
      LibraryService.cachedGames.set(targetSystem.toLowerCase(), filtered)
    }

    // 4. If requested, delete the physical file/folder
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

    // 5. Rebuild all auto-collections
    this.rebuildAutoCollections()
  }

  private rebuildAutoCollections(): void {
    LibraryService.cachedGames.delete('all')
    LibraryService.cachedGames.delete('favorites')
  }

  public getCollectionsForGame(systemName: string, gamePath: string): string[] {
    if (LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCollectionsForGame(systemName, gamePath)
    }
    LibraryService.databaseService.open()
    return LibraryService.databaseService.getCollectionsForGame(systemName, gamePath)
  }

  public toggleGameInCollection(collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove'): boolean {
    if (LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.toggleGameInCollection(collectionName, systemName, gamePath, action)
    }
    LibraryService.databaseService.open()
    return LibraryService.databaseService.toggleGameInCollection(collectionName, systemName, gamePath, action)
  }

  public cleanGamelists(): void {
    // Legacy cleanup method - no longer used as metadata is managed in DB.
    LibraryService.clearCache()
  }

  public resetGamelistUsage(): void {
    if (LibraryService.databaseService.isOpen()) {
      LibraryService.databaseService.resetAllPlayHistory()
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
    
    // 1. Close database connection
    try {
      if (LibraryService.databaseService) {
        LibraryService.databaseService.close()
      }
    } catch (e) {
      console.error('Failed to close database in clearCaches:', e)
    }

    // 2. Delete database files
    try {
      const dbPath = getDatabasePath()
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
        console.log(`Database deleted: ${dbPath}`)
      }
      if (fs.existsSync(dbPath + '-wal')) {
        fs.unlinkSync(dbPath + '-wal')
      }
      if (fs.existsSync(dbPath + '-shm')) {
        fs.unlinkSync(dbPath + '-shm')
      }
    } catch (e) {
      console.error('Failed to delete database files in clearCaches:', e)
    }
    
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
            } catch (e) {
              console.debug(`[LibraryService] Could not remove directory ${fullPath}.`, e)
            }
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
    
    const savesDir = path.join(getRetroBatPath(), 'riescade', 'saves', systemName)
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
              size: stat.size,
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

  public getRandomGameWithMedia(mediaType: 'video' | 'fanart'): Game | null {
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getRandomGameWithMedia(mediaType)
    }
    
    const systems = this.getSystems()
    const validSystems = systems.filter(s => !s.path.startsWith('virtual://') && s.name !== 'collections')
    if (validSystems.length === 0) return null
    
    for (let attempt = 0; attempt < 5; attempt++) {
      const randSys = validSystems[Math.floor(Math.random() * validSystems.length)]
      const games = this.getGames(randSys.name)
      const matches = games.filter(g => mediaType === 'video' ? !!g.video : !!g.fanart)
      if (matches.length > 0) {
        return matches[Math.floor(Math.random() * matches.length)]
      }
    }
    return null
  }
}
