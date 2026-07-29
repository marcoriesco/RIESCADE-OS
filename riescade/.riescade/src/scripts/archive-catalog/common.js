const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const projectRoot = path.resolve(__dirname, '..', '..')
const workRoot = path.join(projectRoot, '.catalog-cache')
const xmlRoot = path.join(workRoot, 'xml')
const resourceRoot = path.join(projectRoot, 'src', 'main', 'resources', 'game-catalog')
const databasePath = path.join(resourceRoot, 'archive-catalog.sqlite')
const manifestPath = path.join(resourceRoot, 'catalog-manifest.json')
const snapshotPath = path.join(workRoot, 'platforms.snapshot.json')
const downloadStatePath = path.join(workRoot, 'download-state.json')

function resolveCatalogConfig() {
  const candidates = [
    process.env.RIESCADE_GAMES_CATALOG,
    'D:\\DEV\\Web\\riescade\\riescade.com.br\\src\\data\\games-catalog.json',
    path.resolve(projectRoot, '..', '..', '..', '..', '..', 'Web', 'riescade', 'riescade.com.br', 'src', 'data', 'games-catalog.json')
  ].filter(Boolean)
  const source = candidates.find(candidate => fs.existsSync(candidate))
  if (!source) {
    throw new Error(
      'games-catalog.json não encontrado. Defina RIESCADE_GAMES_CATALOG com o caminho do catálogo do site.'
    )
  }
  return source
}

function readPlatforms(source = resolveCatalogConfig()) {
  const parsed = JSON.parse(fs.readFileSync(source, 'utf8'))
  if (!Array.isArray(parsed.platforms)) throw new Error('games-catalog.json não contém platforms.')
  return parsed.platforms
    .filter(platform => platform?.archive?.identifier)
    .map(platform => ({
      id: String(platform.id).toLowerCase(),
      name: String(platform.name || platform.id),
      extensions: Array.isArray(platform.extensions) ? platform.extensions.map(String) : [],
      install_mode: platform.install_mode === 'extract' ? 'extract' : 'file',
      install_extension: typeof platform.install_extension === 'string' ? platform.install_extension : null,
      archive: {
        identifier: String(platform.archive.identifier),
        details_url: String(platform.archive.details_url || ''),
        metadata_url: String(platform.archive.metadata_url || ''),
        torrent_url: String(platform.archive.torrent_url || '')
      }
    }))
}

function ensureDirectories() {
  fs.mkdirSync(xmlRoot, { recursive: true })
  fs.mkdirSync(resourceRoot, { recursive: true })
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

function stableAssetId(platform, archivePath) {
  return crypto.createHash('sha256').update(`${platform}\0${archivePath}`).digest('hex')
}

module.exports = {
  projectRoot, workRoot, xmlRoot, resourceRoot, databasePath, manifestPath,
  snapshotPath, downloadStatePath, resolveCatalogConfig, readPlatforms,
  ensureDirectories, sha256, stableAssetId
}
