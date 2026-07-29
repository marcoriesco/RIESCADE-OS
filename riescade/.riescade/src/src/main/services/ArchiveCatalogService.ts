import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import Database from 'better-sqlite3'

interface CatalogManifest {
  schemaVersion: number
  catalogVersion: string
  generatedAt: string
  databaseSize: number
  databaseSha256: string
}

export interface LocalCatalogAsset {
  id: string
  title: string
  download_name: string
  file_size: number | null
  sha256: null
  install_mode: 'file' | 'extract'
  install_name: string
  romset_version: null
}

export interface LocalPlatformInfo {
  torrentUrl: string | null
  gameCount: number
  downloadBytes: number
}

function bundledRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'game-catalog')
    : join(app.getAppPath(), 'src', 'main', 'resources', 'game-catalog')
}

function readManifest(filePath: string): CatalogManifest {
  const value = JSON.parse(readFileSync(filePath, 'utf8')) as CatalogManifest
  if (
    value.schemaVersion !== 1 ||
    typeof value.catalogVersion !== 'string' ||
    typeof value.generatedAt !== 'string' ||
    !Number.isSafeInteger(value.databaseSize) ||
    !/^[a-f0-9]{64}$/i.test(value.databaseSha256)
  ) {
    throw new Error('Manifesto do catálogo local inválido.')
  }
  return value
}

function sha256(filePath: string): string {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

export class ArchiveCatalogService {
  private database: Database.Database | null = null
  private manifest: CatalogManifest | null = null

  initialize(): void {
    const sourceRoot = bundledRoot()
    const sourceDatabase = join(sourceRoot, 'archive-catalog.sqlite')
    const sourceManifest = join(sourceRoot, 'catalog-manifest.json')
    if (!existsSync(sourceDatabase) || !existsSync(sourceManifest)) {
      console.warn('[ArchiveCatalog] Catálogo empacotado ausente; execute npm run catalog:prepare.')
      return
    }

    const targetRoot = join(app.getPath('userData'), 'game-catalog')
    const targetDatabase = join(targetRoot, 'archive-catalog.sqlite')
    const targetManifest = join(targetRoot, 'catalog-manifest.json')
    mkdirSync(targetRoot, { recursive: true })
    const bundledManifest = readManifest(sourceManifest)
    let installedManifest: CatalogManifest | null = null
    try {
      if (existsSync(targetManifest)) installedManifest = readManifest(targetManifest)
    } catch {
      installedManifest = null
    }

    if (
      !installedManifest ||
      Date.parse(bundledManifest.generatedAt) > Date.parse(installedManifest.generatedAt)
    ) {
      const temporaryDatabase = `${targetDatabase}.new`
      const temporaryManifest = `${targetManifest}.new`
      copyFileSync(sourceDatabase, temporaryDatabase)
      copyFileSync(sourceManifest, temporaryManifest)
      const verificationDatabase = new Database(temporaryDatabase, { readonly: true })
      const integrity = verificationDatabase.pragma('integrity_check', { simple: true })
      verificationDatabase.close()
      if (sha256(temporaryDatabase) !== bundledManifest.databaseSha256 || integrity !== 'ok') {
        rmSync(temporaryDatabase, { force: true })
        rmSync(temporaryManifest, { force: true })
        throw new Error('O catálogo empacotado falhou na verificação de integridade.')
      }
      this.database?.close()
      this.database = null
      rmSync(`${targetDatabase}.backup`, { force: true })
      if (existsSync(targetDatabase)) renameSync(targetDatabase, `${targetDatabase}.backup`)
      renameSync(temporaryDatabase, targetDatabase)
      renameSync(temporaryManifest, targetManifest)
    }

    this.manifest = readManifest(targetManifest)
    this.database = new Database(targetDatabase, { readonly: true, fileMustExist: true })
    this.database.pragma('query_only = ON')
    console.log(`[ArchiveCatalog] Catálogo ${this.manifest.catalogVersion} pronto.`)
  }

  listAssets(platform: string): LocalCatalogAsset[] {
    if (!this.database) throw new Error('O catálogo local ainda não foi preparado nesta versão do RIESCADE.')
    return this.database.prepare(`
      SELECT
        id, title, filename AS download_name, file_size,
        NULL AS sha256, install_mode, install_name, NULL AS romset_version
      FROM games
      WHERE platform_id = ?
      ORDER BY title COLLATE NOCASE
    `).all(platform.toLowerCase()) as LocalCatalogAsset[]
  }

  getPlatformInfo(platform: string): LocalPlatformInfo {
    if (!this.database) throw new Error('O catálogo local ainda não foi preparado nesta versão do RIESCADE.')
    const row = this.database.prepare(`
      SELECT
        platforms.torrent_url AS torrentUrl,
        platforms.game_count AS gameCount,
        COALESCE(SUM(games.file_size), 0) AS downloadBytes
      FROM platforms
      LEFT JOIN games ON games.platform_id = platforms.id
      WHERE platforms.id = ?
      GROUP BY platforms.id
    `).get(platform.toLowerCase()) as LocalPlatformInfo | undefined
    if (!row) throw new Error(`A plataforma ${platform.toUpperCase()} não existe no catálogo local.`)
    return row
  }

  close(): void {
    this.database?.close()
    this.database = null
  }
}

export const archiveCatalogService = new ArchiveCatalogService()
