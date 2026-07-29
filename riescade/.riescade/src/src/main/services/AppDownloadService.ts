import { createHash } from 'crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync, promises as fsPromises } from 'fs'
import { basename, join, parse } from 'path'
import { tmpdir } from 'os'
import extractZip from 'extract-zip'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { getRetroBatPath } from '../utils/paths'
import { SettingsParser } from '../parsers/SettingsParser'
import { SystemsParser } from '../parsers/SystemsParser'
import { archiveCatalogService } from './ArchiveCatalogService'

const API_BASE_URL = 'https://www.riescade.com.br'
const MEDIA_TYPES = [
  'cartdridge', 'cover', 'cover3d', 'coverback', 'fanart', 'logo',
  'manual', 'marquee', 'mix', 'screenshot', 'title', 'video'
] as const
const MEDIA_TYPE_SET = new Set<string>(MEDIA_TYPES)
const FULL_MEDIA_ARCHIVE_NAMES = new Set(['_media.zip', '_media.7z'])

function isFullMediaArchive(filename: unknown): boolean {
  return typeof filename === 'string' &&
    FULL_MEDIA_ARCHIVE_NAMES.has(basename(filename).toLowerCase())
}

function assertSafeZipEntry(entry: { fileName: string; externalFileAttributes: number }): void {
  const normalized = entry.fileName.replace(/\\/g, '/')
  const mode = (entry.externalFileAttributes >> 16) & 0xffff
  const isSymlink = (mode & 0xf000) === 0xa000
  if (
    !normalized
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[a-z]:\//i.test(normalized)
    || normalized.split('/').some(part => part === '..')
    || isSymlink
  ) {
    throw new Error('O pacote contém um caminho ou link inseguro e não pode ser instalado.')
  }
}

export interface AppCatalogAsset {
  id: string
  title: string
  download_name: string
  file_size: number | null
  sha256: string | null
  md5: string | null
  installed: boolean
  rom_path: string
  cover: string | null
  cover3d: string | null
  fanart: string | null
  logo: string | null
  install_mode: 'file' | 'extract'
  install_name: string
  romset_version: string | null
}

export interface PlatformDownloadInfo {
  platform: string
  gameCount: number
  totalGameCount: number
  installedGameCount: number
  downloadBytes: number
  installedBytes: number
  availableBytes: number
  tempAvailableBytes: number
  romsPath: string
  tempPath: string
  sameVolume: boolean
  hasEnoughSpace: boolean
  overwriteGames: boolean
  overwriteMedia: boolean
  downloadMethod: 'managed'
}

interface AuthorizedDownload {
  asset: {
    id: string
    platform: string
    title: string
    filename: string
    size: number | null
    sha256: string | null
    md5?: string | null
    install_mode?: 'file' | 'extract'
    install_name?: string
    romset_version?: string | null
  }
  downloadUrl: string
  expiresAt: string
}

function assertAccessToken(accessToken: unknown): string {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) {
    throw new Error('Sessão inválida. Entre novamente com sua conta.')
  }
  return accessToken
}

function getSafeRomFilename(filename: string, allowedExtensions: Set<string>, platform: string): string {
  const safeName = basename(filename).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
  const extension = safeName.slice(safeName.lastIndexOf('.')).toLowerCase()
  if (!safeName || !allowedExtensions.has(extension)) {
    throw new Error(`O servidor informou um formato de arquivo ${platform.toUpperCase()} não permitido.`)
  }
  return safeName
}

function assertAllowedDownloadUrl(value: string): URL {
  const url = new URL(value)
  const isArchiveHost = url.hostname === 'archive.org' || url.hostname.endsWith('.archive.org')
  const isGoogleDriveHost =
    url.hostname === 'drive.google.com' ||
    url.hostname === 'drive.usercontent.google.com'
  if (url.protocol !== 'https:' || (!isArchiveHost && !isGoogleDriveHost)) {
    throw new Error('O servidor informou uma origem de download não autorizada.')
  }
  return url
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  )
  const value = match?.[1] ?? match?.[2]
  return typeof value === 'string' ? decodeHtmlAttribute(value) : null
}

async function fetchAuthorizedDownload(
  downloadUrl: URL,
  signal: AbortSignal
): Promise<Response> {
  const response = await fetch(downloadUrl, {
    headers: { 'User-Agent': 'RIESCADE-App' },
    redirect: 'follow',
    signal
  })
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  if (!contentType.includes('text/html')) return response

  const htmlLength = Number(response.headers.get('content-length') || 0)
  if (htmlLength > 1024 * 1024) {
    throw new Error('O Google Drive retornou uma página de confirmação inválida.')
  }

  const html = await response.text()
  const formTag = html.match(/<form\b[^>]*>/i)?.[0]
  const action = formTag ? readHtmlAttribute(formTag, 'action') : null
  if (!action) {
    throw new Error('O Google Drive não liberou o arquivo para download.')
  }

  const confirmationUrl = assertAllowedDownloadUrl(action)
  const allowedInputs = new Set(['id', 'export', 'confirm', 'uuid'])
  for (const inputTag of html.match(/<input\b[^>]*>/gi) || []) {
    const name = readHtmlAttribute(inputTag, 'name')
    const value = readHtmlAttribute(inputTag, 'value')
    if (name && value !== null && allowedInputs.has(name)) {
      confirmationUrl.searchParams.set(name, value)
    }
  }

  if (
    !confirmationUrl.searchParams.get('id') ||
    !confirmationUrl.searchParams.get('confirm')
  ) {
    throw new Error('A confirmação do Google Drive está incompleta.')
  }

  const confirmedResponse = await fetch(confirmationUrl, {
    headers: { 'User-Agent': 'RIESCADE-App' },
    redirect: 'follow',
    signal
  })
  const confirmedType =
    confirmedResponse.headers.get('content-type')?.toLowerCase() || ''
  if (confirmedType.includes('text/html')) {
    throw new Error('O Google Drive não retornou o arquivo solicitado.')
  }
  return confirmedResponse
}

async function readApiError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : `Falha no serviço (${response.status})`
}

export class AppDownloadService {
  private readonly settings = new SettingsParser()
  private readonly systems = new SystemsParser()
  private readonly activeControllers = new Map<string, AbortController>()

  cancelDownload(id: string): boolean {
    const controller = this.activeControllers.get(id)
    if (controller) {
      controller.abort()
      this.activeControllers.delete(id)
      return true
    }
    return false
  }

  private getAllowedRomExtensions(platform: string): Set<string> {
    const system = this.systems.parse().find(item => item.name.toLowerCase() === platform.toLowerCase())
    const extensions = new Set(
      String(system?.extension || '')
        .split(/\s+/)
        .map(extension => extension.trim().toLowerCase())
        .filter(extension => extension.startsWith('.') && extension.length > 1)
    )
    if (extensions.size === 0) {
      throw new Error(`Nenhuma extensão de jogo foi configurada para ${platform}.`)
    }
    return extensions
  }

  async listCatalog(accessToken: unknown, platform: string): Promise<AppCatalogAsset[]> {
    const normalizedPlatform = platform.toLowerCase()
    const response = await fetch(
      `${API_BASE_URL}/api/app/catalog?platform=${encodeURIComponent(normalizedPlatform)}`,
      {
        headers: {
          Authorization: `Bearer ${assertAccessToken(accessToken)}`,
          'User-Agent': 'RIESCADE-App'
        },
        signal: AbortSignal.timeout(30_000)
      }
    )
    if (!response.ok) throw new Error(await readApiError(response))
    const payload = await response.json()
    if (!Array.isArray(payload?.assets)) {
      throw new Error('O catálogo retornado pelo servidor é inválido.')
    }
    const assets = payload.assets
    const romDirectory = join(getRetroBatPath(), 'roms', platform)
    const allowedExtensions = this.getAllowedRomExtensions(platform)
    const catalog: AppCatalogAsset[] = []

    for (const asset of assets) {
      if (isFullMediaArchive(asset?.download_name)) {
        continue
      }

      let filename: string
      try {
        const assetAllowedExtensions = asset?.install_mode === 'extract'
          ? new Set(['.zip'])
          : allowedExtensions
        filename = getSafeRomFilename(asset?.download_name, assetAllowedExtensions, platform)
      } catch {
        // The remote bucket/database may contain auxiliary files such as
        // gamelist.xml. They are not downloadable games and must not make the
        // entire platform catalog fail.
        console.warn(
          `[AppDownloadService] Ignoring incompatible ${platform.toUpperCase()} catalog entry: ${String(asset?.download_name || '(unnamed)')}`
        )
        continue
      }

      const mediaName = parse(filename).name
      const installMode = asset.install_mode === 'extract' ? 'extract' : 'file'
      const installName = typeof asset.install_name === 'string' && asset.install_name.trim()
        ? basename(asset.install_name)
        : mediaName
      const media = (folder: string) => {
        const path = join(romDirectory, 'media', folder, `${mediaName}.webp`)
        return existsSync(path) ? path : null
      }
      const romPath = installMode === 'extract'
        ? join(romDirectory, installName)
        : join(romDirectory, filename)
      catalog.push({
        ...asset,
        download_name: filename,
        installed: existsSync(romPath),
        rom_path: romPath,
        cover: media('cover'),
        cover3d: media('cover3d'),
        fanart: media('fanart'),
        logo: media('logo')
        ,
        install_mode: installMode,
        install_name: installName
      })
    }

    return catalog
  }

  async downloadBiosPack(
    accessToken: unknown,
    appVersion: string,
    window: BrowserWindow | null
  ): Promise<{ path: string; filename: string; sha256: string }> {
    const token = assertAccessToken(accessToken)
    const catalogResponse = await fetch(`${API_BASE_URL}/api/app/bios/catalog`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'RIESCADE-App'
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!catalogResponse.ok) {
      throw new Error(await readApiError(catalogResponse))
    }

    const catalog = await catalogResponse.json()
    const matches = Array.isArray(catalog?.assets)
      ? catalog.assets.filter((asset: any) => asset?.download_name === 'bios.zip')
      : []
    if (matches.length === 0) {
      throw new Error('O arquivo bios.zip não está disponível no catálogo.')
    }
    if (matches.length > 1) {
      throw new Error('Existem múltiplos arquivos bios.zip no catálogo.')
    }

    const catalogAsset = matches[0]
    if (typeof catalogAsset.id !== 'string' || !/^[a-f0-9]{64}$/i.test(catalogAsset.id)) {
      throw new Error('O catálogo informou um pack de BIOS inválido.')
    }

    const authorizationResponse = await fetch(
      `${API_BASE_URL}/api/app/bios/downloads/${encodeURIComponent(catalogAsset.id)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RIESCADE-App'
        },
        body: JSON.stringify({ clientVersion: appVersion }),
        signal: AbortSignal.timeout(15_000)
      }
    )
    if (!authorizationResponse.ok) {
      throw new Error(await readApiError(authorizationResponse))
    }

    const authorization = (await authorizationResponse.json()) as AuthorizedDownload
    if (
      authorization.asset?.platform !== 'bios' ||
      authorization.asset?.filename !== 'bios.zip'
    ) {
      throw new Error('O servidor autorizou um arquivo de BIOS inesperado.')
    }

    const downloadUrl = assertAllowedDownloadUrl(authorization.downloadUrl)
    const expectedSize = authorization.asset.size
    if (expectedSize !== null && !Number.isSafeInteger(expectedSize)) {
      throw new Error('O servidor informou um tamanho de arquivo inválido.')
    }

    const downloadId = authorization.asset.id
    const tempRoot = mkdtempSync(join(tmpdir(), `riescade-bios-${downloadId}-`))
    const archivePath = join(tempRoot, 'bios.zip')
    const extractionRoot = join(tempRoot, 'extracted')
    const biosDirectory = join(getRetroBatPath(), 'bios')
    const controller = new AbortController()
    this.activeControllers.set(downloadId, controller)

    try {
      mkdirSync(extractionRoot, { recursive: true })
      const response = await fetchAuthorizedDownload(
        downloadUrl,
        controller.signal
      )
      if (!response.ok || !response.body) {
        throw new Error(`Falha no download do pack de BIOS (${response.status}).`)
      }

      const contentLength = Number(response.headers.get('content-length') || 0)
      if (expectedSize !== null && contentLength > 0 && contentLength !== expectedSize) {
        throw new Error('O tamanho recebido não corresponde ao catálogo.')
      }

      const stream = createWriteStream(archivePath, { flags: 'wx' })
      const hash = createHash('sha256')
      let downloadedBytes = 0

      try {
        for await (const chunk of response.body as any) {
          const buffer = Buffer.from(chunk)
          downloadedBytes += buffer.length
          hash.update(buffer)
          if (!stream.write(buffer)) {
            await new Promise<void>(resolve => stream.once('drain', resolve))
          }

          const totalBytes = expectedSize || contentLength
          window?.webContents.send('app-download-progress', {
            id: downloadId,
            assetId: downloadId,
            platform: 'bios',
            title: 'Pack de BIOS RIESCADE',
            filename: 'bios.zip',
            downloadedBytes,
            totalBytes,
            percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
          })
        }

        stream.end()
        await new Promise<void>((resolve, reject) => {
          stream.once('finish', resolve)
          stream.once('error', reject)
        })
      } catch (error) {
        stream.destroy()
        throw error
      }

      if (expectedSize !== null && downloadedBytes !== expectedSize) {
        throw new Error('O pack de BIOS foi baixado de forma incompleta.')
      }

      window?.webContents.send('app-download-progress', {
        id: downloadId,
        assetId: downloadId,
        platform: 'bios',
        title: 'Pack de BIOS RIESCADE',
        filename: 'bios.zip',
        downloadedBytes,
        totalBytes: expectedSize || downloadedBytes,
        percent: 100,
        status: 'Extraindo BIOS...'
      })

      await extractZip(archivePath, {
        dir: extractionRoot,
        onEntry: assertSafeZipEntry
      })

      const entries = readdirSync(extractionRoot, { withFileTypes: true })
        .filter(entry => entry.name !== '__MACOSX')
      const sourceRoot =
        entries.length === 1 &&
        entries[0].isDirectory() &&
        entries[0].name.toLowerCase() === 'bios'
          ? join(extractionRoot, entries[0].name)
          : extractionRoot

      mkdirSync(biosDirectory, { recursive: true })
      await fsPromises.cp(sourceRoot, biosDirectory, {
        recursive: true,
        force: true
      })

      return {
        path: biosDirectory,
        filename: 'bios.zip',
        sha256: hash.digest('hex')
      }
    } finally {
      this.activeControllers.delete(downloadId)
      if (existsSync(tempRoot)) {
        rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    }
  }

  async openFullSystemTorrent(platform: string): Promise<void> {
    const { torrentUrl: value } = archiveCatalogService.getPlatformInfo(platform)
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('O torrent desta plataforma ainda não está disponível.')
    }
    const torrentUrl = assertAllowedDownloadUrl(value)
    await shell.openExternal(torrentUrl.toString())
  }

  async downloadAsset(
    accessToken: unknown,
    platform: unknown,
    assetId: unknown,
    appVersion: string,
    window: BrowserWindow | null,
    romsetFilename?: unknown,
    fullPlatformDownload = false
  ): Promise<{ path: string; filename: string; sha256: string }> {
    if (
      romsetFilename === undefined &&
      (typeof assetId !== 'string' || !/^[a-f0-9]{64}$/i.test(assetId))
    ) {
      throw new Error('Identificador de arquivo inválido.')
    }
    if (typeof platform !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(platform)) {
      throw new Error('Plataforma inválida.')
    }
    const normalizedPlatform = platform.toLowerCase()
    const isRomsetUpdate = romsetFilename !== undefined
    const safeRomsetFilename = isRomsetUpdate
      ? getSafeRomFilename(String(romsetFilename), new Set(['.zip']), normalizedPlatform)
      : null

    const authorizationResponse = await fetch(
      isRomsetUpdate
        ? `${API_BASE_URL}/api/app/romset-updates`
        : fullPlatformDownload
          ? `${API_BASE_URL}/api/app/platform-downloads/${encodeURIComponent(String(assetId))}`
          : `${API_BASE_URL}/api/app/downloads/${encodeURIComponent(String(assetId))}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${assertAccessToken(accessToken)}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RIESCADE-App'
        },
        body: JSON.stringify({
          clientVersion: appVersion,
          platform: normalizedPlatform,
          ...(safeRomsetFilename ? { filename: safeRomsetFilename } : {})
        }),
        signal: AbortSignal.timeout(15_000)
      }
    )

    if (!authorizationResponse.ok) {
      throw new Error(await readApiError(authorizationResponse))
    }

    const authorization = (await authorizationResponse.json()) as AuthorizedDownload
    const assetPlatform = authorization.asset?.platform
    if (!assetPlatform) {
      throw new Error('A autorização do servidor não informou a plataforma do arquivo.')
    }

    const downloadUrl = assertAllowedDownloadUrl(authorization.downloadUrl)
    const installMode = authorization.asset.install_mode === 'extract' ? 'extract' : 'file'
    const filename = getSafeRomFilename(
      authorization.asset.filename,
      installMode === 'extract'
        ? new Set(['.zip'])
        : this.getAllowedRomExtensions(assetPlatform),
      assetPlatform
    )
    const expectedSize = authorization.asset.size
    const expectedSha256 = authorization.asset.sha256?.toLowerCase() || null
    const expectedMd5 = authorization.asset.md5?.toLowerCase() || null
    const installName = basename(
      authorization.asset.install_name?.trim() || parse(filename).name
    ).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    if (!installName) throw new Error('O servidor informou uma pasta de instalação inválida.')

    if (expectedSize !== null && !Number.isSafeInteger(expectedSize)) {
      throw new Error('O servidor informou um tamanho de arquivo inválido.')
    }
    if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error('O servidor informou um hash SHA-256 inválido.')
    }
    if (expectedMd5 && !/^[a-f0-9]{32}$/.test(expectedMd5)) {
      throw new Error('O servidor informou um hash MD5 inválido.')
    }

    const romDirectory = join(getRetroBatPath(), 'roms', assetPlatform)
    mkdirSync(romDirectory, { recursive: true })
    const destinationPath = join(romDirectory, filename)
    const partialPath = `${destinationPath}.part`

    if (existsSync(partialPath)) unlinkSync(partialPath)

    const downloadId = authorization.asset.id
    const controller = new AbortController()
    this.activeControllers.set(downloadId, controller)

    try {
      const response = await fetchAuthorizedDownload(
        downloadUrl,
        controller.signal
      )
      if (!response.ok || !response.body) {
        throw new Error(`Falha no download (${response.status}).`)
      }

      const contentLength = Number(response.headers.get('content-length') || 0)
      if (expectedSize !== null && contentLength > 0 && contentLength !== expectedSize) {
        throw new Error('O tamanho recebido não corresponde ao catálogo.')
      }

      const hash = createHash('sha256')
      const md5Hash = createHash('md5')
      const stream = createWriteStream(partialPath, { flags: 'wx' })
      let downloadedBytes = 0

      try {
        for await (const chunk of response.body as any) {
          const buffer = Buffer.from(chunk)
          downloadedBytes += buffer.length
          hash.update(buffer)
          md5Hash.update(buffer)
          if (!stream.write(buffer)) {
            await new Promise<void>(resolve => stream.once('drain', resolve))
          }

          const totalBytes = expectedSize || contentLength
          window?.webContents.send('app-download-progress', {
            id: downloadId,
            assetId: downloadId,
            platform: assetPlatform,
            title: authorization.asset.title,
            filename,
            downloadedBytes,
            totalBytes,
            percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
          })
        }

        stream.end()
        await new Promise<void>((resolve, reject) => {
          stream.once('finish', resolve)
          stream.once('error', reject)
        })

        if (expectedSize !== null && downloadedBytes !== expectedSize) {
          throw new Error('O arquivo baixado está incompleto.')
        }

        const actualSha256 = hash.digest('hex')
        const actualMd5 = md5Hash.digest('hex')
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          throw new Error('A verificação de integridade SHA-256 falhou.')
        }
        if (expectedMd5 && actualMd5 !== expectedMd5) {
          throw new Error('A verificação de integridade MD5 do Google Drive falhou.')
        }

        if (installMode === 'extract') {
          const installedPath = await this.installExtractedGame(
            partialPath,
            romDirectory,
            installName,
            downloadId,
            assetPlatform,
            authorization.asset.title,
            window
          )
          return { path: installedPath, filename: installName, sha256: actualSha256 }
        }

        if (existsSync(destinationPath)) unlinkSync(destinationPath)
        renameSync(partialPath, destinationPath)
        return { path: destinationPath, filename, sha256: actualSha256 }
      } catch (error) {
        stream.destroy()
        if (existsSync(partialPath)) unlinkSync(partialPath)
        throw error
      }
    } finally {
      this.activeControllers.delete(downloadId)
    }
  }

  async downloadRomsetAsset(
    accessToken: unknown,
    platform: unknown,
    filename: unknown,
    appVersion: string,
    window: BrowserWindow | null
  ): Promise<{ path: string; filename: string; sha256: string }> {
    return this.downloadAsset(
      accessToken,
      platform,
      null,
      appVersion,
      window,
      filename
    )
  }

  async getRomsetUpdateInfo(accessToken: unknown, platform: unknown): Promise<{
    version: string
    supportsDownloads: boolean
    supportsFullPlatformDownload: boolean
  } | null> {
    if (typeof platform !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(platform)) {
      throw new Error('Plataforma inválida.')
    }
    const response = await fetch(
      `${API_BASE_URL}/api/app/catalog?platform=${encodeURIComponent(platform.toLowerCase())}`,
      {
        headers: {
          Authorization: `Bearer ${assertAccessToken(accessToken)}`,
          'User-Agent': 'RIESCADE-App'
        },
        signal: AbortSignal.timeout(15_000)
      }
    )
    if (!response.ok) throw new Error(await readApiError(response))
    const payload = await response.json()
    if (!payload?.supportsRomsetUpdate) return null
    if (typeof payload?.romsetVersion !== 'string' || !payload.romsetVersion.trim()) {
      throw new Error('O servidor não informou a versão do romset.')
    }
    return {
      version: payload.romsetVersion.trim(),
      supportsDownloads: payload.supportsRomsetDownloads === true,
      supportsFullPlatformDownload: payload.supportsFullPlatformDownload === true
    }
  }

  async listRomsetCatalog(
    accessToken: unknown,
    platform: unknown,
    search: unknown = '',
    offset: unknown = 0,
    limit: unknown = 500
  ): Promise<AppCatalogAsset[]> {
    if (typeof platform !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(platform)) {
      throw new Error('Plataforma inválida.')
    }
    const safeSearch = typeof search === 'string' ? search.slice(0, 128) : ''
    const safeOffset = Number.isSafeInteger(offset) ? Number(offset) : 0
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(1000, Math.max(1, Number(limit))) : 500
    const response = await fetch(
      `${API_BASE_URL}/api/app/romset-catalog?platform=${encodeURIComponent(platform.toLowerCase())}` +
      `&search=${encodeURIComponent(safeSearch)}&offset=${safeOffset}&limit=${safeLimit}`,
      {
        headers: {
          Authorization: `Bearer ${assertAccessToken(accessToken)}`,
          'User-Agent': 'RIESCADE-App'
        },
        signal: AbortSignal.timeout(30_000)
      }
    )
    if (!response.ok) throw new Error(await readApiError(response))
    const payload = await response.json()
    if (!Array.isArray(payload?.assets) || typeof payload?.version !== 'string') {
      throw new Error('O catálogo do romset retornado pelo servidor é inválido.')
    }

    const romDirectory = join(getRetroBatPath(), 'roms', platform)
    return payload.assets.flatMap((asset: any) => {
      try {
        if (isFullMediaArchive(asset?.download_name)) return []
        const filename = getSafeRomFilename(asset?.download_name, new Set(['.zip']), platform)
        if (typeof asset?.id !== 'string' || !/^[a-f0-9]{64}$/i.test(asset.id)) return []
        const mediaName = parse(filename).name
        const media = (folder: string) => {
          const path = join(romDirectory, 'media', folder, `${mediaName}.webp`)
          return existsSync(path) ? path : null
        }
        const romPath = join(romDirectory, filename)
        return [{
          id: asset.id,
          title: typeof asset.title === 'string' && asset.title.trim() ? asset.title : mediaName,
          download_name: filename,
          file_size: Number.isSafeInteger(asset.file_size) ? asset.file_size : null,
          sha256: null,
          md5: typeof asset.md5 === 'string' && /^[a-f0-9]{32}$/i.test(asset.md5)
            ? asset.md5.toLowerCase()
            : null,
          installed: existsSync(romPath),
          rom_path: romPath,
          cover: media('cover'),
          cover3d: media('cover3d'),
          fanart: media('fanart'),
          logo: media('logo'),
          install_mode: 'file' as const,
          install_name: mediaName,
          romset_version: payload.version
        }]
      } catch {
        return []
      }
    })
  }

  private async installExtractedGame(
    archivePath: string,
    romDirectory: string,
    installName: string,
    downloadId: string,
    platform: string,
    title: string,
    window: BrowserWindow | null
  ): Promise<string> {
    const extractionRoot = mkdtempSync(join(tmpdir(), `riescade-game-${downloadId}-`))
    const destinationPath = join(romDirectory, installName)
    let destinationWasPrepared = false

    try {
      window?.webContents.send('app-download-progress', {
        id: downloadId,
        assetId: downloadId,
        platform,
        title,
        filename: basename(archivePath),
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 100,
        status: 'Extraindo arquivos do jogo...'
      })
      await extractZip(archivePath, {
        dir: extractionRoot,
        onEntry: assertSafeZipEntry
      })

      const entries = readdirSync(extractionRoot, { withFileTypes: true })
        .filter(entry => entry.name !== '__MACOSX')
      const sourceRoot = entries.length === 1
        && entries[0].isDirectory()
        && entries[0].name.toLowerCase() === installName.toLowerCase()
        ? join(extractionRoot, entries[0].name)
        : extractionRoot

      const overwrite = this.settings.getSetting('Downloads.Games.Overwrite', 'bool') === true
        || this.settings.getSetting('Downloads.OverwriteExisting', 'bool') === true
      if (existsSync(destinationPath)) {
        if (!overwrite) {
          throw new Error(`A pasta do jogo ${installName} já existe. Ative a substituição de jogos para reinstalar.`)
        }
        rmSync(destinationPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }

      destinationWasPrepared = true
      await fsPromises.cp(sourceRoot, destinationPath, {
        recursive: true,
        force: false,
        errorOnExist: true
      })
      unlinkSync(archivePath)
      return destinationPath
    } catch (error) {
      if (destinationWasPrepared && existsSync(destinationPath)) {
        rmSync(destinationPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
      if (existsSync(archivePath)) unlinkSync(archivePath)
      throw error
    } finally {
      if (existsSync(extractionRoot)) {
        rmSync(extractionRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    }
  }

  async getPlatformDownloadInfo(
    accessToken: unknown,
    platform: string
  ): Promise<PlatformDownloadInfo> {
    if (!/^[a-z0-9_-]{1,64}$/i.test(platform)) {
      throw new Error('Plataforma inválida.')
    }
    const normalizedPlatform = platform.toLowerCase()
    const romsRoot = join(getRetroBatPath(), 'roms')
    mkdirSync(romsRoot, { recursive: true })
    const romsPlatformDir = join(romsRoot, normalizedPlatform)

    const tempRoot = tmpdir()
    mkdirSync(tempRoot, { recursive: true })

    let availableBytes = 0
    try {
      const stats = await fsPromises.statfs(romsRoot)
      availableBytes = Number(stats.bavail) * Number(stats.bsize)
    } catch {
      availableBytes = 100 * 1024 * 1024 * 1024
    }

    let tempAvailableBytes = 0
    try {
      const stats = await fsPromises.statfs(tempRoot)
      tempAvailableBytes = Number(stats.bavail) * Number(stats.bsize)
    } catch {
      tempAvailableBytes = availableBytes
    }

    const romsDrive = parse(romsRoot).root.toLowerCase()
    const tempDrive = parse(tempRoot).root.toLowerCase()
    const sameVolume = romsDrive === tempDrive

    const catalog = await this.listCatalog(accessToken, normalizedPlatform)
    const overwriteGames =
      this.settings.getSetting('Downloads.Games.Overwrite', 'bool') === true ||
      this.settings.getSetting('Downloads.OverwriteExisting', 'bool') === true
    const pendingAssets = overwriteGames
      ? catalog
      : catalog.filter(asset => !asset.installed)
    const gameCount = pendingAssets.length
    const totalGameCount = catalog.length
    const installedGameCount = catalog.filter(asset => asset.installed).length
    const downloadBytes = pendingAssets.reduce(
      (total, asset) => total + (asset.file_size || 0),
      0
    )
    const installedBytes = pendingAssets.reduce(
      (total, asset) =>
        total +
        Math.round(
          (asset.file_size || 0) * (asset.install_mode === 'extract' ? 1.5 : 1)
        ),
      0
    )

    const requiredPeak = sameVolume ? downloadBytes + installedBytes : installedBytes
    const hasEnoughSpace = sameVolume
      ? availableBytes >= requiredPeak
      : (tempAvailableBytes >= downloadBytes && availableBytes >= installedBytes)

    const overwriteMedia = this.settings.getSetting('Downloads.Media.Overwrite', 'bool') === true

    return {
      platform: normalizedPlatform,
      gameCount,
      totalGameCount,
      installedGameCount,
      downloadBytes,
      installedBytes,
      availableBytes,
      tempAvailableBytes,
      romsPath: romsPlatformDir,
      tempPath: tempRoot,
      sameVolume,
      hasEnoughSpace,
      overwriteGames,
      overwriteMedia,
      downloadMethod: 'managed'
    }
  }

  async downloadPlatform(
    accessToken: unknown,
    platform: string,
    appVersion: string,
    window: BrowserWindow | null
  ): Promise<{ downloaded: number; failed: number; skipped: number }> {
    const normalizedPlatform = platform.toLowerCase()
    const info = await this.getPlatformDownloadInfo(accessToken, normalizedPlatform)
    if (!info.hasEnoughSpace) {
      throw new Error('Espaço em disco insuficiente para realizar o download da plataforma.')
    }

    const catalog = await this.listCatalog(accessToken, normalizedPlatform)
    const pendingAssets = info.overwriteGames
      ? catalog
      : catalog.filter(asset => !asset.installed)
    const skipped = catalog.length - pendingAssets.length
    let downloaded = 0
    let failed = 0

    for (const asset of pendingAssets) {
      try {
        await this.downloadAsset(
          accessToken,
          normalizedPlatform,
          asset.id,
          appVersion,
          window,
          undefined,
          true
        )
        downloaded += 1
      } catch (error: any) {
        if (error?.name === 'AbortError' || /abort|cancel/i.test(String(error?.message || ''))) {
          throw new Error('Download da plataforma cancelado.')
        }
        failed += 1
        console.error(
          `[AppDownloadService] Failed to download ${normalizedPlatform}/${asset.download_name}:`,
          error
        )
      }

      window?.webContents.send('app-download-progress', {
        id: `platform-${normalizedPlatform}`,
        assetId: `platform-${normalizedPlatform}`,
        platform: normalizedPlatform,
        title: `Plataforma ${normalizedPlatform.toUpperCase()}`,
        filename: asset.download_name,
        downloadedBytes: 0,
        totalBytes: 0,
        percent:
          pendingAssets.length > 0
            ? Math.round(((downloaded + failed) / pendingAssets.length) * 100)
            : 100,
        status: `${downloaded + failed} de ${pendingAssets.length} jogos processados`
      })
    }

    return { downloaded, failed, skipped }
  }

  async downloadPlatformMedia(
    accessToken: string,
    platform: string,
    window: BrowserWindow | null,
    appVersion = 'unknown'
  ): Promise<void> {
    if (!/^[a-z0-9_-]{1,64}$/i.test(platform)) {
      throw new Error('Plataforma inválida.')
    }
    const normalizedPlatform = platform.toLowerCase()
    const authorizationResponse = await fetch(`${API_BASE_URL}/api/app/media/downloads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${assertAccessToken(accessToken)}`,
        'Content-Type': 'application/json',
        'User-Agent': 'RIESCADE-App'
      },
      body: JSON.stringify({
        platform: normalizedPlatform,
        clientVersion: appVersion
      }),
      signal: AbortSignal.timeout(15_000)
    })
    if (!authorizationResponse.ok) {
      throw new Error(await readApiError(authorizationResponse))
    }

    const authorization = (await authorizationResponse.json()) as AuthorizedDownload
    if (
      authorization.asset?.platform !== normalizedPlatform ||
      authorization.asset?.filename.toLowerCase() !== '_media.zip'
    ) {
      throw new Error('O servidor autorizou um pacote de mídias inesperado.')
    }
    const mediaUrl = assertAllowedDownloadUrl(authorization.downloadUrl)
    const expectedSize = authorization.asset.size
    if (expectedSize !== null && !Number.isSafeInteger(expectedSize)) {
      throw new Error('O servidor informou um tamanho de arquivo inválido.')
    }

    const tempDir = join(tmpdir(), 'riescade-downloads')
    mkdirSync(tempDir, { recursive: true })
    const zipPath = join(tempDir, `${normalizedPlatform}_media.zip`)
    const extractDir = join(tempDir, `${normalizedPlatform}_media_extract`)
    if (existsSync(extractDir)) {
      rmSync(extractDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    mkdirSync(extractDir, { recursive: true })

    const downloadId = authorization.asset.id
    const controller = new AbortController()
    this.activeControllers.set(downloadId, controller)

    const sendProgress = (percent: number, status: string, downloadedBytes = 0, totalBytes = 0) => {
      window?.webContents.send('app-download-progress', {
        id: downloadId,
        assetId: downloadId,
        platform: normalizedPlatform,
        title: `Mídias ${normalizedPlatform.toUpperCase()}`,
        filename: '_media.zip',
        downloadedBytes,
        totalBytes,
        percent,
        status
      })
    }

    sendProgress(0, 'Iniciando download das mídias...')

    try {
      const response = await fetchAuthorizedDownload(
        mediaUrl,
        controller.signal
      )

      if (!response.ok) {
        throw new Error(`Falha no download das mídias de ${normalizedPlatform.toUpperCase()} (${response.status}).`)
      }

      const contentLength = Number(response.headers.get('content-length') || 0)
      if (expectedSize !== null && contentLength > 0 && contentLength !== expectedSize) {
        throw new Error('O tamanho recebido não corresponde ao catálogo.')
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Falha ao obter stream do servidor.')

      const fileStream = createWriteStream(zipPath)
      let downloadedBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fileStream.write(value)
        downloadedBytes += value.length
        const percent = contentLength > 0 ? Math.round((downloadedBytes / contentLength) * 100) : 0
        sendProgress(percent, 'Baixando mídias...', downloadedBytes, contentLength)
      }

      fileStream.end()
      await new Promise<void>((resolve, reject) => {
        fileStream.once('finish', resolve)
        fileStream.once('error', reject)
      })

      sendProgress(100, 'Extraindo pacote de mídias...')

      await extractZip(zipPath, {
        dir: extractDir,
        onEntry: assertSafeZipEntry
      })
      if (expectedSize !== null && downloadedBytes !== expectedSize) {
        throw new Error('O pacote de mídias foi baixado de forma incompleta.')
      }

      sendProgress(100, 'Organizando mídias na biblioteca...')

      const romsPlatformDir = join(getRetroBatPath(), 'roms', normalizedPlatform)
      const mediaDestinationDir = join(romsPlatformDir, 'media')
      mkdirSync(mediaDestinationDir, { recursive: true })

      const overwriteMedia = this.settings.getSetting('Downloads.Media.Overwrite', 'bool') === true

      // Supported archive layouts:
      //   media/cover/...        platform/media/cover/...        cover/...
      // The destination must always retain the platform's `media` directory.
      let realSrcDir = extractDir
      for (let depth = 0; depth < 3; depth += 1) {
        const entries = readdirSync(realSrcDir, { withFileTypes: true })
        const mediaEntry = entries.find(entry =>
          entry.isDirectory() && entry.name.toLowerCase() === 'media'
        )
        if (mediaEntry) {
          realSrcDir = join(realSrcDir, mediaEntry.name)
          break
        }

        const containsMediaTypes = entries.some(entry =>
          entry.isDirectory() && MEDIA_TYPE_SET.has(entry.name.toLowerCase())
        )
        if (containsMediaTypes) break

        if (entries.length !== 1 || !entries[0].isDirectory()) break
        realSrcDir = join(realSrcDir, entries[0].name)
      }

      const moveMediaRecursive = (srcDir: string, destDir: string) => {
        mkdirSync(destDir, { recursive: true })
        const entries = readdirSync(srcDir, { withFileTypes: true })
        for (const entry of entries) {
          const srcPath = join(srcDir, entry.name)
          const destPath = join(destDir, entry.name)
          if (entry.isDirectory()) {
            moveMediaRecursive(srcPath, destPath)
            try {
              if (existsSync(srcPath) && readdirSync(srcPath).length === 0) {
                rmSync(srcPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
              }
            } catch {}
          } else {
            if (existsSync(destPath) && !overwriteMedia) {
              try { unlinkSync(srcPath) } catch {}
              continue
            }
            if (existsSync(destPath)) {
              try { unlinkSync(destPath) } catch {}
            }
            try {
              renameSync(srcPath, destPath)
            } catch {
              copyFileSync(srcPath, destPath)
              try { unlinkSync(srcPath) } catch {}
            }
          }
        }
      }

      moveMediaRecursive(realSrcDir, mediaDestinationDir)

      try {
        rmSync(zipPath, { force: true })
        rmSync(extractDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      } catch (e) {
        console.warn('[AppDownloadService] Media extract cleanup warning:', e)
      }

      sendProgress(100, 'Mídias instaladas com sucesso!')
    } catch (err: any) {
      try {
        if (existsSync(zipPath)) unlinkSync(zipPath)
        if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true })
      } catch {}
      throw err
    } finally {
      this.activeControllers.delete(downloadId)
    }
  }
}

export function registerAppDownloadIpc(
  getMainWindow: () => BrowserWindow | null,
  appVersion: string,
  getAccessToken: () => string
): void {
  const service = new AppDownloadService()

  ipcMain.handle('app-list-download-catalog', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.listCatalog(getAccessToken(), platform)
  })

  ipcMain.handle('app-download-asset', (_event, platform: unknown, assetId: unknown) =>
    service.downloadAsset(getAccessToken(), platform, assetId, appVersion, getMainWindow())
  )
  ipcMain.handle('app-download-bios-pack', () =>
    service.downloadBiosPack(getAccessToken(), appVersion, getMainWindow())
  )
  ipcMain.handle('app-download-romset-asset', (_event, platform: unknown, filename: unknown) =>
    service.downloadRomsetAsset(getAccessToken(), platform, filename, appVersion, getMainWindow())
  )
  ipcMain.handle('app-get-romset-update-info', (_event, platform: unknown) =>
    service.getRomsetUpdateInfo(getAccessToken(), platform)
  )
  ipcMain.handle(
    'app-list-romset-catalog',
    (_event, platform: unknown, search: unknown, offset: unknown, limit: unknown) =>
      service.listRomsetCatalog(getAccessToken(), platform, search, offset, limit)
  )

  ipcMain.handle('app-open-system-torrent', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.openFullSystemTorrent(platform)
  })

  ipcMain.handle('app-get-platform-download-info', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.getPlatformDownloadInfo(getAccessToken(), platform)
  })

  ipcMain.handle('app-download-platform', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.downloadPlatform(getAccessToken(), platform, appVersion, getMainWindow())
  })

  ipcMain.handle('app-download-platform-media', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.downloadPlatformMedia(getAccessToken(), platform, getMainWindow(), appVersion)
  })

  ipcMain.handle('app-cancel-download', (_event, id: unknown) => {
    if (typeof id !== 'string') return false
    return service.cancelDownload(id)
  })
}
