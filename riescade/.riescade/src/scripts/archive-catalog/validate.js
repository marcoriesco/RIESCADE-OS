const fs = require('fs')
const Database = require('better-sqlite3')
const { databasePath, manifestPath, snapshotPath, sha256 } = require('./common')

async function main() {
  for (const file of [databasePath, manifestPath, snapshotPath]) {
    if (!fs.existsSync(file)) throw new Error(`Artefato ausente: ${file}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  const db = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`SQLite integrity_check: ${integrity}`)
    const platformCount = db.prepare('SELECT COUNT(*) count FROM platforms').get().count
    const gameCount = db.prepare('SELECT COUNT(*) count FROM games').get().count
    const empty = db.prepare('SELECT id FROM platforms WHERE game_count = 0').all()
    const invalid = db.prepare(`
      SELECT COUNT(*) count FROM games
      WHERE archive_path = '' OR filename = '' OR extension = '' OR install_name = ''
    `).get().count
    if (platformCount !== snapshot.platforms.length) throw new Error('Contagem de plataformas diverge da configuração.')
    if (platformCount !== manifest.platformCount || gameCount !== manifest.gameCount) {
      throw new Error('Contagens do manifesto divergem do SQLite.')
    }
    if (empty.length) throw new Error(`Plataformas sem jogos: ${empty.map(item => item.id).join(', ')}`)
    if (invalid) throw new Error(`${invalid} jogo(s) com campos obrigatórios inválidos.`)
  } finally {
    db.close()
  }
  if (fs.statSync(databasePath).size !== manifest.databaseSize) throw new Error('Tamanho do SQLite diverge do manifesto.')
  if (await sha256(databasePath) !== manifest.databaseSha256) throw new Error('SHA-256 do SQLite diverge do manifesto.')
  let cursor = 0
  const failures = []
  await Promise.all(Array.from({ length: Math.min(10, snapshot.platforms.length) }, async () => {
    while (cursor < snapshot.platforms.length) {
      const platform = snapshot.platforms[cursor++]
      const url = platform.archive.details_url || `https://archive.org/details/${platform.archive.identifier}`
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'RIESCADE-Catalog-Validator/1.0' },
        signal: AbortSignal.timeout(20_000)
      }).catch(error => ({ ok: false, status: error.message }))
      if (!response.ok) failures.push(`${platform.id}: ${response.status}`)
    }
  }))
  if (failures.length) throw new Error(`Links inválidos:\n${failures.join('\n')}`)
  console.log(`Catálogo íntegro: ${manifest.gameCount} jogos em ${manifest.platformCount} plataformas.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
