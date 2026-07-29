const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const { XMLParser } = require('fast-xml-parser')
const {
  xmlRoot, databasePath, manifestPath, snapshotPath, ensureDirectories,
  sha256, stableAssetId
} = require('./common')

const ignoredNames = new Set(['_media.zip', '_media.7z'])
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })

async function parseFileRecords(filePath, onRecord) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 256 * 1024 })
  let buffer = ''
  for await (const chunk of stream) {
    buffer += chunk
    while (true) {
      const start = buffer.indexOf('<file ')
      if (start < 0) {
        buffer = buffer.slice(-32)
        break
      }
      const end = buffer.indexOf('</file>', start)
      if (end < 0) {
        if (start > 0) buffer = buffer.slice(start)
        break
      }
      const xml = buffer.slice(start, end + 7)
      buffer = buffer.slice(end + 7)
      const record = parser.parse(xml)?.file
      if (record) onRecord(record)
    }
  }
  if (buffer.includes('<file ')) throw new Error(`XML truncado: ${filePath}`)
}

function extensionOf(name) {
  return path.extname(name).toLowerCase()
}

function titleOf(name) {
  return path.basename(name, path.extname(name))
}

async function main() {
  ensureDirectories()
  if (!fs.existsSync(snapshotPath)) throw new Error('Execute catalog:download antes de catalog:build.')
  const { platforms } = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  const temporary = `${databasePath}.building`
  fs.rmSync(temporary, { force: true })
  const db = new Database(temporary)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  db.exec(`
    CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE platforms (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, archive_identifier TEXT NOT NULL UNIQUE,
      details_url TEXT, torrent_url TEXT, install_mode TEXT NOT NULL,
      install_extension TEXT, game_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE games (
      id TEXT PRIMARY KEY, platform_id TEXT NOT NULL REFERENCES platforms(id),
      title TEXT NOT NULL, filename TEXT NOT NULL, archive_path TEXT NOT NULL,
      extension TEXT NOT NULL, file_size INTEGER, sha1 TEXT, md5 TEXT,
      install_mode TEXT NOT NULL, install_name TEXT NOT NULL,
      UNIQUE(platform_id, archive_path)
    );
    CREATE INDEX games_platform_title ON games(platform_id, title COLLATE NOCASE);
    CREATE INDEX games_platform_filename ON games(platform_id, filename COLLATE NOCASE);
  `)
  const insertPlatform = db.prepare(`
    INSERT INTO platforms(id,name,archive_identifier,details_url,torrent_url,install_mode,install_extension)
    VALUES (@id,@name,@identifier,@details,@torrent,@installMode,@installExtension)
  `)
  const insertGame = db.prepare(`
    INSERT OR IGNORE INTO games
      (id,platform_id,title,filename,archive_path,extension,file_size,sha1,md5,install_mode,install_name)
    VALUES
      (@id,@platformId,@title,@filename,@archivePath,@extension,@fileSize,@sha1,@md5,@installMode,@installName)
  `)

  try {
    for (const platform of platforms) {
      insertPlatform.run({
        id: platform.id, name: platform.name, identifier: platform.archive.identifier,
        details: platform.archive.details_url || null, torrent: platform.archive.torrent_url || null,
        installMode: platform.install_mode, installExtension: platform.install_extension
      })
      const allowed = new Set(
        (platform.install_mode === 'extract' ? ['.zip'] : platform.extensions)
          .map(extension => extension.toLowerCase())
      )
      const xmlPath = path.join(xmlRoot, `${platform.archive.identifier}_files.xml`)
      if (!fs.existsSync(xmlPath)) throw new Error(`XML ausente: ${platform.id}`)
      const insertBatch = db.transaction(records => records.forEach(record => insertGame.run(record)))
      let batch = []
      await parseFileRecords(xmlPath, file => {
        const archivePath = String(file.name || '')
        const filename = path.basename(archivePath)
        const extension = extensionOf(filename)
        if (
          !archivePath || file.source !== 'original' || ignoredNames.has(filename.toLowerCase()) ||
          !allowed.has(extension)
        ) return
        const title = titleOf(filename)
        batch.push({
          id: stableAssetId(platform.id, archivePath),
          platformId: platform.id,
          title,
          filename,
          archivePath,
          extension,
          fileSize: /^\d+$/.test(String(file.size || '')) ? Number(file.size) : null,
          sha1: typeof file.sha1 === 'string' ? file.sha1 : null,
          md5: typeof file.md5 === 'string' ? file.md5 : null,
          installMode: platform.install_mode,
          installName: `${title}${platform.install_extension || ''}`
        })
        if (batch.length >= 1000) {
          insertBatch(batch)
          batch = []
        }
      })
      if (batch.length) insertBatch(batch)
      db.prepare(`
        UPDATE platforms SET game_count =
          (SELECT COUNT(*) FROM games WHERE platform_id = platforms.id)
        WHERE id = ?
      `).run(platform.id)
      console.log(`indexado ${platform.id}`)
    }
    db.prepare('INSERT INTO catalog_meta(key,value) VALUES (?,?)').run('schemaVersion', '1')
    db.prepare('INSERT INTO catalog_meta(key,value) VALUES (?,?)').run('generatedAt', new Date().toISOString())
    db.pragma('optimize')
    db.close()
    fs.rmSync(databasePath, { force: true })
    fs.renameSync(temporary, databasePath)
  } catch (error) {
    db.close()
    fs.rmSync(temporary, { force: true })
    throw error
  }

  const read = new Database(databasePath, { readonly: true })
  const platformCount = read.prepare('SELECT COUNT(*) count FROM platforms').get().count
  const gameCount = read.prepare('SELECT COUNT(*) count FROM games').get().count
  const platformCounts = read.prepare('SELECT id, game_count AS gameCount FROM platforms ORDER BY id').all()
  read.close()
  const generatedAt = new Date().toISOString()
  const databaseSize = fs.statSync(databasePath).size
  const databaseSha256 = await sha256(databasePath)
  const catalogVersion = `${generatedAt.slice(0, 10).replaceAll('-', '.')}-${databaseSha256.slice(0, 12)}`
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1, catalogVersion, generatedAt, platformCount, gameCount,
    databaseSize, databaseSha256, platforms: platformCounts
  }, null, 2))
  console.log(`${gameCount} jogo(s), ${platformCount} plataforma(s), versão ${catalogVersion}.`)
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { parseFileRecords, extensionOf, titleOf }
