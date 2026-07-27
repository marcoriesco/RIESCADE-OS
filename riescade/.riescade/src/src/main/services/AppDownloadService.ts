import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { basename, join, parse } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { getRetroBatPath } from '../utils/paths'
import { SettingsParser } from '../parsers/SettingsParser'

const API_BASE_URL = 'https://www.riescade.com.br'
const PILOT_PLATFORM = 'snes'
const MAX_SNES_DOWNLOAD_SIZE = 128 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.zip', '.sfc', '.smc'])
const MEDIA_TYPES = [
  'cartdridge', 'cover', 'cover3d', 'coverback', 'fanart', 'logo',
  'manual', 'marquee', 'mix', 'screenshot', 'title', 'video'
] as const
const MEDIA_TYPE_SET = new Set<string>(MEDIA_TYPES)
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.webp', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mkv', '.avi', '.pdf'
])
const MAX_MEDIA_DOWNLOAD_SIZE = 512 * 1024 * 1024

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
}

interface AuthorizedDownload {
  asset: {
    id: string
    platform: string
    title: string
    filename: string
    size: number | null
    sha256: string | null
  }
  downloadUrl: string
  expiresAt: string
  media?: Array<{
    type: string
    filename: string
    size: number | null
    downloadUrl: string
  }>
}

function assertAccessToken(accessToken: unknown): string {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) {
    throw new Error('Sessão inválida. Entre novamente com sua conta.')
  }
  return accessToken
}

function getSafeSnesFilename(filename: string): string {
  const safeName = basename(filename).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
  const extension = safeName.slice(safeName.lastIndexOf('.')).toLowerCase()
  if (!safeName || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('O servidor informou um formato de arquivo SNES não permitido.')
  }
  return safeName
}

function getSafeMediaFilename(filename: string): string {
  const safeName = basename(filename).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
  const extension = safeName.slice(safeName.lastIndexOf('.')).toLowerCase()
  if (!safeName || !ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
    throw new Error('O servidor informou um formato de mídia não permitido.')
  }
  return safeName
}

function assertAllowedDownloadUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.backblazeb2.com')) {
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

  private getMediaPreferences(): { mediaTypes: string[]; overwrite: boolean } {
    const enabled = this.settings.getSetting('Downloads.Media.Enabled', 'bool')
    const mediaTypes = enabled === false
      ? []
      : MEDIA_TYPES.filter(type =>
          this.settings.getSetting(`Downloads.Media.Types.${type}`, 'bool') !== false
        )
    return {
      mediaTypes,
      overwrite: this.settings.getSetting('Downloads.Media.Overwrite', 'bool') === true
    }
  }

  async listCatalog(platform: string): Promise<AppCatalogAsset[]> {
    if (platform !== PILOT_PLATFORM) {
      throw new Error(`A plataforma ${platform} ainda não está disponível para download.`)
    }
    const response = await fetch(`${API_BASE_URL}/api/app/catalog`, {
      headers: {
        'User-Agent': 'RIESCADE-App'
      },
      signal: AbortSignal.timeout(15_000)
    })

    if (!response.ok) throw new Error(await readApiError(response))
    const payload = await response.json()
    if (payload?.platform !== PILOT_PLATFORM || !Array.isArray(payload?.assets)) {
      throw new Error('O catálogo SNES retornado pelo servidor é inválido.')
    }
    const romDirectory = join(getRetroBatPath(), 'roms', PILOT_PLATFORM)
    return payload.assets.map((asset: Omit<AppCatalogAsset, 'installed' | 'rom_path' | 'cover' | 'cover3d' | 'fanart' | 'logo'>) => {
      const filename = getSafeSnesFilename(asset.download_name)
      const mediaName = parse(filename).name
      const media = (folder: string) => {
        const path = join(romDirectory, 'media', folder, `${mediaName}.webp`)
        return existsSync(path) ? path : null
      }
      const romPath = join(romDirectory, filename)
      return {
        ...asset,
        installed: existsSync(romPath),
        rom_path: romPath,
        cover: media('cover'),
        cover3d: media('cover3d'),
        fanart: media('fanart'),
        logo: media('logo')
      }
    })
  }

  async downloadAsset(
    accessToken: unknown,
    assetId: unknown,
    appVersion: string,
    window: BrowserWindow | null
  ): Promise<{ path: string; filename: string; sha256: string }> {
    if (typeof assetId !== 'string' || !/^[a-f0-9-]{36}$/i.test(assetId)) {
      throw new Error('Arquivo SNES inválido.')
    }

    const mediaPreferences = this.getMediaPreferences()
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
          mediaTypes: mediaPreferences.mediaTypes
        }),
        signal: AbortSignal.timeout(15_000)
      }
    )

    if (!authorizationResponse.ok) {
      throw new Error(await readApiError(authorizationResponse))
    }

    const authorization = (await authorizationResponse.json()) as AuthorizedDownload
    if (authorization.asset?.platform !== PILOT_PLATFORM) {
      throw new Error('A autorização não corresponde à plataforma SNES.')
    }

    const downloadUrl = assertAllowedDownloadUrl(authorization.downloadUrl)
    const filename = getSafeSnesFilename(authorization.asset.filename)
    const expectedSize = authorization.asset.size
    const expectedSha256 = authorization.asset.sha256?.toLowerCase() || null

    if (expectedSize !== null && (!Number.isSafeInteger(expectedSize) || expectedSize > MAX_SNES_DOWNLOAD_SIZE)) {
      throw new Error('O arquivo SNES excede o tamanho permitido para o piloto.')
    }
    if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error('O servidor informou um hash SHA-256 inválido.')
    }

    const romDirectory = join(getRetroBatPath(), 'roms', PILOT_PLATFORM)
    mkdirSync(romDirectory, { recursive: true })
    const destinationPath = join(romDirectory, filename)
    const partialPath = `${destinationPath}.part`

    if (existsSync(partialPath)) unlinkSync(partialPath)

    const response = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'RIESCADE-App' },
      signal: AbortSignal.timeout(30 * 60_000)
    })
    if (!response.ok || !response.body) {
      throw new Error(`Falha no download SNES (${response.status}).`)
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (
      contentLength > MAX_SNES_DOWNLOAD_SIZE ||
      (expectedSize !== null && contentLength > 0 && contentLength !== expectedSize)
    ) {
      throw new Error('O tamanho recebido não corresponde ao catálogo.')
    }

    const hash = createHash('sha256')
    const stream = createWriteStream(partialPath, { flags: 'wx' })
    let downloadedBytes = 0

    try {
      for await (const chunk of response.body as any) {
        const buffer = Buffer.from(chunk)
        downloadedBytes += buffer.length
        if (downloadedBytes > MAX_SNES_DOWNLOAD_SIZE) {
          throw new Error('O arquivo excedeu o limite durante o download.')
        }
        hash.update(buffer)
        if (!stream.write(buffer)) {
          await new Promise<void>(resolve => stream.once('drain', resolve))
        }

        const totalBytes = expectedSize || contentLength
        window?.webContents.send('app-download-progress', {
          assetId,
          platform: PILOT_PLATFORM,
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

      if (existsSync(destinationPath)) unlinkSync(destinationPath)
      renameSync(partialPath, destinationPath)

      for (const media of authorization.media ?? []) {
        if (!MEDIA_TYPE_SET.has(media.type)) continue
        const mediaFilename = getSafeMediaFilename(media.filename)
        const mediaDirectory = join(romDirectory, 'media', media.type)
        mkdirSync(mediaDirectory, { recursive: true })
        const mediaDestination = join(mediaDirectory, mediaFilename)
        if (existsSync(mediaDestination) && !mediaPreferences.overwrite) continue

        const mediaUrl = assertAllowedDownloadUrl(media.downloadUrl)
        const mediaResponse = await fetch(mediaUrl, {
          headers: { 'User-Agent': 'RIESCADE-App' },
          signal: AbortSignal.timeout(30 * 60_000)
        })
        if (!mediaResponse.ok || !mediaResponse.body) {
          throw new Error(`Falha no download da mídia ${media.type} (${mediaResponse.status}).`)
        }

        const mediaContentLength = Number(mediaResponse.headers.get('content-length') || 0)
        if (
          mediaContentLength > MAX_MEDIA_DOWNLOAD_SIZE ||
          (media.size !== null && mediaContentLength > 0 && mediaContentLength !== media.size)
        ) {
          throw new Error(`O tamanho da mídia ${media.type} não corresponde ao catálogo.`)
        }

        const mediaPartial = `${mediaDestination}.part`
        if (existsSync(mediaPartial)) unlinkSync(mediaPartial)
        const mediaStream = createWriteStream(mediaPartial, { flags: 'wx' })
        let mediaDownloadedBytes = 0
        try {
          for await (const chunk of mediaResponse.body as any) {
            const buffer = Buffer.from(chunk)
            mediaDownloadedBytes += buffer.length
            if (mediaDownloadedBytes > MAX_MEDIA_DOWNLOAD_SIZE) {
              throw new Error(`A mídia ${media.type} excedeu o limite permitido.`)
            }
            if (!mediaStream.write(buffer)) {
              await new Promise<void>(resolve => mediaStream.once('drain', resolve))
            }

            const mediaTotal = media.size || mediaContentLength
            window?.webContents.send('app-download-progress', {
              assetId,
              platform: PILOT_PLATFORM,
              title: `${authorization.asset.title} · ${media.type}`,
              filename: mediaFilename,
              downloadedBytes: mediaDownloadedBytes,
              totalBytes: mediaTotal,
              percent: mediaTotal > 0
                ? Math.round((mediaDownloadedBytes / mediaTotal) * 100)
                : 0
            })
          }

          mediaStream.end()
          await new Promise<void>((resolve, reject) => {
            mediaStream.once('finish', resolve)
            mediaStream.once('error', reject)
          })
          if (media.size !== null && mediaDownloadedBytes !== media.size) {
            throw new Error(`A mídia ${media.type} foi baixada incompleta.`)
          }
          if (existsSync(mediaDestination)) unlinkSync(mediaDestination)
          renameSync(mediaPartial, mediaDestination)
        } catch (error) {
          mediaStream.destroy()
          if (existsSync(mediaPartial)) unlinkSync(mediaPartial)
          throw error
        }
      }

      return { path: destinationPath, filename, sha256: actualSha256 }
    } catch (error) {
      stream.destroy()
      if (existsSync(partialPath)) unlinkSync(partialPath)
      throw error
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

  ipcMain.handle('app-download-asset', (_event, assetId: unknown) =>
    service.downloadAsset(getAccessToken(), assetId, appVersion, getMainWindow())
  )
}
