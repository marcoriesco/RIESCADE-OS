import { join, resolve, relative, dirname } from 'path'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { SystemsParser } from '../parsers/SystemsParser'
import { GamelistParser } from '../parsers/GamelistParser'
import { SettingsParser } from '../parsers/SettingsParser'
import { getConfigPath, getRomsPath, getRetroBatPath, getCollectionsPath, getDatabasePath, getRiescadePath, getLogosPath, getArtsPath } from '../utils/paths'
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
  private gamelistParser: GamelistParser
  private static databaseService: DatabaseService = new DatabaseService()

  constructor() {
    this.systemsParser = new SystemsParser()
    this.gamelistParser = new GamelistParser()
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
    } catch (e) {}
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

  private calculateQuickAutoCounts(): void {
    const displayed = this.getDisplayedSystems()
    
    let totalAll = 0
    let totalFavorites = 0
    let totalRecent = 0
    let totalNeverPlayed = 0
    let totalCheevos = 0
    let total2P = 0
    let total4P = 0

    const configPath = getConfigPath()
    const romsPath = getRomsPath()

    // Discover genre-based and manufacturer-based auto-collections that need counting
    const specificCols = new Set(['all', 'favorites', 'recent', 'neverplayed', 'retroachievements', '2players', '4players', 'arcade'])
    const settings = new SettingsParser()
    const autoColsString = settings.getSetting('CollectionSystemsAuto', 'string') || ''
    const enabledCols = autoColsString.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '')
    
    // Separate genre collections from manufacturer collections
    const genreColKeys: Map<string, string> = new Map() // cleanKey -> colKey for quickAutoCounts
    const manufacturerColKeys: Map<string, string> = new Map() // manufacturer name -> colKey
    // Control type collections that use gamesdb.xml (not genre matching)
    const controlTypeSet = new Set(['wheel', 'trackball', 'spinner', 'lightgun', 'vertical'])
    const activeControlTypes = new Set<string>()
    
    for (const col of enabledCols) {
      if (specificCols.has(col)) continue
      
      if (col.startsWith('z')) {
        // Arcade manufacturer: znamco -> namco, zcapcom -> capcom, etc.
        const mfr = col.substring(1).toLowerCase()
        manufacturerColKeys.set(mfr, mfr)
      } else if (controlTypeSet.has(col)) {
        // Control type collection: wheel, trackball, spinner, lightgun, vertical
        activeControlTypes.add(col)
      } else if (col.startsWith('_')) {
        // Genre collection: _shootemup -> shootemup
        const cleanKey = col.substring(1).toLowerCase()
        genreColKeys.set(cleanKey, cleanKey)
      }
    }
    
    // Build genre map from genres.xml for proper multi-language matching
    const genreMap = this.buildGenreMap()
    // Parse gamesdb.xml for control type collections
    const gamesDbData = this.parseGamesDb()
    
    // Initialize counters
    const genreCounts: Map<string, number> = new Map()
    for (const [, key] of genreColKeys) genreCounts.set(key, 0)
    
    const mfrCounts: Map<string, number> = new Map()
    for (const [, key] of manufacturerColKeys) mfrCounts.set(key, 0)

    // Control type counters
    const controlTypeCounts: Map<string, number> = new Map()
    for (const ct of activeControlTypes) controlTypeCounts.set(ct, 0)

    for (const sys of displayed) {
      // Skip virtual/auto-collection systems - only scan real system gamelists
      if (sys.path && sys.path.startsWith('virtual://')) continue
      
      const paths = [
        join(romsPath, sys.name, 'gamelist.xml'),
        join(configPath, 'gamelists', sys.name, 'gamelist.xml'),
        sys.path ? join(sys.path, 'gamelist.xml') : ''
      ].filter(Boolean)
      
      let content = ''
      for (const p of paths) {
        if (existsSync(p)) {
          try {
            content = readFileSync(p, 'utf8')
          } catch (e) {}
          break
        }
      }
      
      if (!content) {
        try {
          if (sys.path && existsSync(sys.path)) {
            const count = readdirSync(sys.path).filter((f: string) => !f.startsWith('.')).length
            totalAll += count
            totalNeverPlayed += count
          }
        } catch(e) {}
        continue
      }
      
      const gameMatches = content.match(/<game[\s>]/g)
      if (!gameMatches) continue
      
      totalAll += gameMatches.length
      
      const favMatches = content.match(/<favorite>(true|1)<\/favorite>/g)
      if (favMatches) totalFavorites += favMatches.length
      
      const playedMatches = content.match(/<lastplayed>/g)
      const playedCount = playedMatches ? playedMatches.length : 0
      totalRecent += playedCount
      totalNeverPlayed += (gameMatches.length - playedCount)
      
      const cheevosMatches = content.match(/<(cheevosId|cheevosHash)>/g)
      if (cheevosMatches) totalCheevos += cheevosMatches.length / 2
      
      const p2Matches = content.match(/<players>\s*(2|.*2.*)\s*<\/players>/g)
      if (p2Matches) total2P += p2Matches.length
      
      const p4Matches = content.match(/<players>\s*(4|.*4.*)\s*<\/players>/g)
      if (p4Matches) total4P += p4Matches.length

      // Count genre-based collections using genres.xml mapping
      if (genreColKeys.size > 0) {
        const genreRegex = /<genre>(.*?)<\/genre>/gi
        let match: RegExpExecArray | null
        while ((match = genreRegex.exec(content)) !== null) {
          const genreValue = match[1].toUpperCase()
          // Decode XML entities
          const decoded = genreValue.replace(/&amp;/gi, '&').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
          
          for (const [colKey] of genreColKeys) {
            const matchNames = genreMap.get(colKey)
            if (matchNames) {
              // Check if genre value matches any known name (exact) or is a parent/child combination
              // Also check if any known name is a prefix of the genre
              let found = false
              for (const name of matchNames) {
                if (decoded === name || decoded.startsWith(name + ' /') || decoded.startsWith(name + ',')) {
                  found = true
                  break
                }
              }
              if (found) {
                genreCounts.set(colKey, (genreCounts.get(colKey) || 0) + 1)
              }
            } else {
              // Fallback: try simple substring match for collections not in genres.xml
              if (decoded.toLowerCase().includes(colKey)) {
                genreCounts.set(colKey, (genreCounts.get(colKey) || 0) + 1)
              }
            }
          }
        }
      }

      // Count manufacturer-based collections by scanning <publisher> and <developer>
      if (manufacturerColKeys.size > 0) {
        const pubRegex = /<(?:publisher|developer)>(.*?)<\/(?:publisher|developer)>/gi
        let match: RegExpExecArray | null
        while ((match = pubRegex.exec(content)) !== null) {
          const pubValue = match[1].toLowerCase()
          for (const [mfrKey] of manufacturerColKeys) {
            if (pubValue.includes(mfrKey)) {
              mfrCounts.set(mfrKey, (mfrCounts.get(mfrKey) || 0) + 1)
            }
          }
        }
      }

      // Count control type collections using gamesdb.xml data
      if (activeControlTypes.size > 0) {
        const sysName = sys.name.toLowerCase()
        // Extract game blocks with path and check against gamesdb data
        const gameBlockRegex = /<game[\s>][\s\S]*?<\/game>/gi
        let blockMatch: RegExpExecArray | null
        while ((blockMatch = gameBlockRegex.exec(content)) !== null) {
          const block = blockMatch[0]
          // Extract ROM stem from <path> tag
          const pathMatch = block.match(/<path>(.*?)<\/path>/i)
          if (!pathMatch) continue
          const pathVal = pathMatch[1]
          // Get filename without extension (ROM stem)
          const fileName = pathVal.replace(/^.*[\/\\]/, '').replace(/\.[^.]+$/, '').toLowerCase()

          for (const ct of activeControlTypes) {
            if (ct === 'vertical') {
              // Vertical: check gamesdb for 'vertical' tag OR genre contains "Vertical"
              const vertSystemMap = gamesDbData.get('vertical')
              if (vertSystemMap) {
                const sysGameIds = vertSystemMap.get(sysName)
                if (sysGameIds && sysGameIds.has(fileName)) {
                  controlTypeCounts.set(ct, (controlTypeCounts.get(ct) || 0) + 1)
                  continue
                }
              }
              // Fallback: check genre for "Vertical" (for arcade games with vertical genre tag)
              const genreMatch = block.match(/<genre>(.*?)<\/genre>/i)
              if (genreMatch) {
                const genreUpper = genreMatch[1].toUpperCase().replace(/&amp;/gi, '&').replace(/&apos;/gi, "'")
                if (genreUpper.includes('VERTICAL')) {
                  controlTypeCounts.set(ct, (controlTypeCounts.get(ct) || 0) + 1)
                }
              }
            } else {
              // wheel, trackball, spinner, lightgun: check gamesdb.xml data
              const systemMap = gamesDbData.get(ct)
              if (systemMap) {
                const sysGameIds = systemMap.get(sysName)
                if (sysGameIds && sysGameIds.has(fileName)) {
                  controlTypeCounts.set(ct, (controlTypeCounts.get(ct) || 0) + 1)
                }
              }
            }
          }
        }
      }
    }
    
    LibraryService.quickAutoCounts.set('all', totalAll)
    LibraryService.quickAutoCounts.set('favorites', totalFavorites)
    LibraryService.quickAutoCounts.set('recent', totalRecent)
    LibraryService.quickAutoCounts.set('neverplayed', totalNeverPlayed)
    LibraryService.quickAutoCounts.set('retroachievements', Math.floor(totalCheevos))
    LibraryService.quickAutoCounts.set('2players', total2P)
    LibraryService.quickAutoCounts.set('4players', total4P)
    
    // Set genre-based collection counts
    for (const [, colKey] of genreColKeys) {
      LibraryService.quickAutoCounts.set(colKey, genreCounts.get(colKey) || 0)
    }
    
    // Set manufacturer-based collection counts
    for (const [, colKey] of manufacturerColKeys) {
      LibraryService.quickAutoCounts.set(colKey, mfrCounts.get(colKey) || 0)
    }

    // Set control type collection counts
    for (const ct of activeControlTypes) {
      LibraryService.quickAutoCounts.set(ct, controlTypeCounts.get(ct) || 0)
    }
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
      } catch (err) {}
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
      } catch {}

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
          if (sys.path.startsWith('virtual://') || sys.name === 'collections') continue
          
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

      // Only recalculate auto-collection counts from DB (fast SQL queries)
      const displayed = this.getDisplayedSystems()
      sendProgress(30, 'LOADING_PLATFORMS')
      const displayedNames = displayed.map(s => s.name)
      const settings = new SettingsParser()
      const autoColsString = settings.getSetting('CollectionSystemsAuto', 'string') || ''
      const enabledCols = autoColsString.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '')

      sendProgress(60, 'LOADING_PLATFORMS')
      for (const col of enabledCols) {
        let countKey = col
        if (col.startsWith('_')) countKey = col.substring(1)
        else if (col.startsWith('z')) countKey = col.substring(1)
        const count = dbService.getAutoCollectionCount(countKey, displayedNames)
        LibraryService.quickAutoCounts.set(countKey, count)
      }

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

      // Use SQL queries for auto-collection counts
      const displayed = this.getDisplayedSystems()
      const displayedNames = displayed.map(s => s.name)
      const settings = new SettingsParser()
      const autoColsString = settings.getSetting('CollectionSystemsAuto', 'string') || ''
      const enabledCols = autoColsString.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '')

      // Get all game counts at once from DB
      const allCounts = dbService.getAllGameCounts()

      // Calculate auto-collection counts
      const specificCols = new Set(['all', 'favorites', 'recent', 'neverplayed', 'retroachievements', '2players', '4players', 'arcade'])
      for (const col of enabledCols) {
        let countKey = col
        if (col.startsWith('_')) countKey = col.substring(1)
        else if (col.startsWith('z')) countKey = col.substring(1)

        if (specificCols.has(col) || specificCols.has(countKey)) {
          const count = dbService.getAutoCollectionCount(countKey, displayedNames)
          LibraryService.quickAutoCounts.set(countKey, count)
        } else {
          // Genre/manufacturer collections
          const count = dbService.getAutoCollectionCount(countKey, displayedNames)
          LibraryService.quickAutoCounts.set(countKey, count)
        }
      }

      sendProgress(80, initialStatusKey)
    } else {
      // ─── Gamelist.xml Mode: original behavior ───
      sendProgress(10, initialStatusKey)
      this.getDisplayedSystems()
      sendProgress(30, initialStatusKey)
      this.calculateQuickAutoCounts()
      sendProgress(50, initialStatusKey)
    }

    await delay(50)

    LibraryService.isPreloaded = true
    sendProgress(100, initialStatusKey)
  }

  public async preloadSystem(systemName: string, forcePhysicalScan = false): Promise<void> {
    const nameLower = systemName.toLowerCase()
    
    // Clear only this system's cache
    LibraryService.cachedGames.delete(nameLower)
    
    const useDb = LibraryService.isDbMode()
    const dbService = LibraryService.databaseService

    if (useDb) {
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
    } else {
      // Preload games for only this specific system (XML Mode)
      try {
        const games = this.getGamesRaw(systemName, forcePhysicalScan)
        LibraryService.cachedGames.set(nameLower, games)
      } catch (err) {
        console.error(`Failed to preload games for ${systemName}:`, err)
      }
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
        const useDb = LibraryService.isDbMode()
        const isFirstRun = useDb && LibraryService.databaseService.isOpen() && LibraryService.databaseService.getIndexedSystemCount() === 0
        const statusKey = useDb 
          ? (isFirstRun ? 'INDEXING_DATABASE' : 'UPDATING_DATABASE')
          : 'LOADING_PLATFORMS'
        win.webContents.send('systems-loading-progress', 100, statusKey)
      }
    } catch (err) {}
  }

  public async rebuildDatabase(onProgress?: (systemName: string, current: number, total: number) => void): Promise<void> {
    if (LibraryService.isDbMode()) {
      const dbService = LibraryService.databaseService
      dbService.open()
      const allSystems = this.systemsParser.parse()
      const scanFn = this.scanPhysicalGames.bind(this)
      await dbService.rebuildAll(allSystems, scanFn, onProgress)
    }
  }

  public preloadAllSync(forcePhysicalScan = false): void {
    if (LibraryService.isPreloaded) return
    
    if (LibraryService.isDbMode()) {
      const dbService = LibraryService.databaseService
      dbService.open()
      
      const displayed = this.getDisplayedSystems()
      const displayedNames = displayed.map(s => s.name)
      const settings = new SettingsParser()
      const autoColsString = settings.getSetting('CollectionSystemsAuto', 'string') || ''
      const enabledCols = autoColsString.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '')

      for (const col of enabledCols) {
        let countKey = col
        if (col.startsWith('_')) countKey = col.substring(1)
        else if (col.startsWith('z')) countKey = col.substring(1)

        const count = dbService.getAutoCollectionCount(countKey, displayedNames)
        LibraryService.quickAutoCounts.set(countKey, count)
      }
    } else {
      this.getDisplayedSystems()
      this.calculateQuickAutoCounts()
    }
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

    // Add collections virtual system
    const gamecount = this.getCustomCollections().length

    if (!systems.some(s => s.name === 'collections')) {
      systems.push({
        name: 'collections',
        fullname: 'Coleções',
        path: 'virtual://collections',
        extension: '',
        command: '',
        platform: 'pc',
        theme: 'custom-collections',
        hardware: 'custom-collections',
        emulators: [],
        gamecount: gamecount
      })
    }

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

      if (s.name === 'collections') {
        s.gamecount = this.getCustomCollections().length
        return
      }

      const nameLower = s.name.toLowerCase()
      const cleanColName = nameLower.startsWith('auto-') ? nameLower.substring(5) : nameLower

      const cached = LibraryService.cachedGames.get(nameLower)
      const isSpecial = ['library', 'magazine', 'manuals', 'retrobat', 'emulators', 'screenshots'].includes(nameLower) || s.hardware === 'system'

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
    const groupedSetting = settings.getSetting('SystemsGrouped', 'string') || ''
    
    const visibleList = String(visibleSetting).split(',').filter(v => v.trim() !== '')
    const hiddenList = String(hiddenSetting).split(';').filter(v => v.trim() !== '')
    const groupedList = String(groupedSetting).split(',').filter(v => v.trim() !== '')

    const systems = this.systemsParser.parse()

    let baseSystems = visibleList.length > 0 
      ? systems.filter(s => 
          visibleList.includes(s.name) || 
          s.name === 'collections' ||
          s.path.startsWith('virtual://') ||
          systems.some(child => 
            child.group && 
            child.group.toLowerCase() === s.name.toLowerCase() && 
            groupedList.includes(child.name) && 
            visibleList.includes(child.name)
          )
        )
      : systems

    if (hiddenList.length > 0) {
      baseSystems = baseSystems.filter(s => !hiddenList.includes(s.name))
    }

    if (groupedList.length > 0) {
      baseSystems = baseSystems.filter(s => 
        !groupedList.includes(s.name) || 
        (s.group && s.group.toLowerCase() === s.name.toLowerCase())
      )
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
      const cached = LibraryService.cachedGames.get(sys.name.toLowerCase())
      if (cached) {
        allGames.push(...cached)
      } else {
        const sysGames = this.getGamesRaw(sys.name, false, true)
        LibraryService.cachedGames.set(sys.name.toLowerCase(), sysGames)
        allGames.push(...sysGames)
      }
    }

    return allGames
  }

  public getGames(systemName: string): Game[] {
    const nameLower = systemName.toLowerCase()

    if (nameLower === 'collections') {
      const enabledCols = this.getCustomCollections()
      
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
    const isSpecial = ['library', 'magazine', 'manuals', 'retrobat', 'emulators', 'screenshots'].includes(nameLower) || (matchedSystem && matchedSystem.hardware === 'system')
    if (isSpecial) {
      if (LibraryService.cachedGames.has(nameLower)) {
        return LibraryService.cachedGames.get(nameLower)!
      }
      const games = this.getGamesRaw(systemName, false, false)
      LibraryService.cachedGames.set(nameLower, games)
      LibraryService.fullyLoadedSystems.add(nameLower)
      return games
    }

    // ─── DB Mode: load from SQLite for physical systems ───
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      if (LibraryService.cachedGames.has(nameLower)) {
        return LibraryService.cachedGames.get(nameLower)!
      }
      const settings = new SettingsParser()
      const showHidden = settings.getSetting('ShowHidden', 'bool') === true
      const games = LibraryService.databaseService.getGamesBySystem(systemName, showHidden)
      LibraryService.cachedGames.set(nameLower, games)
      LibraryService.fullyLoadedSystems.add(nameLower)
      return games
    }

    // ─── Gamelist.xml Mode: original behavior ───
    // For physical systems, verify if we have completed a full load/scan
    if (LibraryService.fullyLoadedSystems.has(nameLower)) {
      return LibraryService.cachedGames.get(nameLower)!
    }

    const games = this.getGamesRaw(systemName, false, false) // full scan/load
    LibraryService.cachedGames.set(nameLower, games)
    LibraryService.fullyLoadedSystems.add(nameLower)
    return games
  }

  public getGamesRaw(systemName: string, forcePhysicalScan = false, xmlOnly = false): Game[] {
    const systems = this.systemsParser.parse()
    const system = systems.find(s => s.name.toLowerCase() === systemName.toLowerCase())
    const settings = new SettingsParser()

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

    if (xmlOnly) {
      games = xmlGames
      source = `${source}+xmlOnly`
    } else if (system && existsSync(system.path)) {
      const settings = new SettingsParser()
      const parseGamelistOnly = settings.getSetting('ParseGamelistOnly', 'bool') === true

      if (parseGamelistOnly && xmlGames.length > 0 && !forcePhysicalScan) {
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
      const logsDir = join(getRiescadePath(), 'logs')
      const fs = require('fs')
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }
      const logStr = `getGames systemName: ${systemName}\n  systemFound: ${!!system}\n  systemPath: ${system ? system.path : 'N/A'}\n  gamelistPath: ${gamelistPath} (exists: ${existsSync(gamelistPath)})\n  romsGamelistPath: ${romsGamelistPath} (exists: ${romsGamelistPath ? existsSync(romsGamelistPath) : false})\n  systemGamelistPath: ${systemGamelistPath} (exists: ${systemGamelistPath ? existsSync(systemGamelistPath) : false})\n  finalSource: ${source}\n  gamesCount: ${games.length}\n\n`
      fs.appendFileSync(join(logsDir, 'debug_games.log'), logStr, 'utf-8')
    } catch(e) {
      console.error('Failed to write debug_games.log:', e)
    }

    const systemPath = system && system.path ? system.path : null

    const processedGames = games.map(g => {
      const sysLower = String(g.system || systemName).toLowerCase()
      if (!g.image || String(g.image).trim() === '') {
        const ext = (g.path.includes('.') ? g.path.substring(g.path.lastIndexOf('.')) : '').toLowerCase()
        if (ext === '.png' || (sysLower === 'pico8' && ext === '.p8')) {
          if (systemPath) {
            g.image = resolve(systemPath, g.path).replace(/\\/g, '/')
          }
        }
      }
      return g
    })

    const showHidden = settings.getSetting('ShowHidden', 'bool') === true
    const visibleGames = showHidden ? processedGames : processedGames.filter(g => g.hidden !== true && String(g.hidden) !== 'true')

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

              // If it's the screenshots system, set the image property to the absolute path of the file itself
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
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCustomCollections()
    }
    
    // Fallback if DB not open
    const collectionsDir = getCollectionsPath()
    if (!existsSync(collectionsDir)) return []
    try {
      const files = readdirSync(collectionsDir)
      const collections: string[] = []
      files.forEach(f => {
        if (f.startsWith('custom-') && f.endsWith('.cfg')) {
          const colName = f.substring(7, f.length - 4)
          collections.push(colName)
        }
      })
      return collections.sort((a, b) => a.localeCompare(b))
    } catch (e) {
      console.error('Failed to read custom collections:', e)
      return []
    }
  }

  public getCollectionGames(collectionName: string): Game[] {
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCollectionGames(collectionName)
    }

    // Fallback if DB not open
    const cfgPath = join(getCollectionsPath(), `custom-${collectionName}.cfg`)
    if (!existsSync(cfgPath)) return []
    try {
      const content = readFileSync(cfgPath, 'utf-8')
      const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
      const allSystems = this.getSystems()
      const collectionGames: Game[] = []
      const parsedSystemsGames = new Map<string, Game[]>()
      for (const line of lines) {
        let resolvedRomPath = line.replace(/^\.\//, '')
        const absoluteRomPath = resolve(getRetroBatPath(), resolvedRomPath).replace(/\\/g, '/')
        const normalized = absoluteRomPath.toLowerCase()
        const match = normalized.match(/\/roms\/([^/]+)\//)
        const systemName = match ? match[1] : ''
        if (!systemName) continue
        const sysKey = systemName.toLowerCase()
        if (!parsedSystemsGames.has(sysKey)) {
          parsedSystemsGames.set(sysKey, this.getGames(systemName))
        }
        const systemGames = parsedSystemsGames.get(sysKey) || []
        const systemObj = allSystems.find(s => s.name.toLowerCase() === sysKey)
        const systemRomDir = systemObj ? systemObj.path : join(getRomsPath(), systemName)
        const foundGame = systemGames.find(g => {
          const gameAbsPath = resolve(systemRomDir, g.path).replace(/\\/g, '/')
          return gameAbsPath.toLowerCase() === absoluteRomPath.toLowerCase()
        })
        if (foundGame) {
          collectionGames.push({ ...foundGame })
        } else {
          const filename = absoluteRomPath.split('/').pop() || ''
          const displayName = filename.replace(/\.[^/.]+$/, '')
          const relativeRomPath = './' + relative(systemRomDir, absoluteRomPath).replace(/\\/g, '/')
          collectionGames.push({
            id: absoluteRomPath,
            name: displayName,
            path: relativeRomPath,
            system: systemName,
            favorite: false,
            hidden: false,
            playcount: 0
          } as any)
        }
      }
      return collectionGames.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    } catch (e) {
      console.error(`Failed to read games for collection ${collectionName}:`, e)
      return []
    }
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

    const cached = LibraryService.cachedGames.get(targetSystem.toLowerCase())
    if (cached) {
      const cIdx = cached.findIndex(g => normalizePathForComparison(g.path) === normalizePathForComparison(gameData.path))
      if (cIdx !== -1) {
        cached[cIdx] = { ...cached[cIdx], ...gameData }
      } else {
        cached.push(gameData)
      }
    }

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
    const settings = new SettingsParser()
    const autoColsString = settings.getSetting('CollectionSystemsAuto', 'string') || ''
    const enabledCols = autoColsString.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '' && c.toLowerCase() !== 'arcade')

    // Build clean keys for auto-collections
    const autoCollections: string[] = []
    for (const col of enabledCols) {
      let cleanKey = col
      if (col.startsWith('_')) {
        cleanKey = col.substring(1)
      } else if (col.startsWith('z')) {
        cleanKey = col.substring(1)
      }
      autoCollections.push(cleanKey.toLowerCase())
    }

    const displayed = this.getDisplayedSystems()
    const physicalSystems = displayed.filter(s => 
      !s.path.startsWith('virtual://') && 
      s.name !== 'collections' && 
      !autoCollections.includes(s.name.toLowerCase())
    )

    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      // DB Mode fast-path: invalidate cached games for auto-collections and update quick counts directly from DB
      const displayedNames = displayed.map(s => s.name)
      for (const col of autoCollections) {
        const isDuplicate = physicalSystems.some(s => s.name.toLowerCase() === col.toLowerCase())
        const cacheKey = (isDuplicate ? `auto-${col}` : col).toLowerCase()
        LibraryService.cachedGames.delete(cacheKey)

        let countKey = col
        if (col.startsWith('_')) countKey = col.substring(1)
        else if (col.startsWith('z')) countKey = col.substring(1)
        try {
          const count = LibraryService.databaseService.getAutoCollectionCount(countKey, displayedNames)
          LibraryService.quickAutoCounts.set(countKey, count)
        } catch (err) {
          console.error(`Failed to update count for auto collection ${countKey} in DB mode:`, err)
        }
      }
      return
    }

    for (const col of autoCollections) {
      const isDuplicate = physicalSystems.some(s => s.name.toLowerCase() === col.toLowerCase())
      const cacheKey = (isDuplicate ? `auto-${col}` : col).toLowerCase()
      if (LibraryService.cachedGames.has(cacheKey)) {
        try {
          const colGames = this.resolveAutoCollectionGames(col)
          LibraryService.cachedGames.set(cacheKey, colGames)
        } catch (err) {}
      }
    }
    this.calculateQuickAutoCounts()
  }

  public getCollectionsForGame(systemName: string, gamePath: string): string[] {
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getCollectionsForGame(systemName, gamePath)
    }

    // Fallback if DB not open
    const collections = this.getCustomCollections()
    const cleanGamePath = gamePath.replace(/^\.\//, '')
    const targetLine = `./roms/${systemName}/${cleanGamePath}`.toLowerCase()
    const fs = require('fs')
    const matching: string[] = []
    for (const col of collections) {
      const cfgPath = join(getCollectionsPath(), `custom-${col}.cfg`)
      if (fs.existsSync(cfgPath)) {
        const content = fs.readFileSync(cfgPath, 'utf-8')
        const lines = content.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0)
        if (lines.some((l: string) => l.toLowerCase() === targetLine)) {
          matching.push(col)
        }
      }
    }
    return matching
  }

  public toggleGameInCollection(collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove'): boolean {
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.toggleGameInCollection(collectionName, systemName, gamePath, action)
    }

    // Fallback if DB not open
    const collectionsDir = getCollectionsPath()
    const fs = require('fs')
    if (!fs.existsSync(collectionsDir)) {
      fs.mkdirSync(collectionsDir, { recursive: true })
    }
    const cfgPath = join(collectionsDir, `custom-${collectionName}.cfg`)
    let lines: string[] = []
    if (fs.existsSync(cfgPath)) {
      const content = fs.readFileSync(cfgPath, 'utf-8')
      lines = content.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0)
    }
    const cleanGamePath = gamePath.replace(/^\.\//, '')
    const targetLine = `./roms/${systemName}/${cleanGamePath}`
    const exists = lines.some(l => l.toLowerCase() === targetLine.toLowerCase())
    if (action === 'add') {
      if (!exists) {
        lines.push(targetLine)
        fs.writeFileSync(cfgPath, lines.join('\n') + '\n', 'utf-8')
        return true
      }
    } else if (action === 'remove') {
      if (exists) {
        lines = lines.filter(l => l.toLowerCase() !== targetLine.toLowerCase())
        fs.writeFileSync(cfgPath, lines.join('\n') + '\n', 'utf-8')
        return true
      }
    }
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

  public getRandomGameWithMedia(mediaType: 'video' | 'image'): Game | null {
    if (LibraryService.isDbMode() && LibraryService.databaseService.isOpen()) {
      return LibraryService.databaseService.getRandomGameWithMedia(mediaType)
    }
    
    const systems = this.getSystems()
    const validSystems = systems.filter(s => !s.path.startsWith('virtual://') && s.name !== 'collections')
    if (validSystems.length === 0) return null
    
    for (let attempt = 0; attempt < 5; attempt++) {
      const randSys = validSystems[Math.floor(Math.random() * validSystems.length)]
      const games = this.getGames(randSys.name)
      const matches = games.filter(g => mediaType === 'video' ? !!g.video : !!g.image)
      if (matches.length > 0) {
        return matches[Math.floor(Math.random() * matches.length)]
      }
    }
    return null
  }
}
