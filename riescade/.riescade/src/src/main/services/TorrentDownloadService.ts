import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } from 'fs'
import { join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { getRetroBatPath } from '../utils/paths'
import { SettingsParser } from '../parsers/SettingsParser'

const FULL_MEDIA_ARCHIVE_NAMES = new Set(['_media.zip', '_media.7z'])

export interface TorrentProgressData {
  taskId: string
  platform: string
  title: string
  status: 'fetching-metadata' | 'downloading' | 'paused' | 'copying' | 'completed' | 'error'
  progress: number
  downloadedBytes: number
  totalBytes: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  eta: number
  error?: string
}

export interface ResolvedTorrentMeta {
  name: string
  length: number
  filesCount: number
}

export class TorrentDownloadService {
  private client: any = null
  private activeTorrents = new Map<string, { torrent: any; timer: any; platform: string; stagingDir: string }>()
  private settings = new SettingsParser()

  private async getClient(): Promise<any> {
    if (!this.client) {
      // @ts-ignore
      const mod = await import('webtorrent')
      const WebTorrent = mod.default || mod
      this.client = new WebTorrent()
      this.client.on('error', (err: any) => {
        console.error('[TorrentDownloadService] WebTorrent client error:', err)
      })
    }
    return this.client
  }

  async resolveMetadata(torrentSource: string): Promise<ResolvedTorrentMeta> {
    const client = await this.getClient()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { torrent.destroy() } catch {}
        reject(new Error('Tempo limite excedido ao consultar metadados do torrent.'))
      }, 30_000)

      const torrent = client.add(torrentSource, { deselect: true }, (t: any) => {
        clearTimeout(timeout)
        const meta: ResolvedTorrentMeta = {
          name: t.name || 'Plataforma',
          length: t.length || 0,
          filesCount: t.files ? t.files.length : 0
        }
        try { t.destroy() } catch {}
        resolve(meta)
      })

      torrent.on('error', (err: any) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  async startPlatformTorrent(
    platform: string,
    torrentSource: string,
    window: BrowserWindow | null
  ): Promise<string> {
    const taskId = `platform-${platform}`
    if (this.activeTorrents.has(taskId)) {
      return taskId
    }

    const romsPlatformDir = join(getRetroBatPath(), 'roms', platform)
    const stagingDir = join(romsPlatformDir, '.riescade-download')
    mkdirSync(stagingDir, { recursive: true })

    const client = await this.getClient()

    const torrent = client.add(torrentSource, { path: stagingDir }, (t: any) => {
      console.log(`[TorrentDownloadService] Started download for ${platform} in ${stagingDir}`)
    })

    const sendProgress = (status: TorrentProgressData['status'], errorMsg?: string) => {
      const data: TorrentProgressData = {
        taskId,
        platform,
        title: torrent.name || platform.toUpperCase(),
        status,
        progress: Math.round((torrent.progress || 0) * 100),
        downloadedBytes: torrent.downloaded || 0,
        totalBytes: torrent.length || 0,
        downloadSpeed: torrent.downloadSpeed || 0,
        uploadSpeed: torrent.uploadSpeed || 0,
        numPeers: torrent.numPeers || 0,
        eta: torrent.timeRemaining ? Math.round(torrent.timeRemaining / 1000) : 0,
        error: errorMsg
      }
      window?.webContents.send('torrent-download-progress', data)
    }

    const timer = setInterval(() => {
      sendProgress('downloading')
    }, 1000)

    this.activeTorrents.set(taskId, { torrent, timer, platform, stagingDir })

    torrent.on('done', async () => {
      clearInterval(timer)
      sendProgress('copying')
      try {
        // Destroy torrent instance to release file locks on Windows
        try { torrent.destroy() } catch {}
        await this.finalizePlatformDownload(platform, stagingDir)
        sendProgress('completed')
        window?.webContents.send('preload-library-required', platform)
      } catch (err: any) {
        console.error('[TorrentDownloadService] Finalize error:', err)
        sendProgress('error', err.message || String(err))
      } finally {
        this.activeTorrents.delete(taskId)
      }
    })

    torrent.on('error', (err: any) => {
      clearInterval(timer)
      sendProgress('error', err.message || String(err))
      this.activeTorrents.delete(taskId)
    })

    sendProgress('fetching-metadata')
    return taskId
  }

  pauseTorrent(taskId: string): void {
    const item = this.activeTorrents.get(taskId)
    if (item?.torrent) {
      item.torrent.pause()
    }
  }

  resumeTorrent(taskId: string): void {
    const item = this.activeTorrents.get(taskId)
    if (item?.torrent) {
      item.torrent.resume()
    }
  }

  cancelTorrent(taskId: string): void {
    const item = this.activeTorrents.get(taskId)
    if (item) {
      clearInterval(item.timer)
      try { item.torrent.destroy() } catch {}
      this.activeTorrents.delete(taskId)
    }
  }

  private async finalizePlatformDownload(platform: string, stagingDir: string): Promise<void> {
    const romsPlatformDir = join(getRetroBatPath(), 'roms', platform)
    mkdirSync(romsPlatformDir, { recursive: true })

    const overwriteGames = this.settings.getSetting('Downloads.Games.Overwrite', 'bool') === true ||
                           this.settings.getSetting('Downloads.OverwriteExisting', 'bool') === true
    const overwriteMedia = this.settings.getSetting('Downloads.Media.Overwrite', 'bool') === true

    if (!existsSync(stagingDir)) return

    // Unwrap single root wrapper directory created by torrent clients (e.g. .riescade-download/snes/ or .riescade-download/SNES Roms/)
    let realSrcDir = stagingDir
    const rootEntries = readdirSync(stagingDir, { withFileTypes: true })
    if (rootEntries.length === 1 && rootEntries[0].isDirectory()) {
      realSrcDir = join(stagingDir, rootEntries[0].name)
    }

    const moveRecursive = (srcDir: string, destDir: string) => {
      mkdirSync(destDir, { recursive: true })
      const entries = readdirSync(srcDir, { withFileTypes: true })
      for (const entry of entries) {
        const srcPath = join(srcDir, entry.name)
        const destPath = join(destDir, entry.name)
        if (entry.isDirectory()) {
          moveRecursive(srcPath, destPath)
          try {
            if (existsSync(srcPath) && readdirSync(srcPath).length === 0) {
              rmSync(srcPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
            }
          } catch {}
        } else {
          if (FULL_MEDIA_ARCHIVE_NAMES.has(entry.name.toLowerCase())) {
            try { unlinkSync(srcPath) } catch {}
            continue
          }

          const isMedia = srcDir.includes('media') || destDir.includes('media')
          const shouldOverwrite = isMedia ? overwriteMedia : overwriteGames
          if (existsSync(destPath) && !shouldOverwrite) {
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

    moveRecursive(realSrcDir, romsPlatformDir)
    try {
      rmSync(stagingDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    } catch (e) {
      console.warn('[TorrentDownloadService] Cleanup warning:', e)
    }
  }
}

export function registerTorrentDownloadIpc(
  getMainWindow: () => BrowserWindow | null
): void {
  const service = new TorrentDownloadService()

  ipcMain.handle('app-start-platform-torrent', (_event, platform: unknown, torrentSource: unknown) => {
    if (typeof platform !== 'string' || typeof torrentSource !== 'string') {
      throw new Error('Parâmetros de torrent inválidos.')
    }
    return service.startPlatformTorrent(platform, torrentSource, getMainWindow())
  })

  ipcMain.handle('app-pause-platform-torrent', (_event, taskId: unknown) => {
    if (typeof taskId !== 'string') throw new Error('ID de tarefa inválido.')
    return service.pauseTorrent(taskId)
  })

  ipcMain.handle('app-resume-platform-torrent', (_event, taskId: unknown) => {
    if (typeof taskId !== 'string') throw new Error('ID de tarefa inválido.')
    return service.resumeTorrent(taskId)
  })

  ipcMain.handle('app-cancel-platform-torrent', (_event, taskId: unknown) => {
    if (typeof taskId !== 'string') throw new Error('ID de tarefa inválido.')
    return service.cancelTorrent(taskId)
  })
}
