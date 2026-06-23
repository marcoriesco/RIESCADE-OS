import Database from 'better-sqlite3'
import { existsSync, statSync, readdirSync, mkdirSync } from 'fs'
import { join, dirname, relative, resolve } from 'path'
import { getDatabasePath, getRomsPath, getConfigPath } from '../utils/paths'
import { GamelistParser } from '../parsers/GamelistParser'
import { Game, System } from '../../shared/types'

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
        PRIMARY KEY (system, path)
      );

      CREATE INDEX IF NOT EXISTS idx_games_system ON games(system);
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

    // 1. Get current folder mtime
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

    // 2. Scan physical files
    const extensions = (system.extension || '').split(/\s+/).filter(e => e.trim().length > 0)
    let physicalGames: Game[] = []
    if (existsSync(system.path)) {
      physicalGames = scanPhysicalGames(system.path, extensions, system.name)
    }

    // 3. Parse gamelist.xml for metadata
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

    // 4. Merge: physical scan + XML metadata
    const normalizePathForComparison = (p: string): string => {
      if (!p) return ''
      return p
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\//, '')
        .trim()
        .toLowerCase()
    }

    const xmlGamesMap = new Map<string, Game>()
    xmlGames.forEach(g => {
      xmlGamesMap.set(normalizePathForComparison(g.path), g)
    })

    const mergedGames: Game[] = []

    if (physicalGames.length > 0) {
      for (const pg of physicalGames) {
        const normPath = normalizePathForComparison(pg.path)
        const xmlGame = xmlGamesMap.get(normPath)
        if (xmlGame) {
          mergedGames.push({
            ...pg,
            ...xmlGame,
            system: system.name,
            path: pg.path,
            id: xmlGame.id && !xmlGame.id.includes('/') && !xmlGame.id.includes('\\') ? xmlGame.id : pg.id
          })
        } else {
          mergedGames.push(pg)
        }
      }
    } else {
      // No physical files found, use XML games only
      mergedGames.push(...xmlGames)
    }

    // 5. Store in DB inside a transaction
    const insertGame = db.prepare(`
      INSERT OR REPLACE INTO games (
        id, name, path, system, desc, image, video, marquee, thumbnail,
        fanart, titleshot, wheel, mix, boxback, bezel, manual, magazine, map,
        rating, releasedate, developer, publisher, genre, players,
        favorite, hidden, kidgame, playcount, lastplayed,
        region, lang, emulator, core, sortname, tags,
        gamefamily, arcadesystem, languages, cheevos_id, cheevos_hash,
        file_size, file_mtime, crc32
      ) VALUES (
        @id, @name, @path, @system, @desc, @image, @video, @marquee, @thumbnail,
        @fanart, @titleshot, @wheel, @mix, @boxback, @bezel, @manual, @magazine, @map,
        @rating, @releasedate, @developer, @publisher, @genre, @players,
        @favorite, @hidden, @kidgame, @playcount, @lastplayed,
        @region, @lang, @emulator, @core, @sortname, @tags,
        @gamefamily, @arcadesystem, @languages, @cheevos_id, @cheevos_hash,
        @file_size, @file_mtime, @crc32
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
          image: g.image || null,
          video: g.video || null,
          marquee: g.marquee || null,
          thumbnail: g.thumbnail || null,
          fanart: g.fanart || null,
          titleshot: g.titleshot || null,
          wheel: g.wheel || null,
          mix: g.mix || null,
          boxback: g.boxback || null,
          bezel: g.bezel || null,
          manual: g.manual || null,
          magazine: g.magazine || null,
          map: g.map || null,
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
          crc32: g.crc32 ? String(g.crc32).trim().toUpperCase() : null
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
  public syncAll(
    systems: System[],
    scanPhysicalGames: (systemPath: string, extensions: string[], systemName: string) => Game[],
    onProgress?: (systemName: string, current: number, total: number) => void
  ): number {
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
    }

    // Sync __es_systems.cfg config metadata
    const configPath = getConfigPath()
    const systemsJsonPath = join(configPath, 'es_systems.cfg')
    let combinedMtime = 0
    let esSystemsFileCount = 0
    try {
      if (existsSync(systemsJsonPath)) {
        combinedMtime += Math.round(statSync(systemsJsonPath).mtimeMs)
        esSystemsFileCount++
      }
      if (existsSync(configPath)) {
        const files = readdirSync(configPath)
        files.forEach(f => {
          if (f.startsWith('es_systems_') && f.endsWith('.cfg')) {
            const fPath = join(configPath, f)
            combinedMtime += Math.round(statSync(fPath).mtimeMs)
            esSystemsFileCount++
          }
        })
      }
    } catch (err) {
      console.error('Error calculating es_systems config mtime:', err)
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

    db.prepare(`
      INSERT OR REPLACE INTO games (
        id, name, path, system, desc, image, video, marquee, thumbnail,
        fanart, titleshot, wheel, mix, boxback, bezel, manual, magazine, map,
        rating, releasedate, developer, publisher, genre, players,
        favorite, hidden, kidgame, playcount, lastplayed,
        region, lang, emulator, core, sortname, tags,
        gamefamily, arcadesystem, languages, cheevos_id, cheevos_hash,
        file_size, file_mtime, crc32
      ) VALUES (
        @id, @name, @path, @system, @desc, @image, @video, @marquee, @thumbnail,
        @fanart, @titleshot, @wheel, @mix, @boxback, @bezel, @manual, @magazine, @map,
        @rating, @releasedate, @developer, @publisher, @genre, @players,
        @favorite, @hidden, @kidgame, @playcount, @lastplayed,
        @region, @lang, @emulator, @core, @sortname, @tags,
        @gamefamily, @arcadesystem, @languages, @cheevos_id, @cheevos_hash,
        @file_size, @file_mtime, @crc32
      )
    `).run({
      id: g.id || g.path,
      name: g.name || '',
      path: g.path || '',
      system: g.system,
      desc: g.desc || null,
      image: g.image || null,
      video: g.video || null,
      marquee: g.marquee || null,
      thumbnail: g.thumbnail || null,
      fanart: g.fanart || null,
      titleshot: g.titleshot || null,
      wheel: g.wheel || null,
      mix: g.mix || null,
      boxback: g.boxback || null,
      bezel: g.bezel || null,
      manual: g.manual || null,
      magazine: g.magazine || null,
      map: g.map || null,
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
      crc32: g.crc32 ? String(g.crc32).trim().toUpperCase() : null
    })
  }

  public deleteGameFromDb(systemName: string, gamePath: string): void {
    const db = this.ensureOpen()
    db.prepare('DELETE FROM games WHERE system = ? AND path = ?').run(systemName, gamePath)
  }

  // ─── Maintenance ─────────────────────────────────────────────

  /**
   * Rebuild the entire database from scratch.
   */
  public rebuildAll(
    systems: System[],
    scanPhysicalGames: (systemPath: string, extensions: string[], systemName: string) => Game[],
    onProgress?: (systemName: string, current: number, total: number) => void
  ): void {
    const db = this.ensureOpen()

    console.log('🗑️  Clearing database for full rebuild...')
    db.exec('DELETE FROM games')
    db.exec('DELETE FROM systems')

    this.syncAll(systems, scanPhysicalGames, onProgress)
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
    const rows = db.prepare(`
      SELECT s.name, s.last_scan_at,
             (SELECT COUNT(*) FROM games g WHERE g.system = s.name AND g.hidden = 0) as game_count
      FROM systems s
      ORDER BY s.name
    `).all() as any[]

    return rows.map(r => ({
      name: r.name,
      lastScanAt: r.last_scan_at || 0,
      gameCount: r.game_count || 0
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

  // ─── Internal Helpers ────────────────────────────────────────

  /**
   * Convert a database row to a Game object.
   */
  private rowToGame(row: any): Game {
    return {
      id: row.id || row.path,
      name: row.name,
      path: row.path,
      system: row.system,
      desc: row.desc || undefined,
      image: row.image || undefined,
      video: row.video || undefined,
      marquee: row.marquee || undefined,
      thumbnail: row.thumbnail || undefined,
      fanart: row.fanart || undefined,
      titleshot: row.titleshot || undefined,
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
      boxback: row.boxback || undefined,
      bezel: row.bezel || undefined,
      manual: row.manual || undefined,
      magazine: row.magazine || undefined,
      map: row.map || undefined,
      gamefamily: row.gamefamily || undefined,
      arcadesystem: row.arcadesystem || undefined,
      languages: row.languages || undefined,
      region: row.region || undefined,
      cheevosId: row.cheevos_id || undefined,
      cheevosHash: row.cheevos_hash || undefined,
      crc32: row.crc32 || undefined
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

  /**
   * Get sync metadata (mtime and file count) for all systems except __es_systems.cfg.
   */
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
}
