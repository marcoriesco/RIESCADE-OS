import { join, dirname, extname, basename } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, renameSync } from 'fs'
import { getRomsPath, getConfigPath } from '../utils/paths'
import { LibraryService } from './LibraryService'
import { SettingsParser } from '../parsers/SettingsParser'
import { Game } from '../../shared/types'
import { BrowserWindow, WebContents } from 'electron'
import sharp from 'sharp'

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
  'dos': 135,
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
  'pc': 138,
  'windows': 138,
  'win': 138,
  'windows9x': 137,
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
  'tg16cd': 114,
  'tgcd': 114,
  'wonderswan': 45,
  'wonderswancolor': 46,
  'zxspectrum': 76,
  'daphne': 49,
  'pico8': 234,
  'naomi': 56,
  'naomi2': 56,
  'atomiswave': 53,
  'teknoparrot': 269,
  'neogeocd': 70
}

function getRipList(imageSource: string): string[] {
  if (imageSource === 'ss') return ['ss', 'sstitle']
  if (imageSource === 'sstitle') return ['sstitle', 'ss']
  if (imageSource === 'mixrbv1' || imageSource === 'mixrbv') return ['mixrbv1', 'mixrbv2']
  if (imageSource === 'mixrbv2') return ['mixrbv2', 'mixrbv1']
  if (imageSource === 'box-2D') return ['box-2D', 'box-3D']
  if (imageSource === 'box-3D') return ['box-3D', 'box-2D']
  if (imageSource === 'wheel') return ['wheel', 'wheel-hd', 'wheel-steel', 'wheel-carbon']
  if (imageSource === 'wheel-hd') return ['wheel-hd', 'wheel', 'wheel-steel', 'wheel-carbon']
  if (imageSource === 'marquee') return ['screenmarqueesmall', 'screenmarquee']
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
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:' ||
      !(parsedUrl.hostname === 'screenscraper.fr' || parsedUrl.hostname.endsWith('.screenscraper.fr'))) {
    throw new Error('Media download blocked: only ScreenScraper HTTPS URLs are allowed')
  }
  const dir = dirname(destPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const temporaryPath = `${destPath}.part`
  writeFileSync(temporaryPath, buffer)
  try {
    renameSync(temporaryPath, destPath)
  } catch (error) {
    try {
      if (existsSync(destPath)) unlinkSync(destPath)
      renameSync(temporaryPath, destPath)
    } catch {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
      throw error
    }
  }
}

async function convertToWebp(srcPath: string): Promise<string> {
  try {
    const ext = extname(srcPath).toLowerCase()
    if (ext === '.webp') return srcPath  // already webp
    
    const webpPath = srcPath.replace(/\.[^/.]+$/, '.webp')
    await sharp(srcPath)
      .webp({ quality: 90 })
      .toFile(webpPath)
    
    // Remove original file
    try {
      unlinkSync(srcPath)
    } catch (error) {
      console.debug(`[ScraperService] Could not remove source media ${srcPath}.`, error)
    }
    
    return webpPath
  } catch (e) {
    // If conversion fails, keep original
    return srcPath
  }
}

export class ScraperService {
  private libraryService: LibraryService
  private settingsParser: SettingsParser
  private isCancelled = false
  private isRunning = false
  private manualSearchResolver: ((value: string | null) => void) | null = null

  constructor(libraryService: LibraryService) {
    this.libraryService = libraryService
    this.settingsParser = new SettingsParser()
  }

  public cancel(): void {
    this.isCancelled = true
    if (this.manualSearchResolver) {
      this.manualSearchResolver(null)
    }
  }

  public isActive(): boolean {
    return this.isRunning
  }

  public resolveManualSearch(query: string | null): void {
    if (this.manualSearchResolver) {
      this.manualSearchResolver(query)
    }
  }

  public async scrape(options?: { systemName?: string; gamePath?: string }, sender?: WebContents): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    this.isCancelled = false
    LibraryService.clearCache()
    const sendUpdate = (channel: string, data: any) => {
      try {
        if (sender && !sender.isDestroyed()) {
          sender.send(channel, data)
          return
        }
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, data)
        }
      } catch (e) {
        console.warn('[ScraperService] Could not send scraper progress to the frontend.', e)
      }
    }

    try {
      // 1. Load settings
      const devid = 'marcoriesco'
      const devpassword = 'Knt6uNptQ3z'
      const softname = 'marcoriesco'

      const customUser = this.settingsParser.getSetting('ScreenScraperUser', 'string') || ''
      const customPass = this.settingsParser.getSetting('ScreenScraperPass', 'string') || ''
      
      const ssid = customUser || ''
      const sspassword = customPass || ''
      const storedMotors = parseInt(
        String(this.settingsParser.getSetting('ScreenScraperMotors', 'int') || '1'),
        10
      )
      let availableMotors = Number.isFinite(storedMotors) && storedMotors > 0 ? storedMotors : 1

      if (ssid && sspassword) {
        try {
          const accountUrl = new URL('https://api.screenscraper.fr/api2/ssuserInfos.php')
          accountUrl.searchParams.set('devid', devid)
          accountUrl.searchParams.set('devpassword', devpassword)
          accountUrl.searchParams.set('softname', softname)
          accountUrl.searchParams.set('output', 'json')
          accountUrl.searchParams.set('ssid', ssid)
          accountUrl.searchParams.set('sspassword', sspassword)

          const accountResponse = await fetch(accountUrl)
          if (accountResponse.ok) {
            const accountJson = await accountResponse.json()
            const accountUser = accountJson.response?.ssuser || {}
            const parsedMotors = parseInt(
              accountUser.maxthreads
                || accountUser.maxThreads
                || accountUser.threads
                || accountUser.moteurs
                || '1',
              10
            )
            if (Number.isFinite(parsedMotors) && parsedMotors > 0) {
              availableMotors = parsedMotors
              this.settingsParser.saveSetting('ScreenScraperMotors', availableMotors, 'int')
            }
          }
        } catch (error) {
          console.warn('[ScraperService] Could not read the user motor limit; using one motor.', error)
        }
      }

      const filter = this.settingsParser.getSetting('ScrapperFilter', 'string') || 'all'
      const preferredRegion = this.settingsParser.getSetting('ScraperRegion', 'string') || 'us'
      
      const scrapeNames = this.settingsParser.getSetting('ScrapeNames', 'bool') ?? true
      const scrapeDesc = this.settingsParser.getSetting('ScrapeDescription', 'bool') ?? true
      const scrapeRatings = this.settingsParser.getSetting('ScrapeRatings', 'bool') ?? true

      // Overwrite settings from settings.json
      const overwriteNames = this.settingsParser.getSetting('ScrapeOverWriteNames', 'bool') ?? false
      const overwriteDesc = this.settingsParser.getSetting('ScrapeOverWriteDesc', 'bool') ?? false
      const overwriteMetadata = this.settingsParser.getSetting('ScrapeOverWriteMetadata', 'bool') ?? false

      // Media download toggles
      const downloadFanart = this.settingsParser.getSetting('ScrapperDownloadFanart', 'bool') ?? true
      const downloadCover = this.settingsParser.getSetting('ScrapperDownloadCover', 'bool') ?? true
      const downloadCover3D = this.settingsParser.getSetting('ScrapperDownloadCover3D', 'bool') ?? true
      const downloadCoverBack = this.settingsParser.getSetting('ScrapperDownloadCoverBack', 'bool') ?? true
      const downloadCartridge = this.settingsParser.getSetting('ScrapperDownloadCartridge', 'bool') ?? true
      const downloadLogo = this.settingsParser.getSetting('ScrapperDownloadLogo', 'bool') ?? true
      const downloadMarquee = this.settingsParser.getSetting('ScrapperDownloadMarquee', 'bool') ?? true
      const downloadScreenshot = this.settingsParser.getSetting('ScrapperDownloadScreenshot', 'bool') ?? true
      const downloadTitle = this.settingsParser.getSetting('ScrapperDownloadTitle', 'bool') ?? true
      const downloadMix = this.settingsParser.getSetting('ScrapperDownloadMix', 'bool') ?? true
      const downloadManual = this.settingsParser.getSetting('ScrapperDownloadManual', 'bool') ?? true
      const scrapeVideos = this.settingsParser.getSetting('ScrapeVideos', 'bool') ?? false
      const scrapeOverWriteMedias = this.settingsParser.getSetting('ScrapeOverWriteMedias', 'bool') ?? false

      // Fetch system settings
      const configuredLanguage = this.settingsParser.getSetting('Language', 'string') || 'auto'
      const systemLanguage = (configuredLanguage === 'auto'
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : configuredLanguage).substring(0, 2).toLowerCase()

      // Selected systems
      const scraperSystemsSetting = this.settingsParser.getSetting('ScraperSystems', 'string') || ''
      const selectedSystems = scraperSystemsSetting
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)

      const allSystems = this.libraryService.getSystems()
      const physicalSystems = allSystems.filter(sys => {
        const isAuto = ['all', 'favorites', 'recent', 'neverplayed', 'retroachievements', '2players', '4players'].includes(sys.name)
        const isGenre = sys.name.startsWith('_')
        const isCustom = sys.name.startsWith('auto-') || sys.name.startsWith('custom-')
        const hasExtension = sys.extension && sys.extension.length > 0
        const isIncluded = options?.systemName
          ? sys.name === options.systemName
          : (selectedSystems.length === 0 || selectedSystems.includes(sys.name))
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

          // Target a single game path if specified
          if (options?.gamePath && game.path !== options.gamePath) {
            continue
          }

          // Evaluate filters
          let shouldScrape = false
          if (options?.gamePath) {
            // Always scrape if targeted
            shouldScrape = true
          } else if (filter === 'all') {
            shouldScrape = true
          } else {
            // Default filter fallback if no specific targets
            const imageSrc = this.settingsParser.getSetting('ScrapperImageSrc', 'string') || 'mixrbv2'
            const thumbSrc = this.settingsParser.getSetting('ScrapperThumbSrc', 'string') || ''
            const logoSrc = this.settingsParser.getSetting('ScrapperLogoSrc', 'string') || ''

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
      let completedCount = 0

      const processJob = async (i: number): Promise<void> => {
        if (this.isCancelled) {
          return
        }

        const { system, game } = jobs[i]
        const romName = basename(game.path)
        const romNameNoExt = romName.replace(/\.[^/.]+$/, '')
        const systemId = SYSTEM_TO_SCREENSCRAPER_PLATFORM[system.name.toLowerCase()] || 
                         SYSTEM_TO_SCREENSCRAPER_PLATFORM[system.platform.toLowerCase()] || 
                         0

        const manualQuery = (jobs[i] as any).manualQuery
        const queryRomName = manualQuery || romName
          .replace(/\.[^/.]+$/, '')
          .replace(/\([^)]*\)/g, '')
          .replace(/\[[^\]]*\]/g, '')
          .replace(/\s+/g, ' ')
          .trim()

        sendUpdate('scrape-progress', {
          systemName: system.fullname || system.name.toUpperCase(),
          systemCode: system.name,
          gameName: game.name || romNameNoExt,
          current: completedCount,
          total: jobs.length,
          successCount,
          failCount,
          motors: availableMotors
        })

        try {
          let url = `https://api.screenscraper.fr/api2/jeuInfos.php?devid=${devid}&devpassword=${devpassword}&softname=${softname}&output=json&romnom=${encodeURIComponent(queryRomName)}`
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
            let bodyText = ''
            try {
              bodyText = (await response.text()).trim()
            } catch (e) {
              console.debug('[ScraperService] Could not read ScreenScraper error body.', e)
            }

            const maskUrl = (rawUrl: string) => {
              return rawUrl
                .replace(/devid=[^&]*/gi, 'devid=***')
                .replace(/devpassword=[^&]*/gi, 'devpassword=***')
                .replace(/ssid=[^&]*/gi, 'ssid=***')
                .replace(/sspassword=[^&]*/gi, 'sspassword=***')
            }
            const maskedUrl = maskUrl(url)

            throw new Error(
              `ScreenScraper returned status ${response.status} (${response.statusText}).\n  URL: ${maskedUrl}\n  ResponseBody: ${bodyText}`
            )
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
          if (scrapeNames && gameName && (overwriteNames || !game.name)) updatedFields.name = gameName
          if (scrapeDesc && gameDesc && (overwriteDesc || !game.desc)) updatedFields.desc = gameDesc
          if (gameDev && (overwriteMetadata || !game.developer)) updatedFields.developer = gameDev
          if (gamePub && (overwriteMetadata || !game.publisher)) updatedFields.publisher = gamePub
          if (gameGenre && (overwriteMetadata || !game.genre)) updatedFields.genre = gameGenre
          if (gamePlayers && (overwriteMetadata || !game.players)) updatedFields.players = gamePlayers
          if (scrapeRatings && gameRating !== undefined && (overwriteMetadata || game.rating === undefined || game.rating === null)) {
            updatedFields.rating = gameRating
          }
          if (relDate && (overwriteMetadata || !game.releasedate)) updatedFields.releasedate = relDate

          // Media downloads
          const mediaFolder = join(system.path, 'media')

          const handleMediaDownload = async (
            isEnabled: boolean,
            ripList: string[],
            subfolder: string,
            fieldNames: (keyof Game)[],
            skipConvert = false
          ) => {
            if (!isEnabled) return
            const found = findMedia(jeu.medias, ripList, preferredRegion)
            if (found) {
              const destFile = join(mediaFolder, subfolder, `${romNameNoExt}.${found.format}`)
              const webpFile = join(mediaFolder, subfolder, `${romNameNoExt}.webp`)
              
              const hasWebp = !skipConvert && existsSync(webpFile)
              const hasOriginal = existsSync(destFile)
              const fileExists = hasWebp || hasOriginal
              
              let finalRelPath = ''

              if (scrapeOverWriteMedias || !fileExists) {
                try {
                  await downloadFile(found.url, destFile)
                  if (!skipConvert) {
                    const convertedPath = await convertToWebp(destFile)
                    const convertedName = basename(convertedPath)
                    finalRelPath = `./media/${subfolder}/${convertedName}`
                  } else {
                    finalRelPath = `./media/${subfolder}/${romNameNoExt}.${found.format}`
                  }
                } catch (err: any) {
                  console.error(`Failed to download media ${subfolder} for ${game.name}:`, err.message)
                  return
                }
              } else {
                if (hasWebp) {
                  finalRelPath = `./media/${subfolder}/${romNameNoExt}.webp`
                } else {
                  finalRelPath = `./media/${subfolder}/${romNameNoExt}.${found.format}`
                  if (!skipConvert) {
                    try {
                      const convertedPath = await convertToWebp(destFile)
                      const convertedName = basename(convertedPath)
                      finalRelPath = `./media/${subfolder}/${convertedName}`
                    } catch (err) {
                      console.error(`Failed to convert existing image to webp for ${game.name}:`, err)
                    }
                  }
                }
              }

              if (finalRelPath) {
                fieldNames.forEach(field => {
                  (updatedFields as any)[field] = finalRelPath
                })
              }
            }
          }

          // 1. Fanart
          await handleMediaDownload(downloadFanart, ['fanart', 'ss'], 'fanart', ['fanart', 'image'])

          // 2. Cover (always 2D)
          await handleMediaDownload(downloadCover, ['box-2D'], 'cover', ['cover', 'thumbnail'])


          // 4. Cover 3D
          await handleMediaDownload(downloadCover3D, ['box-3D'], 'cover3d', ['cover3d'])

          // 5. Cover Back
          await handleMediaDownload(downloadCoverBack, ['box-2D-back', 'box-back', 'box-3D-back'], 'coverback', ['coverback'])

          // 5.1 Cartridge
          await handleMediaDownload(downloadCartridge, ['media-cartridge', 'cartridge', 'picture-cartridge'], 'cartridge', ['cartridge'])

          // 6. Logo (Wheel)
          await handleMediaDownload(downloadLogo, ['wheel', 'wheel-hd', 'wheel-steel'], 'logo', ['logo'])

          // 6.1 Marquee
          await handleMediaDownload(downloadMarquee, ['screenmarqueesmall', 'screenmarquee'], 'marquee', ['marquee'])

          // 7. Screenshot
          await handleMediaDownload(downloadScreenshot, ['ss', 'sstitle'], 'screenshot', ['screenshot'])

          // 8. Title Screen
          await handleMediaDownload(downloadTitle, ['sstitle', 'ss'], 'title', ['title'])

          // 9. Mix Image
          await handleMediaDownload(downloadMix, ['mixrbv2', 'mixrbv1'], 'mix', ['mix'])

          // 10. Manual (skip WebP conversion)
          await handleMediaDownload(downloadManual, ['manuel'], 'manual', ['manual'], true)

          // 11. Video (skip WebP conversion)
          await handleMediaDownload(scrapeVideos, ['video-normalized', 'video'], 'video', ['video'], true)

          // Apply updates to game list
          const updatedGame = { ...game, ...updatedFields }
          this.libraryService.updateGame(system.name, updatedGame)
          successCount++

        } catch (e: any) {
          console.error(`Scraper error for ${game.name} (${system.name}):`, e.message)

          const isNotFound = e.message.includes('404') || 
                             e.message.includes('not found') || 
                             e.message.includes('non trouvée') || 
                             e.message.includes('Game not found')

          if (jobs.length === 1 && isNotFound && !this.isCancelled) {
            sendUpdate('scrape-manual-search-required', {
              systemName: system.name,
              gamePath: game.path,
              failedQuery: queryRomName
            })

            const newQuery = await new Promise<string | null>((resolve) => {
              this.manualSearchResolver = resolve
            })
            this.manualSearchResolver = null

            if (newQuery && newQuery.trim().length > 0) {
              (jobs[i] as any).manualQuery = newQuery.trim()
              return processJob(i)
            }
          }

          failCount++
        }

        // Polite delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
        completedCount++
        sendUpdate('scrape-progress', {
          systemName: system.fullname || system.name.toUpperCase(),
          systemCode: system.name,
          gameName: game.name || romNameNoExt,
          current: completedCount,
          total: jobs.length,
          successCount,
          failCount,
          motors: availableMotors
        })
      }

      let nextJobIndex = 0
      const workerCount = Math.min(availableMotors, jobs.length)
      const workers = Array.from({ length: workerCount }, async () => {
        while (!this.isCancelled) {
          const jobIndex = nextJobIndex++
          if (jobIndex >= jobs.length) return
          await processJob(jobIndex)
        }
      })

      await Promise.all(workers)

      if (this.isCancelled) {
        sendUpdate('scrape-finished', {
          success: false,
          reason: 'Scraping was cancelled by user',
          count: successCount,
          failed: failCount
        })
        return
      }

      sendUpdate('scrape-finished', { success: true, count: successCount, failed: failCount })

    } catch (err: any) {
      console.error('Fatal error in ScraperService:', err)
      sendUpdate('scrape-finished', { success: false, reason: err.message || 'Unknown fatal scraper error' })
    } finally {
      this.manualSearchResolver = null
      this.isRunning = false
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
