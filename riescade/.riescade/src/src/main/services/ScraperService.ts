import { join, dirname, extname, basename } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { getRomsPath, getConfigPath } from '../utils/paths'
import { LibraryService } from './LibraryService'
import { SettingsParser } from '../parsers/SettingsParser'
import { Game } from '../../shared/types'
import { BrowserWindow } from 'electron'

export const SYSTEM_TO_SCREENSCRAPER_PLATFORM: Record<string, number> = {
  '3do': 29,
  'actionmax': 81,
  'amiga': 64,
  'amstradcpc': 65,
  'apple2': 86,
  'arcade': 75,
  'atari800': 43,
  'atari2600': 26,
  'atari5200': 40,
  'atari7800': 41,
  'atarijaguar': 27,
  'atarijaguarcd': 171,
  'atarilynx': 28,
  'atarist': 42,
  'bbc': 37,
  'colecovision': 48,
  'c64': 66,
  'commodore64': 66,
  'intellivision': 115,
  'mac': 146,
  'macintosh': 146,
  'xbox': 32,
  'xbox360': 33,
  'msx': 113,
  'msx2': 116,
  'neogeo': 142,
  'neogeopocket': 25,
  'neogeopocketcolor': 82,
  'n3ds': 17,
  'n64': 14,
  'n64dd': 122,
  'nds': 15,
  'nes': 3,
  'famicom': 3,
  'fds': 106,
  'gameboy': 9,
  'gb': 9,
  'gba': 12,
  'gbc': 10,
  'gamecube': 13,
  'wii': 16,
  'wiiu': 18,
  'switch': 225,
  'virtualboy': 11,
  'pc': 135,
  'scummvm': 123,
  'sega32x': 19,
  'segacd': 20,
  'dreamcast': 23,
  'gamegear': 21,
  'genesis': 1,
  'megadrive': 1,
  'mastersystem': 2,
  'saturn': 22,
  'sg1000': 109,
  'ps1': 57,
  'psx': 57,
  'playstation': 57,
  'ps2': 58,
  'playstation2': 58,
  'ps3': 59,
  'playstation3': 59,
  'ps4': 60,
  'playstation4': 60,
  'vita': 62,
  'psvita': 62,
  'psp': 61,
  'playstationportable': 61,
  'snes': 4,
  'sfc': 4,
  'tg16': 31,
  'tgcd': 114,
  'wonderswan': 45,
  'wonderswancolor': 46,
  'zxspectrum': 76,
  'daphne': 49,
  'pico8': 234
}

function getRipList(imageSource: string): string[] {
  if (imageSource === 'ss') return ['ss', 'sstitle']
  if (imageSource === 'sstitle') return ['sstitle', 'ss']
  if (imageSource === 'mixrbv1' || imageSource === 'mixrbv') return ['mixrbv1', 'mixrbv2']
  if (imageSource === 'mixrbv2') return ['mixrbv2', 'mixrbv1']
  if (imageSource === 'box-2D') return ['box-2D', 'box-3D']
  if (imageSource === 'box-3D') return ['box-3D', 'box-2D']
  if (imageSource === 'wheel') return ['wheel', 'wheel-hd', 'wheel-steel', 'wheel-carbon', 'screenmarqueesmall', 'screenmarquee']
  if (imageSource === 'wheel-hd') return ['wheel-hd', 'wheel', 'wheel-steel', 'wheel-carbon', 'screenmarqueesmall', 'screenmarquee']
  if (imageSource === 'marquee') return ['screenmarqueesmall', 'screenmarquee', 'wheel', 'wheel-hd', 'wheel-steel', 'wheel-carbon']
  if (imageSource === 'video') return ['video-normalized', 'video']
  return [imageSource]
}

function findMedia(medias: any[], typeList: string[], preferredRegion: string): { url: string; format: string } | null {
  if (!medias || !Array.isArray(medias)) return null
  const regions = [preferredRegion, 'wor', 'us', 'eu', 'jp', 'ss', '']
  for (const type of typeList) {
    for (const reg of regions) {
      const match = medias.find(m => m.type === type && (reg === '' || String(m.region || '').toLowerCase() === reg.toLowerCase()))
      if (match && match.url) {
        return { url: match.url, format: match.format || 'png' }
      }
    }
  }
  const fallback = medias.find(m => m.type === typeList[0] && m.url)
  if (fallback) {
    return { url: fallback.url, format: fallback.format || 'png' }
  }
  return null
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const dir = dirname(destPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destPath, buffer)
}

export class ScraperService {
  private libraryService: LibraryService
  private settingsParser: SettingsParser
  private isCancelled = false

  constructor(libraryService: LibraryService) {
    this.libraryService = libraryService
    this.settingsParser = new SettingsParser()
  }

  public cancel(): void {
    this.isCancelled = true
  }

  public async scrape(): Promise<void> {
    this.isCancelled = false
    LibraryService.clearCache()
    const win = BrowserWindow.getAllWindows()[0]
    const sendUpdate = (channel: string, data: any) => {
      try {
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, data)
        }
      } catch (e) {}
    }

    try {
      // 1. Load settings
      const scraper = this.settingsParser.getSetting('Scraper', 'string') || 'ScreenScraper'
      if (scraper !== 'ScreenScraper') {
        // Currently we only support ScreenScraper as requested
        sendUpdate('scrape-finished', { success: false, reason: 'Unsupported scraper source' })
        return
      }

      const devid = 'retrobat'
      const devpassword = 'JRLmOtnZXwo'
      const softname = 'retrobat'

      const customUser = this.settingsParser.getSetting('ScreenScraperUser', 'string') || ''
      const customPass = this.settingsParser.getSetting('ScreenScraperPass', 'string') || ''
      
      const ssid = customUser || ''
      const sspassword = customPass || ''

      const filter = this.settingsParser.getSetting('ScrapperFilter', 'string') || 'all'
      const preferredRegion = this.settingsParser.getSetting('ScraperRegion', 'string') || 'eu'
      
      const scrapeNames = this.settingsParser.getSetting('ScrapeNames', 'bool') ?? true
      const scrapeDesc = this.settingsParser.getSetting('ScrapeDescription', 'bool') ?? true
      const scrapeRatings = this.settingsParser.getSetting('ScrapeRatings', 'bool') ?? true
      const scrapeVideos = this.settingsParser.getSetting('ScrapeVideos', 'bool') ?? false
      const scrapeFanart = this.settingsParser.getSetting('ScrapeFanart', 'bool') ?? false
      const scrapeOverWrite = this.settingsParser.getSetting('ScrapeOverWrite', 'bool') ?? false

      const imageSrc = this.settingsParser.getSetting('ScrapperImageSrc', 'string') || 'mixrbv2'
      const thumbSrc = this.settingsParser.getSetting('ScrapperThumbSrc', 'string') || ''
      const logoSrc = this.settingsParser.getSetting('ScrapperLogoSrc', 'string') || ''

      // Fetch system settings
      const systemLanguage = (this.settingsParser.getSetting('Language', 'string') || 'pt').substring(0, 2).toLowerCase()

      // Selected systems
      const scraperSystemsSetting = this.settingsParser.getSetting('ScraperSystems', 'string') || ''
      const selectedSystems = scraperSystemsSetting
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      const allSystems = this.libraryService.getSystems()
      const physicalSystems = allSystems.filter(sys => {
        const isAuto = ['all', 'favorites', 'recent', 'neverplayed', 'retroachievements', '2players', '4players'].includes(sys.name)
        const isGenre = sys.name.startsWith('_')
        const isCustom = sys.name.startsWith('auto-') || sys.name.startsWith('custom-')
        const hasExtension = sys.extension && sys.extension.length > 0
        const isIncluded = selectedSystems.length === 0 || selectedSystems.includes(sys.name)
        return !isAuto && !isGenre && !isCustom && hasExtension && isIncluded
      })

      if (physicalSystems.length === 0) {
        sendUpdate('scrape-finished', { success: true, count: 0, reason: 'No systems to scrape' })
        return
      }

      // Gather games to scrape
      interface ScrapeJob {
        system: typeof physicalSystems[0]
        game: Game
      }
      const jobs: ScrapeJob[] = []

      for (const sys of physicalSystems) {
        const games = this.libraryService.getGames(sys.name)
        for (const game of games) {
          if (game.isCollectionFolder) continue

          // Evaluate filters
          let shouldScrape = false
          if (filter === 'all') {
            shouldScrape = true
          } else {
            const hasImage = game.fanart && existsSync(resolvePath(sys.path, game.fanart))
            const hasThumb = game.cover && existsSync(resolvePath(sys.path, game.cover))
            const hasLogo = game.marquee && existsSync(resolvePath(sys.path, game.marquee))
            const hasVideo = game.video && existsSync(resolvePath(sys.path, game.video))

            const reqImage = !!imageSrc
            const reqThumb = !!thumbSrc
            const reqLogo = !!logoSrc
            const reqVideo = !!scrapeVideos

            let missingAny = false
            let missingAll = true

            if (reqImage) {
              if (!hasImage) missingAny = true; else missingAll = false;
            }
            if (reqThumb) {
              if (!hasThumb) missingAny = true; else missingAll = false;
            }
            if (reqLogo) {
              if (!hasLogo) missingAny = true; else missingAll = false;
            }
            if (reqVideo) {
              if (!hasVideo) missingAny = true; else missingAll = false;
            }

            if (filter === 'missing' && missingAny) {
              shouldScrape = true
            } else if (filter === 'missing_all' && missingAll) {
              shouldScrape = true
            }
          }

          if (shouldScrape) {
            jobs.push({ system: sys, game })
          }
        }
      }

      if (jobs.length === 0) {
        sendUpdate('scrape-finished', { success: true, count: 0, reason: 'No games matched the scraper filter' })
        return
      }

      let successCount = 0
      let failCount = 0

      for (let i = 0; i < jobs.length; i++) {
        if (this.isCancelled) {
          sendUpdate('scrape-finished', { success: false, reason: 'Scraping was cancelled by user', count: successCount })
          return
        }

        const { system, game } = jobs[i]
        const romName = basename(game.path)
        const romNameNoExt = romName.replace(/\.[^/.]+$/, '')
        const systemId = SYSTEM_TO_SCREENSCRAPER_PLATFORM[system.name.toLowerCase()] || 
                         SYSTEM_TO_SCREENSCRAPER_PLATFORM[system.platform.toLowerCase()] || 
                         0

        sendUpdate('scrape-progress', {
          systemName: system.fullname || system.name.toUpperCase(),
          systemCode: system.name,
          gameName: game.name || romNameNoExt,
          current: i + 1,
          total: jobs.length,
          successCount,
          failCount
        })

        try {
          let url = `https://api.screenscraper.fr/api2/jeuInfos.php?devid=${devid}&devpassword=${devpassword}&softname=${softname}&output=json&romnom=${encodeURIComponent(romName)}`
          if (systemId > 0) {
            url += `&systemeid=${systemId}`
          }
          if (ssid) {
            url += `&ssid=${encodeURIComponent(ssid)}`
          }
          if (sspassword) {
            url += `&sspassword=${encodeURIComponent(sspassword)}`
          }

          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`ScreenScraper returned status ${response.status}`)
          }

          const json = await response.json()
          const jeu = json.response?.jeu

          if (!jeu) {
            throw new Error('Game not found on ScreenScraper')
          }

          // Extract metadata
          const noms = jeu.noms || []
          const regions = [preferredRegion, 'wor', 'us', 'eu', 'jp', 'ss', '']
          let gameName = ''
          for (const reg of regions) {
            const nomMatch = noms.find((n: any) => reg === '' || String(n.region || '').toLowerCase() === reg.toLowerCase())
            if (nomMatch) {
              gameName = nomMatch.text
              break
            }
          }
          if (!gameName && noms.length > 0) gameName = noms[0].text

          const synopsis = jeu.synopsis || []
          const langs = [systemLanguage, 'en', 'wor']
          let gameDesc = ''
          for (const l of langs) {
            const synMatch = synopsis.find((s: any) => String(s.langue || '').toLowerCase() === l.toLowerCase())
            if (synMatch) {
              gameDesc = synMatch.text
              break
            }
          }
          if (!gameDesc && synopsis.length > 0) gameDesc = synopsis[0].text

          const gameDev = jeu.developpeur?.text || ''
          const gamePub = jeu.editeur?.text || ''

          const genresList = (jeu.genres || []).map((g: any) => {
            const synMatch = (g.noms || []).find((n: any) => String(n.langue || '').toLowerCase() === systemLanguage.toLowerCase()) || 
                             (g.noms || []).find((n: any) => String(n.langue || '').toLowerCase() === 'en')
            return synMatch ? synMatch.text : ''
          }).filter((x: string) => x !== '')
          const gameGenre = genresList.join(', ')

          const gamePlayers = jeu.joueurs?.text || ''
          const gameRating = jeu.note?.text ? parseFloat(jeu.note.text) / 20 : undefined

          const dates = jeu.dates || []
          let relDate = ''
          for (const reg of regions) {
            const dateMatch = dates.find((d: any) => reg === '' || String(d.region || '').toLowerCase() === reg.toLowerCase())
            if (dateMatch) {
              relDate = dateMatch.text
              break
            }
          }
          if (!relDate && dates.length > 0) relDate = dates[0].text
          if (relDate && relDate.includes('-')) {
            relDate = relDate.replace(/-/g, '') + 'T000000'
          }

          // Build game updates
          const updatedFields: Partial<Game> = {}
          if (scrapeNames && gameName) updatedFields.name = gameName
          if (scrapeDesc && gameDesc) updatedFields.desc = gameDesc
          if (gameDev) updatedFields.developer = gameDev
          if (gamePub) updatedFields.publisher = gamePub
          if (gameGenre) updatedFields.genre = gameGenre
          if (gamePlayers) updatedFields.players = gamePlayers
          if (scrapeRatings && gameRating !== undefined) updatedFields.rating = gameRating
          if (relDate) updatedFields.releasedate = relDate

          // Media downloads
          const mediaFolder = join(system.path, 'media')

          // 1. Main image
          if (imageSrc) {
            const found = findMedia(jeu.medias, getRipList(imageSrc), preferredRegion)
            if (found) {
              const destFile = join(mediaFolder, 'fanart', `${romNameNoExt}.${found.format}`)
              if (scrapeOverWrite || !existsSync(destFile)) {
                await downloadFile(found.url, destFile)
              }
              updatedFields.image = `./media/fanart/${romNameNoExt}.${found.format}`
            }
          }

          // 2. Thumbnail
          if (thumbSrc) {
            const found = findMedia(jeu.medias, getRipList(thumbSrc), preferredRegion)
            if (found) {
              const destFile = join(mediaFolder, 'cover', `${romNameNoExt}.${found.format}`)
              if (scrapeOverWrite || !existsSync(destFile)) {
                await downloadFile(found.url, destFile)
              }
              updatedFields.thumbnail = `./media/cover/${romNameNoExt}.${found.format}`
            }
          }

          // 3. Logo/marquee
          if (logoSrc) {
            const found = findMedia(jeu.medias, getRipList(logoSrc), preferredRegion)
            if (found) {
              const destFile = join(mediaFolder, 'logo', `${romNameNoExt}.${found.format}`)
              if (scrapeOverWrite || !existsSync(destFile)) {
                await downloadFile(found.url, destFile)
              }
              updatedFields.marquee = `./media/logo/${romNameNoExt}.${found.format}`
            }
          }

          // 4. Video
          if (scrapeVideos) {
            const found = findMedia(jeu.medias, getRipList('video'), preferredRegion)
            if (found) {
              const destFile = join(mediaFolder, 'video', `${romNameNoExt}.${found.format}`)
              if (scrapeOverWrite || !existsSync(destFile)) {
                await downloadFile(found.url, destFile)
              }
              updatedFields.video = `./media/video/${romNameNoExt}.${found.format}`
            }
          }

          // Apply updates to game list
          const updatedGame = { ...game, ...updatedFields }
          this.libraryService.updateGame(system.name, updatedGame)
          successCount++

        } catch (e: any) {
          console.error(`Scraper error for ${game.name} (${system.name}):`, e.message)
          failCount++
        }

        // Polite delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      sendUpdate('scrape-finished', { success: true, count: successCount, failed: failCount })

    } catch (err: any) {
      console.error('Fatal error in ScraperService:', err)
      sendUpdate('scrape-finished', { success: false, reason: err.message || 'Unknown fatal scraper error' })
    }
  }
}

function resolvePath(base: string, relativePath: string): string {
  // if relativePath is ./media/..., resolve it relative to base
  if (relativePath.startsWith('./')) {
    return join(base, relativePath.substring(2))
  }
  return join(base, relativePath)
}
