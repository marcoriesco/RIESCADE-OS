import { createHash } from 'crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync, promises as fsPromises } from 'fs'
import { basename, join, parse } from 'path'
import { tmpdir } from 'os'
import extractZip from 'extract-zip'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { getRetroBatPath } from '../utils/paths'
import { SettingsParser } from '../parsers/SettingsParser'
import { SystemsParser } from '../parsers/SystemsParser'

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
  installed: boolean
  rom_path: string
  cover: string | null
  cover3d: string | null
  fanart: string | null
  logo: string | null
  install_mode: 'file' | 'extract'
  install_name: string
}

export interface PlatformDownloadInfo {
  platform: string
  gameCount: number
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
  downloadMethod: 'managed' | 'torrent-external' | 'direct'
  torrentUrl?: string
}

interface AuthorizedDownload {
  asset: {
    id: string
    platform: string
    title: string
    filename: string
    size: number | null
    sha256: string | null
    install_mode?: 'file' | 'extract'
    install_name?: string
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
  if (url.protocol !== 'https:' || !isArchiveHost) {
    throw new Error('O servidor informou uma origem de download não autorizada.')
  }
  return url
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

  async listCatalog(platform: string): Promise<AppCatalogAsset[]> {
    const normalizedPlatform = platform.toLowerCase()
    const response = await fetch(`${API_BASE_URL}/api/app/catalog?platform=${encodeURIComponent(normalizedPlatform)}`, {
      headers: {
        'User-Agent': 'RIESCADE-App'
      },
      signal: AbortSignal.timeout(15_000)
    })

    if (!response.ok) throw new Error(await readApiError(response))
    const payload = await response.json()
    const responsePlatform = payload?.platform
    if (
      (
        responsePlatform !== undefined
        && (
          typeof responsePlatform !== 'string'
          || responsePlatform.toLowerCase() !== normalizedPlatform
        )
      )
      || !Array.isArray(payload?.assets)
    ) {
      throw new Error(`O catálogo ${platform.toUpperCase()} retornado pelo servidor é inválido.`)
    }
    const romDirectory = join(getRetroBatPath(), 'roms', platform)
    const allowedExtensions = this.getAllowedRomExtensions(platform)
    const catalog: AppCatalogAsset[] = []

    for (const asset of payload.assets as Array<Omit<AppCatalogAsset, 'installed' | 'rom_path' | 'cover' | 'cover3d' | 'fanart' | 'logo'>>) {
      if (isFullMediaArchive(asset?.download_name)) {
        continue
      }

      let filename: string
      try {
        filename = getSafeRomFilename(asset?.download_name, allowedExtensions, platform)
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

  async openFullSystemTorrent(platform: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/app/catalog?platform=${encodeURIComponent(platform)}`, {
      headers: { 'User-Agent': 'RIESCADE-App' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(await readApiError(response))
    const payload = await response.json()
    if (typeof payload?.torrentUrl !== 'string' || !payload.torrentUrl.trim()) {
      throw new Error('O torrent desta plataforma ainda não está disponível.')
    }
    const torrentUrl = assertAllowedDownloadUrl(payload.torrentUrl)
    await shell.openExternal(torrentUrl.toString())
  }

  async downloadAsset(
    accessToken: unknown,
    platform: unknown,
    assetId: unknown,
    appVersion: string,
    window: BrowserWindow | null
  ): Promise<{ path: string; filename: string; sha256: string }> {
    if (typeof assetId !== 'string' || !/^[a-f0-9]{64}$/i.test(assetId)) {
      throw new Error('Identificador de arquivo inválido.')
    }
    if (typeof platform !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(platform)) {
      throw new Error('Plataforma inválida.')
    }
    const normalizedPlatform = platform.toLowerCase()

    const authorizationResponse = await fetch(
      `${API_BASE_URL}/api/app/downloads/${encodeURIComponent(assetId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${assertAccessToken(accessToken)}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RIESCADE-App'
        },
        body: JSON.stringify({
          clientVersion: appVersion,
          platform: normalizedPlatform
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
    const filename = getSafeRomFilename(
      authorization.asset.filename,
      this.getAllowedRomExtensions(assetPlatform),
      assetPlatform
    )
    const expectedSize = authorization.asset.size
    const expectedSha256 = authorization.asset.sha256?.toLowerCase() || null
    const installMode = authorization.asset.install_mode === 'extract' ? 'extract' : 'file'
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

    const romDirectory = join(getRetroBatPath(), 'roms', assetPlatform)
    mkdirSync(romDirectory, { recursive: true })
    const destinationPath = join(romDirectory, filename)
    const partialPath = `${destinationPath}.part`

    if (existsSync(partialPath)) unlinkSync(partialPath)

    const downloadId = String(assetId)
    const controller = new AbortController()
    this.activeControllers.set(downloadId, controller)

    try {
      const response = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'RIESCADE-App' },
        signal: controller.signal
      })
      if (!response.ok || !response.body) {
        throw new Error(`Falha no download (${response.status}).`)
      }

      const contentLength = Number(response.headers.get('content-length') || 0)
      if (expectedSize !== null && contentLength > 0 && contentLength !== expectedSize) {
        throw new Error('O tamanho recebido não corresponde ao catálogo.')
      }

      const hash = createHash('sha256')
      const stream = createWriteStream(partialPath, { flags: 'wx' })
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
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          throw new Error('A verificação de integridade SHA-256 falhou.')
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

  async getPlatformDownloadInfo(platform: string): Promise<PlatformDownloadInfo> {
    const romsRoot = join(getRetroBatPath(), 'roms')
    mkdirSync(romsRoot, { recursive: true })
    const romsPlatformDir = join(romsRoot, platform)

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

    let gameCount = 0
    let downloadBytes = 0
    let installedBytes = 0
    let torrentUrl: string | undefined = undefined
    let downloadMethod: 'managed' | 'torrent-external' | 'direct' = 'torrent-external'

    try {
      const response = await fetch(`${API_BASE_URL}/api/app/catalog?platform=${encodeURIComponent(platform)}`, {
        headers: { 'User-Agent': 'RIESCADE-App' },
        signal: AbortSignal.timeout(15_000)
      })
      if (response.ok) {
        const payload = await response.json()
        if (Array.isArray(payload?.assets)) {
          const gameAssets = payload.assets.filter((asset: any) =>
            !isFullMediaArchive(asset?.download_name)
          )
          gameCount = gameAssets.length
          downloadBytes = payload.downloadBytes || gameAssets.reduce((sum: number, a: any) => sum + (a.file_size || 0), 0) || 128 * 1024 * 1024
          installedBytes = payload.installedBytes || Math.round(downloadBytes * 1.25)
        }
        if (typeof payload?.torrentUrl === 'string' && payload.torrentUrl.trim()) {
          torrentUrl = payload.torrentUrl
          downloadMethod = 'torrent-external'
        }
      }
    } catch (err) {
      console.warn(`[AppDownloadService] Failed to fetch catalog info for disk space check (${platform}):`, err)
    }

    if (gameCount === 0) gameCount = 780
    if (downloadBytes === 0) downloadBytes = 1.2 * 1024 * 1024 * 1024
    if (installedBytes === 0) installedBytes = 1.5 * 1024 * 1024 * 1024

    const requiredPeak = sameVolume ? downloadBytes + installedBytes : installedBytes
    const hasEnoughSpace = sameVolume
      ? availableBytes >= requiredPeak
      : (tempAvailableBytes >= downloadBytes && availableBytes >= installedBytes)

    const overwriteGames = this.settings.getSetting('Downloads.Games.Overwrite', 'bool') === true ||
                           this.settings.getSetting('Downloads.OverwriteExisting', 'bool') === true
    const overwriteMedia = this.settings.getSetting('Downloads.Media.Overwrite', 'bool') === true

    return {
      platform,
      gameCount,
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
      downloadMethod,
      torrentUrl
    }
  }

  async downloadPlatform(platform: string): Promise<void> {
    const info = await this.getPlatformDownloadInfo(platform)
    if (!info.hasEnoughSpace) {
      throw new Error('Espaço em disco insuficiente para realizar o download da plataforma.')
    }
    if (info.downloadMethod === 'torrent-external') {
      return this.openFullSystemTorrent(platform)
    }
  }

  async downloadPlatformMedia(
    _accessToken: string,
    platform: string,
    window: BrowserWindow | null
  ): Promise<void> {
    const mediaUrl = `https://archive.org/download/riescade-roms-${platform}/_media.zip`

    const tempDir = join(tmpdir(), 'riescade-downloads')
    mkdirSync(tempDir, { recursive: true })
    const zipPath = join(tempDir, `${platform}_media.zip`)
    const extractDir = join(tempDir, `${platform}_media_extract`)
    if (existsSync(extractDir)) {
      rmSync(extractDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    mkdirSync(extractDir, { recursive: true })

    const downloadId = `media-${platform}`
    const controller = new AbortController()
    this.activeControllers.set(downloadId, controller)

    const sendProgress = (percent: number, status: string, downloadedBytes = 0, totalBytes = 0) => {
      window?.webContents.send('app-download-progress', {
        id: downloadId,
        assetId: downloadId,
        platform,
        title: `Mídias ${platform.toUpperCase()}`,
        downloadedBytes,
        totalBytes,
        percent,
        status
      })
    }

    sendProgress(0, 'Iniciando download das mídias...')

    try {
      const response = await fetch(mediaUrl, {
        headers: { 'User-Agent': 'RIESCADE-App' },
        redirect: 'follow',
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`O arquivo de mídias da plataforma ${platform.toUpperCase()} (_media.zip) ainda não está disponível no servidor.`)
      }

      const contentLength = Number(response.headers.get('content-length') || 0)
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

      sendProgress(100, 'Organizando mídias na biblioteca...')

      const romsPlatformDir = join(getRetroBatPath(), 'roms', platform)
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
    return service.listCatalog(platform)
  })

  ipcMain.handle('app-download-asset', (_event, platform: unknown, assetId: unknown) =>
    service.downloadAsset(getAccessToken(), platform, assetId, appVersion, getMainWindow())
  )

  ipcMain.handle('app-open-system-torrent', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.openFullSystemTorrent(platform)
  })

  ipcMain.handle('app-get-platform-download-info', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.getPlatformDownloadInfo(platform)
  })

  ipcMain.handle('app-download-platform', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.downloadPlatform(platform)
  })

  ipcMain.handle('app-download-platform-media', (_event, platform: unknown) => {
    if (typeof platform !== 'string') throw new Error('Plataforma inválida.')
    return service.downloadPlatformMedia(getAccessToken(), platform, getMainWindow())
  })

  ipcMain.handle('app-cancel-download', (_event, id: unknown) => {
    if (typeof id !== 'string') return false
    return service.cancelDownload(id)
  })
}
