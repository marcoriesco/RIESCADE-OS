import Database from 'better-sqlite3'
import { existsSync, statSync, readdirSync, mkdirSync } from 'fs'
import { join, dirname, relative, resolve, isAbsolute } from 'path'
import { getDatabasePath, getRomsPath, getConfigPath, getCollectionsPath, getRiescadePath } from '../utils/paths'
import { GamelistParser } from '../parsers/GamelistParser'
import { Game, System } from '../../shared/types'

function normalizePathForComparison(p: string): string {
  if (!p) return ''
  return p
    .replace(/\\/g, '/')          // Normalize slashes
    .replace(/^\.\//, '')         // Remove leading ./
    .replace(/^\//, '')           // Remove leading /
    .trim()
    .toLowerCase()
}

/**
 * DatabaseService - SQLite-based ROM indexing for RIESCADE.
 *
 * Provides instant game loading after first indexation by storing
 * all ROM metadata in a local SQLite database. Uses folder mtime
 * comparison to detect changes and only re-indexes modified systems.
 */
export class DatabaseService {
  private db: Database.Database | null = null
  private gamelistParser: GamelistParser
  public migrationOccurred = false

  constructor() {
    this.gamelistParser = new GamelistParser()
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  public open(): void {
    if (this.db) return

    const dbPath = getDatabasePath()
    const dbDir = dirname(dbPath)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }

    this.db = new Database(dbPath)

    // Performance tuning for local single-writer DB
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -8000') // 8MB cache
    this.db.pragma('temp_store = MEMORY')

    this.initialize()
  }

  public close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  public isOpen(): boolean {
    return this.db !== null
  }

  private ensureOpen(): Database.Database {
    if (!this.db) {
      this.open()
    }
    return this.db!
  }

  private initialize(): void {
    const db = this.ensureOpen()

    db.exec(`
      CREATE TABLE IF NOT EXISTS systems (
        name          TEXT PRIMARY KEY,
        fullname      TEXT,
        path          TEXT,
        extension     TEXT,
        platform      TEXT,
        theme         TEXT,
        hardware      TEXT,
        last_scan_at  INTEGER,
        folder_mtime  INTEGER,
        file_count    INTEGER
      );

      CREATE TABLE IF NOT EXISTS games (
        id            TEXT,
        name          TEXT NOT NULL,
        path          TEXT NOT NULL,
        system        TEXT NOT NULL,
        desc          TEXT,
        image         TEXT,
        video         TEXT,
        marquee       TEXT,
        thumbnail     TEXT,
        fanart        TEXT,
        titleshot     TEXT,
        wheel         TEXT,
        mix           TEXT,
        boxback       TEXT,
        bezel         TEXT,
        manual        TEXT,
        magazine      TEXT,
        map           TEXT,
        rating        REAL,
        releasedate   TEXT,
        developer     TEXT,
        publisher     TEXT,
        genre         TEXT,
        players       TEXT,
        favorite      INTEGER DEFAULT 0,
        hidden        INTEGER DEFAULT 0,
        kidgame       INTEGER DEFAULT 0,
        playcount     INTEGER DEFAULT 0,
        lastplayed    TEXT,
        region        TEXT,
        lang          TEXT,
        emulator      TEXT,
        core          TEXT,
        sortname      TEXT,
        tags          TEXT,
        gamefamily    TEXT,
        arcadesystem  TEXT,
        languages     TEXT,
        cheevos_id    TEXT,
        cheevos_hash  TEXT,
        file_size     INTEGER,
        file_mtime    INTEGER,
        crc32         TEXT,
        md5           TEXT,
        gametime      INTEGER,
        scrap_name    TEXT,
        scrap_date    TEXT,
        PRIMARY KEY (system, path)
      );

      CREATE INDEX IF NOT EXISTS idx_games_system ON games(system);
      CREATE INDEX IF NOT EXISTS idx_games_name ON games(name);
      CREATE INDEX IF NOT EXISTS idx_games_releasedate ON games(releasedate);
      CREATE INDEX IF NOT EXISTS idx_games_playcount ON games(playcount);
      CREATE INDEX IF NOT EXISTS idx_games_favorite ON games(favorite) WHERE favorite = 1;
      CREATE INDEX IF NOT EXISTS idx_games_lastplayed ON games(lastplayed) WHERE lastplayed IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_games_genre ON games(genre);
      CREATE INDEX IF NOT EXISTS idx_games_players ON games(players);
      CREATE INDEX IF NOT EXISTS idx_games_publisher ON games(publisher);
      CREATE INDEX IF NOT EXISTS idx_games_developer ON games(developer);
      CREATE INDEX IF NOT EXISTS idx_games_hidden ON games(hidden);
    `)

    // Schema migration: Add file_count if it doesn't exist
    try {
      db.prepare("SELECT file_count FROM systems LIMIT 1").get()
    } catch {
      try {
        db.exec("ALTER TABLE systems ADD COLUMN file_count INTEGER")
        console.log("Database table 'systems' altered to add 'file_count' column.")
      } catch (err) {
        console.error("Failed to alter systems table to add file_count column:", err)
      }
    }

    // Schema migration: Add crc32 to games if it doesn't exist
    try {
      db.prepare("SELECT crc32 FROM games LIMIT 1").get()
    } catch {
      try {
        db.exec("ALTER TABLE games ADD COLUMN crc32 TEXT")
        console.log("Database table 'games' altered to add 'crc32' column.")
        this.migrationOccurred = true
      } catch (err) {
        console.error("Failed to alter games table to add crc32 column:", err)
      }
    }

    // Schema migration: Add md5 to games if it doesn't exist
    try {
      db.prepare("SELECT md5 FROM games LIMIT 1").get()
    } catch {
      try {
        db.exec("ALTER TABLE games ADD COLUMN md5 TEXT")
        console.log("Database table 'games' altered to add 'md5' column.")
        this.migrationOccurred = true
      } catch (err) {
        console.error("Failed to alter games table to add md5 column:", err)
      }
    }

    // Schema migration: Add gametime to games if it doesn't exist
    try {
      db.prepare("SELECT gametime FROM games LIMIT 1").get()
    } catch {
      try {
        db.exec("ALTER TABLE games ADD COLUMN gametime INTEGER")
        console.log("Database table 'games' altered to add 'gametime' column.")
        this.migrationOccurred = true
      } catch (err) {
        console.error("Failed to alter games table to add gametime column:", err)
      }
    }

    // Schema migration: Add scrap_name to games if it doesn't exist
    try {
      db.prepare("SELECT scrap_name FROM games LIMIT 1").get()
    } catch {
      try {
        db.exec("ALTER TABLE games ADD COLUMN scrap_name TEXT")
        console.log("Database table 'games' altered to add 'scrap_name' column.")
        this.migrationOccurred = true
      } catch (err) {
        console.error("Failed to alter games table to add scrap_name column:", err)
      }
    }

    // Schema migration: Add scrap_date to games if it doesn't exist
    try {
      db.prepare("SELECT scrap_date FROM games LIMIT 1").get()
    } catch {
      try {
        db.exec("ALTER TABLE games ADD COLUMN scrap_date TEXT")
        console.log("Database table 'games' altered to add 'scrap_date' column.")
        this.migrationOccurred = true
      } catch (err) {
        console.error("Failed to alter games table to add scrap_date column:", err)
      }
    }

    // Create Collections and Collection Games Tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        name          TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS collection_games (
        collection_name TEXT,
        game_system     TEXT,
        game_path       TEXT,
        PRIMARY KEY (collection_name, game_system, game_path),
        FOREIGN KEY (collection_name) REFERENCES collections(name) ON DELETE CASCADE
      );
    `)

    // Migrate custom collection .cfg files to SQLite if collections table is empty
    try {
      const collectionsCount = db.prepare('SELECT COUNT(*) as count FROM collections').get() as any
      if (collectionsCount && collectionsCount.count === 0) {
        const collectionsDir = getCollectionsPath()
        if (existsSync(collectionsDir)) {
          const files = readdirSync(collectionsDir)
          const insertCol = db.prepare('INSERT OR IGNORE INTO collections (name) VALUES (?)')
          const insertColGame = db.prepare('INSERT OR IGNORE INTO collection_games (collection_name, game_system, game_path) VALUES (?, ?, ?)')
          
          files.forEach(f => {
            if (f.startsWith('custom-') && f.endsWith('.cfg')) {
              const colName = f.substring(7, f.length - 4)
              insertCol.run(colName)
              
              try {
                const fs = require('fs')
                const content = fs.readFileSync(join(collectionsDir, f), 'utf-8')
                const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
                
                lines.forEach(line => {
                  const match = line.match(/^\.\/roms\/([^/]+)\/(.+)$/)
                  if (match) {
                    const systemName = match[1]
                    const gamePath = './' + match[2]
                    insertColGame.run(colName, systemName, gamePath)
                  }
                })
                console.log(`Migrated collection '${colName}' with ${lines.length} items from .cfg to SQLite database.`)
              } catch (e) {
                console.error(`Failed to read/migrate custom collection file ${f}:`, e)
              }
            }
          })
        }
      }
    } catch (err) {
      console.error('Failed to migrate custom collections to DB:', err)
    }
  }

  // ─── Sync Detection ─────────────────────────────────────────

  /**
   * Check if a system needs re-indexing by comparing the folder's
   * modification time and file count with the stored values in the database.
   */
  public needsSync(systemName: string, systemPath: string): boolean {
    const db = this.ensureOpen()

    // System not in DB → needs first sync
    const row = db.prepare('SELECT folder_mtime, file_count FROM systems WHERE name = ?').get(systemName) as any
    if (!row) return true

    // Folder doesn't exist → skip (will be filtered by SystemsParser)
    if (!existsSync(systemPath)) return false

    try {
      const currentMtime = statSync(systemPath).mtimeMs
      const currentFileCount = readdirSync(systemPath).length
      return currentMtime !== (row.folder_mtime || 0) || currentFileCount !== (row.file_count || 0)
    } catch {
      return true
    }
  }

  /**
   * Get the number of systems that have been indexed.
   */
  public getIndexedSystemCount(): number {
    const db = this.ensureOpen()
    const row = db.prepare('SELECT COUNT(*) as count FROM systems').get() as any
    return row?.count || 0
  }

  // ─── Sync Operations ────────────────────────────────────────

  /**
   * Sync a single system: scan physical files, merge with gamelist.xml,
   * and store everything in the database.
   */
  public syncSystem(
    system: System,
    scanPhysicalGames: (systemPath: string, extensions: string[], systemName: string) => Game[],
    log = true
  ): number {
    const db = this.ensureOpen()

    const romsPath = getRomsPath()
    const configPath = getConfigPath()

    if (log) {
      console.log(`  📂 Indexing: ${system.name} ...`)
    }

    // 1. Check if system is already indexed
    const systemRow = db.prepare('SELECT last_scan_at FROM systems WHERE name = ?').get(system.name) as any
    const isIndexed = !!systemRow

    // 2. Fetch existing games from database if already indexed
    const existingGamesMap = new Map<string, Game>()
    if (isIndexed) {
      try {
        const rows = db.prepare('SELECT * FROM games WHERE system = ?').all(system.name) as any[]
        rows.forEach(r => {
          existingGamesMap.set(normalizePathForComparison(r.path), this.rowToGame(r))
        })
      } catch (err) {
        console.error(`Failed to fetch existing games for ${system.name} from DB:`, err)
      }
    }

    // 3. Get current folder mtime
    let folderMtime = 0
    try {
      if (existsSync(system.path)) {
        folderMtime = statSync(system.path).mtimeMs
      }
    } catch {}

    // Get current immediate file count
    let fileCount = 0
    try {
      if (existsSync(system.path)) {
        fileCount = readdirSync(system.path).length
      }
    } catch {}

    // 4. Scan physical files
    const extensions = (system.extension || '').split(/\s+/).filter(e => e.trim().length > 0)
    let physicalGames: Game[] = []
    if (existsSync(system.path)) {
      physicalGames = scanPhysicalGames(system.path, extensions, system.name)
    }

    // 5. Parse gamelist.xml ONLY if not indexed yet (first run)
    let xmlGamesMap = new Map<string, Game>()
    if (!isIndexed) {
      const gamelistPaths = [
        join(romsPath, system.name, 'gamelist.xml'),
        join(configPath, 'gamelists', system.name, 'gamelist.xml'),
        join(system.path, 'gamelist.xml')
      ]

      let xmlGames: Game[] = []
      for (const gp of gamelistPaths) {
        if (gp && existsSync(gp)) {
          xmlGames = this.gamelistParser.parse(gp, system.name)
          if (xmlGames.length > 0) break
        }
      }

      xmlGames.forEach(g => {
        xmlGamesMap.set(normalizePathForComparison(g.path), g)
      })
    }

    // 6. Build media file cache for fast lookup
    const mediaCache = new Map<string, Map<string, string>>()
    const mediaDir = join(system.path, 'media')
    const mediaSubfolders = [
      'cover', 'video', 'logo', 'thumbnail', 'cover3d', 'fanart', 'title',
      'wheel', 'mix', 'backcover', 'bezel', 'manual', 'magazine', 'map'
    ]

    if (existsSync(mediaDir)) {
      for (const sub of mediaSubfolders) {
        const subPath = join(mediaDir, sub)
        if (existsSync(subPath)) {
          try {
            const files = readdirSync(subPath)
            const fileMap = new Map<string, string>()
            for (const file of files) {
              const fileStem = file.includes('.') ? file.substring(0, file.lastIndexOf('.')) : file
              fileMap.set(fileStem.toLowerCase(), file)
            }
            mediaCache.set(sub, fileMap)
          } catch (e) {
            console.error(`Failed to cache media subfolder ${sub}:`, e)
          }
        }
      }
    }

    const findLocalMedia = (stem: string, folder: string): string | null => {
      const folderMap = mediaCache.get(folder)
      if (folderMap) {
        const match = folderMap.get(stem.toLowerCase())
        if (match) {
          return `./media/${folder}/${match}`
        }
      }
      return null
    }

    // 7. Merge: physical scan + metadata (SQLite or XML) + local media lookup fallback
    const mergedGames: Game[] = []

    if (physicalGames.length > 0) {
      for (const pg of physicalGames) {
        const normPath = normalizePathForComparison(pg.path)
        const metadataSource = isIndexed ? existingGamesMap.get(normPath) : xmlGamesMap.get(normPath)
        const stem = pg.path.replace(/^.*[\/\\]/, '').replace(/\.[^.]+$/, '')

        const getMediaVal = (field: keyof Game, folder: string, fallbackFolder?: string): string | null => {
          if (metadataSource && metadataSource[field]) {
            return metadataSource[field] as string
          }
          let local = findLocalMedia(stem, folder)
          if (!local && fallbackFolder) {
            local = findLocalMedia(stem, fallbackFolder)
          }
          return local
        }

        if (metadataSource) {
          mergedGames.push({
            ...pg,
            ...metadataSource,
            system: system.name,
            path: pg.path,
            id: metadataSource.id && !metadataSource.id.includes('/') && !metadataSource.id.includes('\\') ? metadataSource.id : pg.id,
            // Ensure media is looked up if missing in existing metadata
            image: getMediaVal('image', 'cover'),
            video: getMediaVal('video', 'video'),
            marquee: getMediaVal('marquee', 'logo', 'wheel'),
            thumbnail: getMediaVal('thumbnail', 'cover3d', 'thumbnail'),
            fanart: getMediaVal('fanart', 'fanart'),
            titleshot: getMediaVal('titleshot', 'title'),
            wheel: getMediaVal('wheel', 'wheel', 'logo'),
            mix: getMediaVal('mix', 'mix'),
            boxback: getMediaVal('boxback', 'backcover'),
            bezel: getMediaVal('bezel', 'bezel'),
            manual: getMediaVal('manual', 'manual'),
            magazine: getMediaVal('magazine', 'magazine'),
            map: getMediaVal('map', 'map')
          })
        } else {
          // New game physical scan: resolve local media fallback
          mergedGames.push({
            ...pg,
            image: findLocalMedia(stem, 'cover') || undefined,
            video: findLocalMedia(stem, 'video') || undefined,
            marquee: findLocalMedia(stem, 'logo') || findLocalMedia(stem, 'wheel') || undefined,
            thumbnail: findLocalMedia(stem, 'cover3d') || findLocalMedia(stem, 'thumbnail') || undefined,
            fanart: findLocalMedia(stem, 'fanart') || undefined,
            titleshot: findLocalMedia(stem, 'title') || undefined,
            wheel: findLocalMedia(stem, 'wheel') || findLocalMedia(stem, 'logo') || undefined,
            mix: findLocalMedia(stem, 'mix') || undefined,
            boxback: findLocalMedia(stem, 'backcover') || undefined,
            bezel: findLocalMedia(stem, 'bezel') || undefined,
            manual: findLocalMedia(stem, 'manual') || undefined,
            magazine: findLocalMedia(stem, 'magazine') || undefined,
            map: findLocalMedia(stem, 'map') || undefined
          })
        }
      }
    } else {
      // No physical files found, use XML or existing DB games
      if (!isIndexed) {
        xmlGamesMap.forEach(g => mergedGames.push(g))
      } else {
        existingGamesMap.forEach(g => mergedGames.push(g))
      }
    }

    // 8. Store in DB inside a transaction
    const insertGame = db.prepare(`
      INSERT OR REPLACE INTO games (
        id, name, path, system, desc, image, video, marquee, thumbnail,
        fanart, titleshot, wheel, mix, boxback, bezel, manual, magazine, map,
        rating, releasedate, developer, publisher, genre, players,
        favorite, hidden, kidgame, playcount, lastplayed,
        region, lang, emulator, core, sortname, tags,
        gamefamily, arcadesystem, languages, cheevos_id, cheevos_hash,
        file_size, file_mtime, crc32, md5, gametime, scrap_name, scrap_date
      ) VALUES (
        @id, @name, @path, @system, @desc, @image, @video, @marquee, @thumbnail,
        @fanart, @titleshot, @wheel, @mix, @boxback, @bezel, @manual, @magazine, @map,
        @rating, @releasedate, @developer, @publisher, @genre, @players,
        @favorite, @hidden, @kidgame, @playcount, @lastplayed,
        @region, @lang, @emulator, @core, @sortname, @tags,
        @gamefamily, @arcadesystem, @languages, @cheevos_id, @cheevos_hash,
        @file_size, @file_mtime, @crc32, @md5, @gametime, @scrap_name, @scrap_date
      )
    `)

    // Modern SQLite UPSERT instead of INSERT OR REPLACE
    const upsertSystem = db.prepare(`
      INSERT INTO systems (name, fullname, path, extension, platform, theme, hardware, last_scan_at, folder_mtime, file_count)
      VALUES (@name, @fullname, @path, @extension, @platform, @theme, @hardware, @last_scan_at, @folder_mtime, @file_count)
      ON CONFLICT(name) DO UPDATE SET
        fullname = excluded.fullname,
        path = excluded.path,
        extension = excluded.extension,
        platform = excluded.platform,
        theme = excluded.theme,
        hardware = excluded.hardware,
        last_scan_at = excluded.last_scan_at,
        folder_mtime = excluded.folder_mtime,
        file_count = excluded.file_count
    `)

    const makeRelative = (p?: string | null) => this.toRelativePath(system.path, p)

    const runTransaction = db.transaction(() => {
      // Delete existing games for this system
      db.prepare('DELETE FROM games WHERE system = ?').run(system.name)

      // Insert all merged games
      for (const game of mergedGames) {
        const g = game as any
        insertGame.run({
          id: g.id || g.path,
          name: g.name || '',
          path: g.path || '',
          system: system.name,
          desc: g.desc || null,
          image: makeRelative(g.image),
          video: makeRelative(g.video),
          marquee: makeRelative(g.marquee),
          thumbnail: makeRelative(g.thumbnail),
          fanart: makeRelative(g.fanart),
          titleshot: makeRelative(g.titleshot),
          wheel: makeRelative(g.wheel),
          mix: makeRelative(g.mix),
          boxback: makeRelative(g.boxback),
          bezel: makeRelative(g.bezel),
          manual: makeRelative(g.manual),
          magazine: makeRelative(g.magazine),
          map: makeRelative(g.map),
          rating: g.rating != null ? g.rating : null,
          releasedate: g.releasedate || null,
          developer: g.developer || null,
          publisher: g.publisher || null,
          genre: g.genre || null,
          players: g.players || null,
          favorite: g.favorite === true || g.favorite === 'true' || g.favorite === '1' ? 1 : 0,
          hidden: g.hidden === true || g.hidden === 'true' || g.hidden === '1' ? 1 : 0,
          kidgame: g.kidgame === true || g.kidgame === 'true' || g.kidgame === '1' ? 1 : 0,
          playcount: g.playcount ? parseInt(String(g.playcount), 10) : 0,
          lastplayed: g.lastplayed || null,
          region: g.region || null,
          lang: g.lang || null,
          emulator: g.emulator || null,
          core: g.core || null,
          sortname: g.sortname || null,
          tags: g.tags || null,
          gamefamily: g.gamefamily || null,
          arcadesystem: g.arcadesystem || null,
          languages: g.languages || null,
          cheevos_id: g.cheevosId || null,
          cheevos_hash: g.cheevosHash || null,
          file_size: null,
          file_mtime: null,
          crc32: g.crc32 ? String(g.crc32).trim().toUpperCase() : null,
          md5: g.md5 || null,
          gametime: g.gametime ? parseInt(String(g.gametime), 10) : null,
          scrap_name: g.scrapName || g.scrap_name || null,
          scrap_date: g.scrapDate || g.scrap_date || null
        })
      }

      // Upsert system record
      upsertSystem.run({
        name: system.name,
        fullname: system.fullname || system.name,
        path: system.path,
        extension: system.extension || '',
        platform: system.platform || '',
        theme: system.theme || system.name,
        hardware: system.hardware || 'console',
        last_scan_at: Date.now(),
        folder_mtime: folderMtime,
        file_count: fileCount
      })
    })

    runTransaction()

    if (log) {
      console.log(`    ✅ ${system.name}: ${mergedGames.length} games indexed`)
    }

    return mergedGames.length
  }

  /**
   * Sync all systems. Only systems that need re-indexing (changed mtime)
   * will be scanned. Returns the number of systems that were re-indexed.
   */
  public async syncAll(
    systems: System[],
    scanPhysicalGames: (systemPath: string, extensions: string[], systemName: string) => Game[],
    onProgress?: (systemName: string, current: number, total: number) => void
  ): Promise<number> {
    const db = this.ensureOpen()
    const isFirstRun = this.getIndexedSystemCount() === 0

    // Filter to only real systems (not virtual/auto-collections/system utilities)
    const realSystems = systems.filter(s =>
      !s.path.startsWith('virtual://') &&
      s.name !== 'collections' &&
      s.hardware !== 'auto collection' &&
      s.hardware !== 'system' &&
      s.hardware !== 'custom-collections'
    )

    if (isFirstRun) {
      console.log(`\n🗄️  First run: indexing ${realSystems.length} systems into SQLite...`)
    }

    let synced = 0
    const total = realSystems.length

    for (let i = 0; i < realSystems.length; i++) {
      const sys = realSystems[i]

      if (isFirstRun || this.needsSync(sys.name, sys.path)) {
        this.syncSystem(sys, scanPhysicalGames, isFirstRun || process.env.NODE_ENV === 'development')
        synced++
      }

      if (onProgress) {
        onProgress(sys.name, i + 1, total)
      }

      // Yield to Electron's event loop so subwindows can load/paint and process IPC without freezing
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    // Sync systems.json config metadata
    const systemsJsonPath = join(getRiescadePath(), 'configs', 'systems.json')
    let combinedMtime = 0
    let esSystemsFileCount = 0
    try {
      if (existsSync(systemsJsonPath)) {
        combinedMtime = Math.round(statSync(systemsJsonPath).mtimeMs)
        esSystemsFileCount = 1
      }
    } catch (err) {
      console.error('Error calculating systems.json mtime:', err)
    }

    db.prepare(`
      INSERT INTO systems (name, fullname, path, extension, platform, theme, hardware, last_scan_at, folder_mtime, file_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        folder_mtime = excluded.folder_mtime,
        file_count = excluded.file_count,
        last_scan_at = excluded.last_scan_at
    `).run(
      '__es_systems.cfg',
      'Systems Configuration File',
      systemsJsonPath,
      '',
      '',
      '',
      'system',
      Date.now(),
      combinedMtime,
      esSystemsFileCount
    )

    // Orphan Cleanup: delete games and systems that are no longer in the active systems list
    const activeNames = realSystems.map(s => s.name)
    if (activeNames.length > 0) {
      const placeholders = activeNames.map(() => '?').join(',')
      db.prepare(`DELETE FROM games WHERE system NOT IN (${placeholders})`).run(...activeNames)
      db.prepare(`DELETE FROM systems WHERE name NOT IN (${placeholders}, '__es_systems.cfg')`).run(...activeNames)
    } else {
      db.prepare('DELETE FROM games').run()
      db.prepare('DELETE FROM systems').run()
    }

    if (isFirstRun) {
      const totalGames = this.getTotalGameCount()
      console.log(`\n✅ Indexing complete: ${totalGames} games across ${realSystems.length} systems`)
    } else if (synced > 0) {
      console.log(`🔄 Re-indexed ${synced} system(s) with changes`)
    } else {
      console.log(`⚡ Database up-to-date, no re-indexing needed`)
    }

    return synced
  }

  // ─── Queries ─────────────────────────────────────────────────

  /**
   * Get all games for a system, sorted by name.
   * Respects the ShowHidden setting.
   */
  public getGamesBySystem(systemName: string, showHidden = false): Game[] {
    const db = this.ensureOpen()

    let query = 'SELECT * FROM games WHERE system = ?'
    if (!showHidden) {
      query += ' AND hidden = 0'
    }
    query += ' ORDER BY COALESCE(sortname, name) COLLATE NOCASE'

    const rows = db.prepare(query).all(systemName) as any[]
    return rows.map(r => this.rowToGame(r))
  }

  /**
   * Get the game count for a single system.
   */
  public getGameCount(systemName: string, showHidden = false): number {
    const db = this.ensureOpen()

    let query = 'SELECT COUNT(*) as count FROM games WHERE system = ?'
    if (!showHidden) {
      query += ' AND hidden = 0'
    }

    const row = db.prepare(query).get(systemName) as any
    return row?.count || 0
  }

  /**
   * Get game counts for all systems at once (batch query).
   */
  public getAllGameCounts(showHidden = false): Map<string, number> {
    const db = this.ensureOpen()

    let query = 'SELECT system, COUNT(*) as count FROM games'
    if (!showHidden) {
      query += ' WHERE hidden = 0'
    }
    query += ' GROUP BY system'

    const rows = db.prepare(query).all() as any[]
    const counts = new Map<string, number>()
    for (const row of rows) {
      counts.set(row.system, row.count)
    }
    return counts
  }

  /**
   * Get total game count across all systems.
   */
  public getTotalGameCount(): number {
    const db = this.ensureOpen()
    const row = db.prepare('SELECT COUNT(*) as count FROM games WHERE hidden = 0').get() as any
    return row?.count || 0
  }

  // ─── Auto-Collection Queries ─────────────────────────────────

  /**
   * Get count of all games (for 'all' auto-collection).
   * Only counts games from the specified displayed systems.
   */
  public getAutoCollectionCount(
    collectionKey: string,
    displayedSystemNames: string[]
  ): number {
    const db = this.ensureOpen()

    if (displayedSystemNames.length === 0) return 0

    const placeholders = displayedSystemNames.map(() => '?').join(',')
    const baseWhere = `system IN (${placeholders}) AND hidden = 0`

    switch (collectionKey) {
      case 'all': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere}`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      case 'favorites': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND favorite = 1`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      case 'recent': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND lastplayed IS NOT NULL AND lastplayed != ''`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      case 'neverplayed': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND (playcount = 0 OR playcount IS NULL)`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      case '2players': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND players IS NOT NULL AND (players LIKE '%2%' OR players LIKE '%-__%')`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      case '4players': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND players IS NOT NULL AND (players LIKE '%4%' OR players LIKE '%-__%')`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      case 'retroachievements': {
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND (cheevos_id IS NOT NULL OR cheevos_hash IS NOT NULL)`
        ).get(...displayedSystemNames) as any
        return row?.count || 0
      }
      default: {
        // Genre-based collection (by genre text match) or publisher/developer
        const genreKey = collectionKey.toLowerCase()
        const row = db.prepare(
          `SELECT COUNT(*) as count FROM games WHERE ${baseWhere} AND (
            UPPER(genre) LIKE '%' || UPPER(?) || '%' OR
            LOWER(publisher) LIKE '%' || ? || '%' OR
            LOWER(developer) LIKE '%' || ? || '%'
          )`
        ).get(...displayedSystemNames, genreKey, genreKey, genreKey) as any
        return row?.count || 0
      }
    }
  }

  /**
   * Get games for an auto-collection.
   */
  public getAutoCollectionGames(
    collectionKey: string,
    displayedSystemNames: string[],
    showHidden = false
  ): Game[] {
    const db = this.ensureOpen()

    if (displayedSystemNames.length === 0) return []

    const placeholders = displayedSystemNames.map(() => '?').join(',')
    const hiddenClause = showHidden ? '' : ' AND hidden = 0'
    const baseWhere = `system IN (${placeholders})${hiddenClause}`

    let rows: any[] = []

    switch (collectionKey) {
      case 'all':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames)
        break
      case 'favorites':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND favorite = 1 ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames)
        break
      case 'recent':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND lastplayed IS NOT NULL AND lastplayed != '' ORDER BY lastplayed DESC`
        ).all(...displayedSystemNames)
        break
      case 'neverplayed':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND (playcount = 0 OR playcount IS NULL) ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames)
        break
      case '2players':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND players IS NOT NULL AND (players LIKE '%2%') ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames)
        break
      case '4players':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND players IS NOT NULL AND (players LIKE '%4%') ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames)
        break
      case 'retroachievements':
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND (cheevos_id IS NOT NULL OR cheevos_hash IS NOT NULL) ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames)
        break
      default: {
        // Genre-based or publisher/developer based
        const key = collectionKey.toLowerCase()
        rows = db.prepare(
          `SELECT * FROM games WHERE ${baseWhere} AND (
            UPPER(genre) LIKE '%' || UPPER(?) || '%' OR
            LOWER(publisher) LIKE '%' || ? || '%' OR
            LOWER(developer) LIKE '%' || ? || '%'
          ) ORDER BY name COLLATE NOCASE`
        ).all(...displayedSystemNames, key, key, key)
        break
      }
    }

    return rows.map(r => this.rowToGame(r))
  }

  // ─── Mutations (dual-write: DB + gamelist.xml) ───────────────

  /**
   * Update a game in the database. Also marks the gamelist.xml as dirty.
   */
  public upsertGame(game: Game): void {
    const db = this.ensureOpen()
    const g = game as any

    const systemRow = db.prepare('SELECT path FROM systems WHERE name = ?').get(g.system) as any
    const systemPath = systemRow ? systemRow.path : join(getRomsPath(), g.system)
    const makeRelative = (p?: string | null) => this.toRelativePath(systemPath, p)

    db.prepare(`
      INSERT OR REPLACE INTO games (
        id, name, path, system, desc, image, video, marquee, thumbnail,
        fanart, titleshot, wheel, mix, boxback, bezel, manual, magazine, map,
        rating, releasedate, developer, publisher, genre, players,
        favorite, hidden, kidgame, playcount, lastplayed,
        region, lang, emulator, core, sortname, tags,
        gamefamily, arcadesystem, languages, cheevos_id, cheevos_hash,
        file_size, file_mtime, crc32, md5, gametime, scrap_name, scrap_date
      ) VALUES (
        @id, @name, @path, @system, @desc, @image, @video, @marquee, @thumbnail,
        @fanart, @titleshot, @wheel, @mix, @boxback, @bezel, @manual, @magazine, @map,
        @rating, @releasedate, @developer, @publisher, @genre, @players,
        @favorite, @hidden, @kidgame, @playcount, @lastplayed,
        @region, @lang, @emulator, @core, @sortname, @tags,
        @gamefamily, @arcadesystem, @languages, @cheevos_id, @cheevos_hash,
        @file_size, @file_mtime, @crc32, @md5, @gametime, @scrap_name, @scrap_date
      )
    `).run({
      id: g.id || g.path,
      name: g.name || '',
      path: g.path || '',
      system: g.system,
      desc: g.desc || null,
      image: makeRelative(g.image),
      video: makeRelative(g.video),
      marquee: makeRelative(g.marquee),
      thumbnail: makeRelative(g.thumbnail),
      fanart: makeRelative(g.fanart),
      titleshot: makeRelative(g.titleshot),
      wheel: makeRelative(g.wheel),
      mix: makeRelative(g.mix),
      boxback: makeRelative(g.boxback),
      bezel: makeRelative(g.bezel),
      manual: makeRelative(g.manual),
      magazine: makeRelative(g.magazine),
      map: makeRelative(g.map),
      rating: g.rating != null ? g.rating : null,
      releasedate: g.releasedate || null,
      developer: g.developer || null,
      publisher: g.publisher || null,
      genre: g.genre || null,
      players: g.players || null,
      favorite: g.favorite === true || g.favorite === 'true' || g.favorite === '1' ? 1 : 0,
      hidden: g.hidden === true || g.hidden === 'true' || g.hidden === '1' ? 1 : 0,
      kidgame: g.kidgame === true || g.kidgame === 'true' || g.kidgame === '1' ? 1 : 0,
      playcount: g.playcount ? parseInt(String(g.playcount), 10) : 0,
      lastplayed: g.lastplayed || null,
      region: g.region || null,
      lang: g.lang || null,
      emulator: g.emulator || null,
      core: g.core || null,
      sortname: g.sortname || null,
      tags: g.tags || null,
      gamefamily: g.gamefamily || null,
      arcadesystem: g.arcadesystem || null,
      languages: g.languages || null,
      cheevos_id: g.cheevosId || null,
      cheevos_hash: g.cheevosHash || null,
      file_size: null,
      file_mtime: null,
      crc32: g.crc32 ? String(g.crc32).trim().toUpperCase() : null,
      md5: g.md5 || null,
      gametime: g.gametime ? parseInt(String(g.gametime), 10) : null,
      scrap_name: g.scrapName || g.scrap_name || null,
      scrap_date: g.scrapDate || g.scrap_date || null
    })
  }

  public deleteGameFromDb(systemName: string, gamePath: string): void {
    const db = this.ensureOpen()
    db.prepare('DELETE FROM games WHERE system = ? AND path = ?').run(systemName, gamePath)
    db.prepare('DELETE FROM collection_games WHERE game_system = ? AND game_path = ?').run(systemName, gamePath)
  }

  // ─── Maintenance ─────────────────────────────────────────────

  /**
   * Rebuild the entire database from scratch.
   */
  public async rebuildAll(
    systems: System[],
    scanPhysicalGames: (systemPath: string, extensions: string[], systemName: string) => Game[],
    onProgress?: (systemName: string, current: number, total: number) => void
  ): Promise<void> {
    const db = this.ensureOpen()

    console.log('🗑️  Clearing database for full rebuild...')
    db.exec('DELETE FROM games')
    db.exec('DELETE FROM systems')

    await this.syncAll(systems, scanPhysicalGames, onProgress)
  }

  /**
   * Compact the database file.
   */
  public vacuum(): void {
    const db = this.ensureOpen()
    db.exec('VACUUM')
  }

  /**
   * Get sync status for all systems.
   */
  public getSystemSyncInfo(): { name: string; lastScanAt: number; gameCount: number }[] {
    const db = this.ensureOpen()
    
    // 1. Get all systems
    const systems = db.prepare('SELECT name, last_scan_at FROM systems ORDER BY name').all() as any[]
    
    // 2. Get game counts grouped by system in one query
    const counts = db.prepare('SELECT system, COUNT(*) as count FROM games WHERE hidden = 0 GROUP BY system').all() as any[]
    
    const countMap = new Map<string, number>()
    counts.forEach(row => {
      countMap.set(row.system, row.count)
    })

    return systems.map(s => ({
      name: s.name,
      lastScanAt: s.last_scan_at || 0,
      gameCount: countMap.get(s.name) || 0
    }))
  }

  /**
   * Search games by name across all systems.
   */
  public searchGames(query: string, displayedSystemNames?: string[]): Game[] {
    const db = this.ensureOpen()

    let sql = `SELECT * FROM games WHERE hidden = 0 AND name LIKE ?`
    const params: any[] = [`%${query}%`]

    if (displayedSystemNames && displayedSystemNames.length > 0) {
      const placeholders = displayedSystemNames.map(() => '?').join(',')
      sql += ` AND system IN (${placeholders})`
      params.push(...displayedSystemNames)
    }

    sql += ' ORDER BY name COLLATE NOCASE LIMIT 200'

    const rows = db.prepare(sql).all(...params) as any[]
    return rows.map(r => this.rowToGame(r))
  }

  public getGamesPaginated(
    system: string,
    page: number,
    pageSize: number,
    search: string,
    sortBy: string,
    sortDir: string
  ): { games: Game[]; total: number; pages: number } {
    const db = this.ensureOpen()
    const offset = (page - 1) * pageSize
    
    // Validate sort parameters to prevent SQL injection
    const allowedSortFields = [
      'name', 'system', 'rating', 'releasedate', 'playcount',
      'lastplayed', 'favorite', 'hidden', 'developer', 'publisher', 'genre'
    ]
    const activeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name'
    const activeSortDir = (sortDir.toUpperCase() === 'DESC') ? 'DESC' : 'ASC'

    let whereClauses: string[] = []
    const params: any[] = []

    if (system && system !== 'all') {
      whereClauses.push('system = ?')
      params.push(system)
    }

    if (search && search.trim().length > 0) {
      whereClauses.push('(name LIKE ? OR desc LIKE ? OR developer LIKE ? OR publisher LIKE ? OR genre LIKE ?)')
      const searchWildcard = `%${search.trim()}%`
      params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard, searchWildcard)
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    // 1. Get total count
    const countQuery = `SELECT COUNT(*) as count FROM games ${whereString}`
    const countRow = db.prepare(countQuery).get(...params) as any
    const total = countRow?.count || 0

    // 2. Get paginated rows
    const selectQuery = `
      SELECT * FROM games 
      ${whereString} 
      ORDER BY ${activeSortBy === 'name' ? 'COALESCE(sortname, name)' : activeSortBy} COLLATE NOCASE ${activeSortDir} 
      LIMIT ? OFFSET ?
    `
    const selectParams = [...params, pageSize, offset]
    const rows = db.prepare(selectQuery).all(...selectParams) as any[]
    
    const games = rows.map(r => this.rowToGame(r))
    const pages = Math.ceil(total / pageSize)

    return { games, total, pages }
  }


  private toRelativePath(systemPath: string, p?: string | null): string | null {
    if (!p || typeof p !== 'string') return null
    if (p.startsWith('http')) return p
    
    // If it's already a relative path, normalize slashes
    if (!isAbsolute(p) && !p.match(/^[a-zA-Z]:/)) {
      return p.replace(/\\/g, '/')
    }
    
    // Resolve relative path relative to systemPath
    const rel = relative(systemPath, p)
    const normalized = rel.replace(/\\/g, '/')
    return normalized.startsWith('.') ? normalized : './' + normalized
  }

  private toAbsolutePath(systemPath: string, p?: string | null): string | null {
    if (!p || typeof p !== 'string') return null
    if (p.startsWith('http') || isAbsolute(p) || p.match(/^[a-zA-Z]:/)) {
      return p.replace(/\\/g, '/')
    }
    return resolve(systemPath, p).replace(/\\/g, '/')
  }

  /**
   * Convert a database row to a Game object.
   */
  private rowToGame(row: any): Game {
    const systemPath = join(getRomsPath(), row.system)
    const resolvePath = (p?: string | null) => this.toAbsolutePath(systemPath, p) || undefined

    return {
      id: row.id || row.path,
      name: row.name,
      path: row.path,
      system: row.system,
      desc: row.desc || undefined,
      image: resolvePath(row.image),
      video: resolvePath(row.video),
      marquee: resolvePath(row.marquee),
      thumbnail: resolvePath(row.thumbnail),
      fanart: resolvePath(row.fanart),
      titleshot: resolvePath(row.titleshot),
      rating: row.rating != null ? row.rating : undefined,
      releasedate: row.releasedate || undefined,
      developer: row.developer || undefined,
      publisher: row.publisher || undefined,
      genre: row.genre || undefined,
      players: row.players || undefined,
      favorite: row.favorite === 1,
      hidden: row.hidden === 1,
      kidgame: row.kidgame === 1,
      playcount: row.playcount || 0,
      lastplayed: row.lastplayed || undefined,
      emulator: row.emulator || undefined,
      core: row.core || undefined,
      sortname: row.sortname || undefined,
      tags: row.tags || undefined,
      boxback: resolvePath(row.boxback),
      bezel: resolvePath(row.bezel),
      manual: resolvePath(row.manual),
      magazine: resolvePath(row.magazine),
      map: resolvePath(row.map),
      gamefamily: row.gamefamily || undefined,
      arcadesystem: row.arcadesystem || undefined,
      languages: row.languages || undefined,
      region: row.region || undefined,
      cheevosId: row.cheevos_id || undefined,
      cheevosHash: row.cheevos_hash || undefined,
      crc32: row.crc32 || undefined,
      md5: row.md5 || undefined,
      gametime: row.gametime || undefined,
      scrapName: row.scrap_name || undefined,
      scrapDate: row.scrap_date || undefined,
      wheel: resolvePath(row.wheel),
      mix: resolvePath(row.mix)
    } as any
  }


  public getRandomGameWithMedia(mediaType: 'video' | 'image'): Game | null {
    const db = this.ensureOpen()
    const field = mediaType === 'video' ? 'video' : 'image'
    try {
      const row = db.prepare(`SELECT * FROM games WHERE ${field} IS NOT NULL AND ${field} != '' AND hidden = 0 ORDER BY RANDOM() LIMIT 1`).get() as any
      return row ? this.rowToGame(row) : null
    } catch (e) {
      console.error(`Failed to get random game with ${mediaType}:`, e)
      return null
    }
  }

  /**
   * Get all unique media paths (image, fanart, marquee) stored in the database.
   */
  public getAllMediaPaths(): string[] {
    const db = this.ensureOpen()
    try {
      const rows = db.prepare(`
        SELECT DISTINCT image as path FROM games WHERE image IS NOT NULL AND image != ''
        UNION
        SELECT DISTINCT fanart as path FROM games WHERE fanart IS NOT NULL AND fanart != ''
        UNION
        SELECT DISTINCT marquee as path FROM games WHERE marquee IS NOT NULL AND marquee != ''
      `).all() as any[]
      return rows.map(r => r.path).filter(Boolean)
    } catch (e) {
      console.error('Failed to get all media paths from database:', e)
      return []
    }
  }

  /**
   * Get sync metadata for a single system.
   */
  public getSystemSyncMetadata(name: string): { name: string; path: string; folder_mtime: number; file_count: number } | null {
    const db = this.ensureOpen()
    try {
      const row = db.prepare('SELECT name, path, folder_mtime, file_count FROM systems WHERE name = ?').get(name) as any
      return row ? {
        name: row.name,
        path: row.path,
        folder_mtime: row.folder_mtime || 0,
        file_count: row.file_count || 0
      } : null
    } catch {
      try {
        const row = db.prepare('SELECT name, path, folder_mtime FROM systems WHERE name = ?').get(name) as any
        return row ? {
          name: row.name,
          path: row.path,
          folder_mtime: row.folder_mtime || 0,
          file_count: 0
        } : null
      } catch {
        return null
      }
    }
  }

  public getAllSystemsSyncMetadata(): { name: string; path: string; folder_mtime: number; file_count: number }[] {
    const db = this.ensureOpen()
    try {
      const rows = db.prepare("SELECT name, path, folder_mtime, file_count FROM systems WHERE name != '__es_systems.cfg'").all() as any[]
      return rows.map(r => ({
        name: r.name,
        path: r.path,
        folder_mtime: r.folder_mtime || 0,
        file_count: r.file_count || 0
      }))
    } catch {
      try {
        const rows = db.prepare("SELECT name, path, folder_mtime FROM systems WHERE name != '__es_systems.cfg'").all() as any[]
        return rows.map(r => ({
          name: r.name,
          path: r.path,
          folder_mtime: r.folder_mtime || 0,
          file_count: 0
        }))
      } catch {
        return []
      }
    }
  }

  // ─── Custom Collection Operations ─────────────────────────────

  public getCustomCollections(): string[] {
    const db = this.ensureOpen()
    try {
      const rows = db.prepare('SELECT name FROM collections ORDER BY name COLLATE NOCASE').all() as any[]
      return rows.map(r => r.name)
    } catch (e) {
      console.error('Failed to query custom collections from DB:', e)
      return []
    }
  }

  public getCollectionGames(collectionName: string): Game[] {
    const db = this.ensureOpen()
    try {
      const rows = db.prepare(`
        SELECT g.*
        FROM collection_games cg
        JOIN games g ON cg.game_system = g.system AND cg.game_path = g.path
        WHERE cg.collection_name = ?
        ORDER BY COALESCE(g.sortname, g.name) COLLATE NOCASE
      `).all(collectionName) as any[]
      return rows.map(r => this.rowToGame(r))
    } catch (e) {
      console.error(`Failed to query games for collection ${collectionName} from DB:`, e)
      return []
    }
  }

  public getCollectionsForGame(systemName: string, gamePath: string): string[] {
    const db = this.ensureOpen()
    try {
      const rows = db.prepare(`
        SELECT collection_name
        FROM collection_games
        WHERE game_system = ? AND game_path = ?
        ORDER BY collection_name COLLATE NOCASE
      `).all(systemName, gamePath) as any[]
      return rows.map(r => r.collection_name)
    } catch (e) {
      console.error('Failed to query collections for game:', e)
      return []
    }
  }

  public toggleGameInCollection(collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove'): boolean {
    const db = this.ensureOpen()
    try {
      if (action === 'add') {
        // Ensure collection exists
        db.prepare('INSERT OR IGNORE INTO collections (name) VALUES (?)').run(collectionName)
        
        // Insert association
        const res = db.prepare(`
          INSERT OR IGNORE INTO collection_games (collection_name, game_system, game_path)
          VALUES (?, ?, ?)
        `).run(collectionName, systemName, gamePath)
        
        return res.changes > 0
      } else {
        const res = db.prepare(`
          DELETE FROM collection_games
          WHERE collection_name = ? AND game_system = ? AND game_path = ?
        `).run(collectionName, systemName, gamePath)
        
        return res.changes > 0
      }
    } catch (e) {
      console.error('Failed to toggle game in collection:', e)
      return false
    }
  }
}

