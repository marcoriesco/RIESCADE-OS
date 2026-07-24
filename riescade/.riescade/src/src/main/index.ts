import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join, dirname, extname, basename, resolve, relative, isAbsolute } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { LibraryService } from './services/LibraryService'
import { LauncherService } from './services/LauncherService'
import { EmulatorInstaller } from './services/EmulatorInstaller'
import { SettingsParser } from './parsers/SettingsParser'
import { EmulatorParser } from './parsers/EmulatorParser'
import { ThemeSettingsParser } from './parsers/ThemeSettingsParser'
import { SystemService } from './services/SystemService'
import { ScraperService } from './services/ScraperService'
import { EmulatorSchemaService } from './services/EmulatorSchemaService'
import { RomsWatcherService } from './services/RomsWatcherService'
import { InputDeviceService } from './services/InputDeviceService'
import { registerUpdaterIpc } from './services/UpdaterService'
import { Game, System } from '../shared/types'
import { ControllerManager } from './services/ControllerManager'
import { watch, FSWatcher, readFileSync, existsSync, writeFileSync, mkdirSync, statSync, promises as fsPromises } from 'fs'
import { getRetroBatPath, getConfigPath, getResourcesPath, getRiescadePath, getDatabasePath, getMusicPath } from './utils/paths'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import { SYSTEM_TO_SCREENSCRAPER_PLATFORM } from './services/ScraperService'

const libraryService = new LibraryService()
const launcherService = new LauncherService()
const settingsParser = new SettingsParser()
const systemService = new SystemService(libraryService)
const scraperService = new ScraperService(libraryService)
const emulatorSchemaService = new EmulatorSchemaService()

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

function applyLogLevel(value?: string): void {
  const level = String(value || 'default').toLowerCase()
  const noop = () => {}
  console.log = level === 'default' || level === 'debug' ? originalConsole.log : noop
  console.info = level === 'default' || level === 'debug' ? originalConsole.info : noop
  console.debug = level === 'debug' ? originalConsole.debug : noop
  console.warn = level === 'default' || level === 'debug' || level === 'warning' ? originalConsole.warn : noop
  console.error = level !== 'disabled' ? originalConsole.error : noop
}

applyLogLevel(settingsParser.getSetting('LogLevel', 'string') || 'default')

function isPathInside(candidatePath: string, allowedRoot: string): boolean {
  const candidate = resolve(candidatePath)
  const root = resolve(allowedRoot)
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function resolveAllowedAppPath(filePath: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Caminho inválido.')
  let cleanPath = filePath.trim()
  if (cleanPath.startsWith('file:///')) cleanPath = decodeURIComponent(cleanPath.substring(8))
  const resolvedPath = resolve(cleanPath)
  if (!isPathInside(resolvedPath, getRetroBatPath())) {
    throw new Error('Acesso negado a caminho externo ao RIESCADE OS.')
  }
  return resolvedPath
}

// Configure Chromium GPU graphics backend switches based on user settings
const enabledFeatures: string[] = []

const ignoreBlocklistSetting = settingsParser.getSetting('RIESCADE.IgnoreGpuBlocklist', 'string')
if (ignoreBlocklistSetting === 'true' || ignoreBlocklistSetting === '1') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
}

app.commandLine.appendSwitch('enable-gpu-rasterization')

const gpuDriver = settingsParser.getSetting('RIESCADE.GpuDriver', 'string')
if (gpuDriver && gpuDriver !== 'default') {
  if (gpuDriver === 'd3d12') {
    app.commandLine.appendSwitch('use-angle', 'd3d12')
  } else if (gpuDriver === 'd3d11') {
    app.commandLine.appendSwitch('use-angle', 'd3d11')
  } else if (gpuDriver === 'opengl') {
    app.commandLine.appendSwitch('use-gl', 'desktop')
    app.commandLine.appendSwitch('use-angle', 'gl')
  } else if (gpuDriver === 'vulkan') {
    app.commandLine.appendSwitch('use-angle', 'vulkan')
    enabledFeatures.push('Vulkan')
  } else if (gpuDriver === 'software') {
    app.commandLine.appendSwitch('disable-gpu')
  }
}

if (enabledFeatures.length > 0) {
  app.commandLine.appendSwitch('enable-features', enabledFeatures.join(','))
}

let themeWatcher: FSWatcher | null = null
let mainWindow: BrowserWindow | null = null
let themeReloadTimeout: NodeJS.Timeout | null = null
let romsWatcher: RomsWatcherService | null = null

function sendToMainWindow(channel: string, ...args: any[]): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args)
    }
  } catch (err) {
    console.error(`[IPC] Error sending to main window on channel ${channel}:`, err)
  }
}

function broadcastToWindows(channel: string, ...args: any[]): void {
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, ...args)
    }
  })
}

function saveWindowConfig(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const shouldSave = settingsParser.getSetting('RIESCADE.SaveWindowPositions', 'bool') !== false
  if (!shouldSave) return

  try {
    const isFullScreen = mainWindow.isFullScreen()
    const isMaximized = mainWindow.isMaximized()
    
    settingsParser.saveSetting('Window.FullScreen', isFullScreen, 'bool')
    settingsParser.saveSetting('Window.Maximized', isMaximized, 'bool')

    let bounds = { x: 0, y: 0, width: 1280, height: 720 }
    if (isMaximized || isFullScreen) {
      try {
        bounds = mainWindow.getNormalBounds()
      } catch (e) {
        bounds = mainWindow.getBounds()
      }
    } else {
      bounds = mainWindow.getBounds()
    }

    settingsParser.saveSetting('Window.X', bounds.x, 'int')
    settingsParser.saveSetting('Window.Y', bounds.y, 'int')
    settingsParser.saveSetting('Window.Width', bounds.width, 'int')
    settingsParser.saveSetting('Window.Height', bounds.height, 'int')
  } catch (err) {
    console.error('[saveWindowConfig] Failed to save window config:', err)
  }
}

function getConfiguredDisplay() {
  const displays = screen.getAllDisplays()
  const preference = settingsParser.getSetting('RIESCADE.FrontendDisplay', 'string') || 'auto'
  if (preference === 'primary') return screen.getPrimaryDisplay()
  if (preference === 'secondary') {
    const primaryId = screen.getPrimaryDisplay().id
    return displays.find(display => display.id !== primaryId) || screen.getPrimaryDisplay()
  }
  return null
}

function applyConfiguredDisplayPreference(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const target = getConfiguredDisplay()
  if (!target) return

  const wasFullScreen = mainWindow.isFullScreen()
  const wasMaximized = mainWindow.isMaximized()
  const currentBounds = mainWindow.getNormalBounds()
  const targetArea = target.workArea
  const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds())
  if (currentDisplay.id === target.id) return

  const moveWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (wasMaximized) mainWindow.unmaximize()

    const width = Math.min(Math.max(currentBounds.width, 800), targetArea.width)
    const height = Math.min(Math.max(currentBounds.height, 600), targetArea.height)
    mainWindow.setBounds({
      x: targetArea.x + Math.round((targetArea.width - width) / 2),
      y: targetArea.y + Math.round((targetArea.height - height) / 2),
      width,
      height
    })

    if (wasFullScreen) mainWindow.setFullScreen(true)
    else if (wasMaximized) mainWindow.maximize()
  }

  if (wasFullScreen) {
    mainWindow.once('leave-full-screen', moveWindow)
    mainWindow.setFullScreen(false)
  } else {
    moveWindow()
  }
}

function createWindow(): void {
  const shouldSave = settingsParser.getSetting('RIESCADE.SaveWindowPositions', 'bool') !== false
  const isFullScreen = shouldSave ? settingsParser.getSetting('Window.FullScreen', 'bool') !== false : true
  const isMaximized = shouldSave && settingsParser.getSetting('Window.Maximized', 'bool') === true
  
  const defaultWidth = 1280
  const defaultHeight = 720
  
  const savedWidth = shouldSave ? settingsParser.getSetting('Window.Width', 'int') : null
  const savedHeight = shouldSave ? settingsParser.getSetting('Window.Height', 'int') : null
  const savedX = shouldSave ? settingsParser.getSetting('Window.X', 'int') : null
  const savedY = shouldSave ? settingsParser.getSetting('Window.Y', 'int') : null
  
  const width = savedWidth !== null ? parseInt(savedWidth, 10) : defaultWidth
  const height = savedHeight !== null ? parseInt(savedHeight, 10) : defaultHeight
  
  const options: any = {
    width,
    height,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0e14',
    icon: join(getResourcesPath(), 'riescade.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: app.isPackaged
    }
  }
  
  const configuredDisplay = getConfiguredDisplay()
  if (configuredDisplay) {
    const area = configuredDisplay.workArea
    options.x = area.x + Math.round((area.width - width) / 2)
    options.y = area.y + Math.round((area.height - height) / 2)
  } else if (savedX !== null && savedY !== null) {
    options.x = parseInt(savedX, 10)
    options.y = parseInt(savedY, 10)
  }
  
  mainWindow = new BrowserWindow(options)
  
  if (isFullScreen) {
    mainWindow.setFullScreen(true)
  } else if (isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    applyConfiguredDisplayPreference()
    mainWindow!.show()
  })

  mainWindow.on('close', () => {
    saveWindowConfig()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on vite dev server
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}



app.whenReady().then(() => {
  screen.on('display-added', applyConfiguredDisplayPreference)
  screen.on('display-removed', applyConfiguredDisplayPreference)
  screen.on('display-metrics-changed', applyConfiguredDisplayPreference)
  electronApp.setAppUserModelId('com.riescade')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Refresh the Raw Input inventory in the background at every frontend start.
  // The standalone launcher consumes this inventory for automatic keyboard and
  // lightgun bindings.
  void InputDeviceService.scanPointingDevices(true)

  // Start polling game controllers and emit changes to the frontend
  const controllerManager = ControllerManager.getInstance()
  controllerManager.startPolling((controllers) => {
    broadcastToWindows('controllers-updated', controllers)
  }, 2000)

  app.on('will-quit', () => {
    controllerManager.stopPolling()
  })

  registerUpdaterIpc(() => mainWindow)

  ipcMain.on('open-app-window', (_, type: 'system' | 'tool', id: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-app-window', type, id)
    }
  })

  // Window control listener for Spotify-like frameless native windows
  ipcMain.on('window-control', (event, action: 'minimize' | 'maximize' | 'close') => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      if (action === 'minimize') {
        if (win !== mainWindow) {
          win.hide()
        } else {
          win.minimize()
        }
      } else if (action === 'maximize') {
        if (win.isMaximized()) {
          win.unmaximize()
        } else {
          win.maximize()
        }
      } else if (action === 'close') {
        win.close()
      }
    }
  })

  ipcMain.handle('preload-library', async (_, forcePhysicalScan?: boolean, systemName?: string | string[]) => {
    if (systemName) {
      if (Array.isArray(systemName)) {
        for (const name of systemName) {
          await libraryService.preloadSystem(name, forcePhysicalScan)
        }
      } else {
        await libraryService.preloadSystem(systemName, forcePhysicalScan)
      }
    } else {
      if (forcePhysicalScan) {
        LibraryService.clearCache()
      }
      await libraryService.preloadAll(forcePhysicalScan)

      // Start/stop ROMs watcher dynamically based on DB mode setting
      if (!romsWatcher) {
        romsWatcher = new RomsWatcherService(libraryService)
        romsWatcher.start()
      }
    }
    return true
  })

  ipcMain.handle('get-db-stats', async () => {
    const db = LibraryService.getDatabase()
    return {
      totalGames: db.isOpen() ? db.getTotalGameCount() : 0,
      indexedSystems: db.isOpen() ? db.getIndexedSystemCount() : 0,
      systemsInfo: db.isOpen() ? db.getSystemSyncInfo() : []
    }
  })

  ipcMain.handle('rebuild-database', async () => {
    const db = LibraryService.getDatabase()
    LibraryService.clearCache()
    await libraryService.rebuildDatabase((sysName, current, total) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('systems-loading-progress', Math.round((current / total) * 100), 'INDEXING_DATABASE')
      }
    })
    return true
  })

  ipcMain.handle('get-library-mode', async () => {
    return 'database'
  })

  ipcMain.handle('db-get-games-paginated', async (_, system, page, pageSize, search, sortBy, sortDir) => {
    const db = LibraryService.getDatabase()
    if (db.isOpen()) {
      return db.getGamesPaginated(system, page, pageSize, search, sortBy, sortDir)
    }
    return { games: [], total: 0, pages: 0 }
  })

  ipcMain.handle('db-update-game', async (_, game) => {
    libraryService.updateGame(game.system, game)
    return true
  })

  ipcMain.handle('db-delete-games', async (_, items: { system: string; path: string; deletePhysical?: boolean }[]) => {
    for (const item of items) {
      try {
        libraryService.deleteGame(item.system, item.path, !!item.deletePhysical)
      } catch (e) {
        console.error(`Failed to delete game ${item.path} from system ${item.system}:`, e)
      }
    }
    return true
  })

  ipcMain.handle('db-get-systems-info', async () => {
    const db = LibraryService.getDatabase()
    if (db.isOpen()) {
      return db.getSystemSyncInfo()
    }
    return []
  })

  ipcMain.handle('db-get-stats', async () => {
    const db = LibraryService.getDatabase()
    if (!db.isOpen()) return { totalGames: 0, totalSystems: 0, dbSize: 0, lastSyncAt: 0 }
    
    const dbPath = getDatabasePath()
    let dbSize = 0
    try {
      if (existsSync(dbPath)) {
        dbSize = statSync(dbPath).size
      }
    } catch (error) {
      console.warn('[Database] Could not read database file size.', error)
    }

    const stats = db.getStats()

    return {
      totalGames: stats.totalGames,
      totalSystems: stats.totalSystems,
      dbSize,
      lastSyncAt: stats.lastSyncAt
    }
  })

  ipcMain.handle('db-vacuum', async () => {
    const db = LibraryService.getDatabase()
    if (db.isOpen()) {
      db.vacuum()
      return true
    }
    return false
  })

  ipcMain.handle('db-rebuild', async () => {
    LibraryService.clearCache()
    await libraryService.rebuildDatabase((sysName, current, total) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('systems-loading-progress', Math.round((current / total) * 100), 'INDEXING_DATABASE')
      }
    })
    return true
  })


  ipcMain.handle('get-all-media-paths', async () => {
    // Media paths are now derived from game stems, not stored in DB
    return []
  })

  ipcMain.handle('get-systems', async () => {
    return libraryService.getSystems()
  })
  ipcMain.handle('check-media-folders', async (_, systemPath: string) => {
    const fs = require('fs')
    const { join } = require('path')
    const folders = ['cover', 'cover3d', 'coverback', 'cartridge', 'fanart', 'logo', 'marquee', 'screenshot', 'title', 'mix', 'video', 'manual']
    const results: Record<string, boolean> = {}

    if (!systemPath || systemPath.startsWith('virtual://') || systemPath === 'collections') {
      const systems = libraryService.getSystems()
      for (const f of folders) {
        results[f] = false
        for (const sys of systems) {
          if (sys.path && !sys.path.startsWith('virtual://')) {
            if (fs.existsSync(join(sys.path, 'media', f))) {
              results[f] = true
              break
            }
          }
        }
      }
      return results
    }

    const allowedSystemPath = resolveAllowedAppPath(systemPath)
    for (const f of folders) {
      results[f] = fs.existsSync(join(allowedSystemPath, 'media', f))
    }
    return results
  })

  ipcMain.handle('get-games', async (_, systemName: string) => {
    return libraryService.getGames(systemName)
  })

  ipcMain.handle('check-emulator-status', async (_, emulatorName: string, systemName: string) => {
    const systems = libraryService.getSystems()
    const systemObj = systems.find(s => s.name === systemName)
    const emulatorObj = systemObj?.emulators?.find(e => e.name === emulatorName)
    const sourceUrl = emulatorObj?.source
    return EmulatorInstaller.checkStatus(emulatorName, sourceUrl)
  })

  ipcMain.handle('download-install-emulator', async (event, emulatorName: string, systemName: string) => {
    const systemObj = libraryService.getSystems().find(s => s.name === systemName)
    const emulatorObj = systemObj?.emulators?.find(e => e.name === emulatorName)
    if (!emulatorObj?.source) throw new Error('Fonte oficial do emulador não encontrada na configuração do sistema.')
    return EmulatorInstaller.downloadAndInstall(emulatorName, emulatorObj.source, (pct) => {
      event.sender.send('emulator-download-progress', { emulatorName, pct })
    })
  })

  ipcMain.handle('launch-game', async (_, game: Game, system: System, saveStateSlot?: number, saveStatePath?: string) => {
    let targetSystem = system
    if (system.name === 'collections') {
      const realSystem = libraryService.getSystems().find(s => s.name.toLowerCase() === game.system.toLowerCase())
      if (realSystem) {
        targetSystem = realSystem
      }
    }

    const result = await launcherService.launch(game, targetSystem, ControllerManager.getInstance().getConnected(), saveStateSlot, undefined, saveStatePath)
    
    // Focus main window when the game exits
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
    


    if (targetSystem.name.toLowerCase() === 'windows_installers') {
      console.log('windows_installers launched and exited, reloading library and notifying frontend...')
      LibraryService.clearCache()
      await libraryService.preloadAll(true)
      BrowserWindow.getAllWindows().forEach(win => {
        try {
          win.webContents.send('systems-updated')
        } catch (e) {
          console.error('Failed to send systems-updated to window', e)
        }
      })
    }
    
    return result
  })

  ipcMain.handle('scan-save-states', async (_, systemName: string, gamePath: string) => {
    return libraryService.getGameSaveStates(systemName, gamePath)
  })

  ipcMain.handle('get-game-file-info', async (_, systemName: string, gamePath: string) => {
    const system = libraryService.getSystems().find(item => item.name.toLowerCase() === systemName.toLowerCase())
    if (!system || system.path.startsWith('virtual://')) {
      return { exists: false, path: gamePath, name: basename(gamePath), extension: extname(gamePath), size: 0 }
    }

    const physicalPath = isAbsolute(gamePath) ? resolve(gamePath) : resolve(system.path, gamePath)
    if (!isPathInside(physicalPath, system.path) || !existsSync(physicalPath)) {
      return { exists: false, path: physicalPath, name: basename(physicalPath), extension: extname(physicalPath), size: 0 }
    }

    const stats = statSync(physicalPath)
    return {
      exists: stats.isFile(),
      path: physicalPath,
      name: basename(physicalPath),
      extension: extname(physicalPath).toLowerCase(),
      size: stats.isFile() ? stats.size : 0,
      createdAt: stats.birthtimeMs,
      modifiedAt: stats.mtimeMs
    }
  })

  ipcMain.handle('update-game', async (_, systemName: string, gameData: Game) => {
    return libraryService.updateGame(systemName, gameData)
  })

  ipcMain.handle('delete-game', async (_, systemName: string, gamePath: string, deletePhysical: boolean) => {
    return libraryService.deleteGame(systemName, gamePath, deletePhysical)
  })

  ipcMain.handle('get-custom-collections', async () => {
    return libraryService.getCustomCollections()
  })

  ipcMain.handle('get-collection-games', async (_, collectionName: string) => {
    return libraryService.getCollectionGames(collectionName)
  })

  ipcMain.handle('get-collections-for-game', async (_, systemName: string, gamePath: string) => {
    return libraryService.getCollectionsForGame(systemName, gamePath)
  })

  ipcMain.handle('toggle-game-in-collection', async (_, collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove') => {
    return libraryService.toggleGameInCollection(collectionName, systemName, gamePath, action)
  })

  // ─── IPC: Themes (Stubbed for RIESCADE OS) ───
  ipcMain.handle('get-themes', async () => {
    return []
  })

  ipcMain.handle('get-active-theme', async () => {
    return 'default'
  })

  ipcMain.handle('load-theme', async (_, themeName: string) => {
    return { views: { start: '', system: '', gamelist: '' }, settings: {}, path: '' }
  })

  // ─── IPC: Settings (read-only from ES, write for UI prefs) ───
  ipcMain.handle('get-settings', async () => {
    return settingsParser.getAllSettings()
  })

  ipcMain.handle('get-gpu-diagnostics', async () => {
    try {
      const featureStatus = app.getGPUFeatureStatus()
      let gpuInfoBasic: any = null
      let gpuInfoComplete: any = null
      try {
        gpuInfoBasic = await app.getGPUInfo('basic')
      } catch (e: any) {
        gpuInfoBasic = { error: String(e) }
      }
      try {
        gpuInfoComplete = await app.getGPUInfo('complete')
      } catch (e: any) {
        gpuInfoComplete = { error: String(e) }
      }

      // Merge auxAttributes if present in complete
      if (gpuInfoBasic && gpuInfoComplete && gpuInfoComplete.auxAttributes) {
        gpuInfoBasic.auxAttributes = {
          ...(gpuInfoBasic.auxAttributes || {}),
          ...gpuInfoComplete.auxAttributes
        }
      }

      const configuredDriver = settingsParser.getSetting('RIESCADE.GpuDriver', 'string') || 'default'
      const ignoreBlocklistSetting = settingsParser.getSetting('RIESCADE.IgnoreGpuBlocklist', 'string')
      const ignoreBlocklist = ignoreBlocklistSetting === 'true' || ignoreBlocklistSetting === '1'

      return {
        configuredDriver,
        ignoreBlocklist,
        featureStatus,
        gpuInfoBasic,
        gpuInfoComplete
      }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  ipcMain.handle('get-pointing-devices', async (_, forceRefresh?: boolean) => {
    return InputDeviceService.scanPointingDevices(Boolean(forceRefresh))
  })

  ipcMain.handle('save-setting', async (_, name: string, value: any, type: 'string' | 'bool' | 'int' | 'float') => {
    const res = settingsParser.saveSetting(name, value, type)
    if (name === 'RIESCADE.FrontendDisplay') {
      applyConfiguredDisplayPreference()
    }
    if (name === 'LogLevel') {
      applyLogLevel(String(value))
    }
    
    // Broadcast setting change to main window
    sendToMainWindow('setting-changed', { name, value, type })
  })

  ipcMain.handle('save-window-bounds', async (_, windowId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    settingsParser.saveWindowBounds(windowId, bounds)
  })

  ipcMain.handle('get-emulator-settings', async () => {
    const emulatorParser = new EmulatorParser()
    return emulatorParser.getAllSettings()
  })

  ipcMain.handle('get-features', async () => {
    const filePath = join(getRiescadePath(), 'configs', 'features.json')
    if (!existsSync(filePath)) return {}
    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error parsing features.json:', error)
      return {}
    }
  })

  function triggerLauncherConfig(emulator: string) {
    if (emulator === 'global') return

    const launcherPath = join(getRiescadePath(), 'launcher', 'riescadeLauncher.exe')
    const retroBatPath = getRetroBatPath()
    
    // Map emulator ID to launcher's expected name if different
    let launcherEmuName = emulator
    if (emulator === 'libretro') {
      launcherEmuName = 'retroarch'
    }
    
    const cmd = `"${launcherPath}" -emulator "${launcherEmuName}" -system "${launcherEmuName}" -configure-only`
    console.log(`[save-emulator-setting] Triggering live config write: ${cmd}`)
    
    exec(cmd, { cwd: retroBatPath }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[save-emulator-setting] Failed to run live config for ${emulator}:`, error)
        if (stderr) console.error(`[save-emulator-setting] stderr:`, stderr)
      } else {
        console.log(`[save-emulator-setting] Live config completed successfully for ${emulator}`)
      }
    })
  }

  ipcMain.handle('save-emulator-setting', async (_, emulator: string, name: string, value: any) => {
    const emulatorParser = new EmulatorParser()
    emulatorParser.saveSetting(emulator, name, value)
    
    // Broadcast setting change to main window
    sendToMainWindow('emulator-setting-changed', { emulator, name, value })

    // Trigger live config write
    triggerLauncherConfig(emulator)
  })

  // ─── IPC: Emulator Schemas ───
  ipcMain.handle('get-emulator-schemas', async () => {
    return emulatorSchemaService.getSchemaList()
  })

  ipcMain.handle('get-emulator-schema', async (_, id: string) => {
    const targetId = id === 'libretro' ? 'retroarch' : id
    return emulatorSchemaService.getSchema(targetId)
  })

  ipcMain.handle('get-resolved-emulator-settings', async (_, emulator: string) => {
    const targetEmu = emulator === 'libretro' ? 'retroarch' : emulator
    const emulatorParser = new EmulatorParser()
    return emulatorParser.getResolvedSettings(targetEmu)
  })

  ipcMain.handle('reset-emulator-setting', async (_, emulator: string, key: string) => {
    const targetEmu = emulator === 'libretro' ? 'retroarch' : emulator
    const emulatorParser = new EmulatorParser()
    emulatorParser.resetSetting(targetEmu, key)
    sendToMainWindow('emulator-setting-changed', { emulator: targetEmu, name: key, value: 'auto' })
    triggerLauncherConfig(targetEmu)
  })

  ipcMain.handle('reset-all-emulator-settings', async (_, emulator: string) => {
    const targetEmu = emulator === 'libretro' ? 'retroarch' : emulator
    const emulatorParser = new EmulatorParser()
    emulatorParser.resetAllSettings(targetEmu)
    sendToMainWindow('emulator-settings-reset', { emulator: targetEmu })
    triggerLauncherConfig(targetEmu)
  })

  ipcMain.handle('reload-emulator-schemas', async () => {
    emulatorSchemaService.reload()
    return emulatorSchemaService.getSchemaList()
  })

  ipcMain.handle('select-bg-image', async (event) => {
    try {
      console.log('[select-bg-image] Opening file dialog...')
      const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
        ]
      })
      console.log('[select-bg-image] Dialog finished. Canceled:', result.canceled, 'Paths:', result.filePaths)
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]
        return `file:///${filePath.replace(/\\/g, '/')}`
      }
    } catch (err) {
      console.error('[select-bg-image] Error in file dialog handler:', err)
    }
    return null
  })

  ipcMain.handle('select-bg-video', async (event) => {
    try {
      console.log('[select-bg-video] Opening file dialog...')
      const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [
          { name: 'Videos', extensions: ['mp4', 'webm', 'ogg', 'mkv', 'avi'] }
        ]
      })
      console.log('[select-bg-video] Dialog finished. Canceled:', result.canceled, 'Paths:', result.filePaths)
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]
        return `file:///${filePath.replace(/\\/g, '/')}`
      }
    } catch (err) {
      console.error('[select-bg-video] Error in file dialog handler:', err)
    }
    return null
  })


  // ─── IPC: Theme Settings (Stubbed for RIESCADE OS) ───
  ipcMain.handle('get-theme-settings', async () => {
    return {}
  })

  ipcMain.handle('save-theme-setting', async () => {
    return true
  })

  ipcMain.on('system-command', (_, command: string, data?: any) => {
    if (command === 'save-input-config') {
      // Implement later if needed, handled differently in new code
      return
    }
    if (command === 'active-game-art-changed') {
      sendToMainWindow('active-game-art-changed', data)
      return
    }
    systemService.executeCommand(command)
  })

  ipcMain.handle('detect-controllers', async () => {
    return ControllerManager.getInstance().detectAll()
  })

  ipcMain.handle('rumble-controller', async (_, { instanceId, durationMs }) => {
    ControllerManager.getInstance().rumble(instanceId, durationMs)
    return true
  })

  ipcMain.handle('get-controller-state', async (_, xinputIndex: number) => {
    return ControllerManager.getInstance().getState(xinputIndex)
  })

  ipcMain.handle('save-controller-config', async (_, { guid, config }) => {
    ControllerManager.getInstance().saveConfig(guid, config)
    return true
  })

  ipcMain.handle('get-controller-configs', async () => {
    return ControllerManager.getInstance().getConfigs()
  })

  ipcMain.handle('save-input-config', async (_, data) => {
    const inputsList = data.inputs || (data.mappings ? Object.entries(data.mappings).map(([name, val]: [string, any]) => ({
      name,
      type: val.type,
      id: val.id,
      value: val.value
    })) : [])

    return ControllerManager.getInstance().saveInputConfig({
      deviceName: data.deviceName,
      deviceGUID: data.deviceGUID,
      vendorId: data.vendorId,
      productId: data.productId,
      profileId: data.profileId,
      inputs: inputsList,
      hotkey: data.hotkey,
      analog: data.analog
    })
  })

  ipcMain.handle('get-configured-controllers', async () => {
    const manager = ControllerManager.getInstance()
    // @ts-ignore
    const configs = manager.inputJsonData.inputConfigs || []
    return configs.map((cfg: any) => ({
      name: cfg.device?.deviceName || 'Unknown Device',
      guid: cfg.device?.deviceGUID || '',
      vendorId: cfg.device?.vendorId,
      productId: cfg.device?.productId,
      profileId: cfg.profileId,
      type: cfg.type || 'joystick'
    }))
  })

  ipcMain.handle('get-sdl-version', async () => {
    return ControllerManager.getInstance().sdlVersion
  })

  ipcMain.handle('export-debug-report', async (_, recentEvents?: any[]) => {
    const os = require('os')
    const manager = ControllerManager.getInstance()
    // @ts-ignore
    const inputJsonRaw = manager.inputJsonData
    return {
      riescadeVersion: app.getVersion(),
      osVersion: `${os.type()} ${os.release()} (${os.arch()})`,
      sdlVersion: manager.sdlVersion,
      activeControllers: manager.getConnected(),
      inputConfigs: inputJsonRaw,
      recentEvents: recentEvents || []
    }
  })

  ipcMain.handle('get-bluetooth-devices', async () => {
    return new Promise((resolve) => {
      const { execFileSync } = require('child_process')
      try {
        const stdout = execFileSync('powershell', [
          '-Command',
          'Get-PnpDevice -Class Bluetooth | Where-Object { $_.FriendlyName -and $_.InstanceId -like "*DEV_*" } | Select-Object -Property FriendlyName, InstanceId | ConvertTo-Json'
        ], { encoding: 'utf8' }).trim()
        
        if (stdout) {
          const parsed = JSON.parse(stdout)
          const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
          resolve(list.map((d: any) => ({
            name: d.FriendlyName || 'Unknown Bluetooth Device',
            id: d.InstanceId || ''
          })))
        } else {
          resolve([])
        }
      } catch (err) {
        console.error('Error running bluetooth command:', err)
        resolve([])
      }
    })
  })

  ipcMain.handle('get-version', async () => {
    let esVersion = 'unknown'
    try {
      const versionFile = join(getRetroBatPath(), 'emulationstation', 'version.info')
      if (existsSync(versionFile)) {
        esVersion = readFileSync(versionFile, 'utf-8').trim()
      }
    } catch (e) {
      console.error('Failed to read version.info:', e)
    }
    
    return {
      app: app.getVersion(),
      es: esVersion
    }
  })

  ipcMain.handle('get-hostname', async () => {
    return require('os').hostname()
  })

  ipcMain.handle('check-battery-exists', async () => {
    return new Promise<boolean>((resolve) => {
      if (process.platform !== 'win32') {
        resolve(false);
        return;
      }
      exec('powershell -Command "Get-CimInstance Win32_Battery"', (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        resolve(stdout.trim().length > 0);
      });
    });
  })

  ipcMain.handle('clean-gamelists', async () => {
    return libraryService.cleanGamelists()
  })

  ipcMain.handle('reset-gamelist-usage', async () => {
    return libraryService.resetGamelistUsage()
  })

  ipcMain.handle('reset-file-extensions', async () => {
    return libraryService.resetFileExtensions()
  })

  ipcMain.handle('clear-caches', async () => {
    return libraryService.clearCaches()
  })

  ipcMain.handle('get-bios-information', async () => {
    const cmdPath = join(getRetroBatPath(), 'emulationstation', 'batocera-systems.exe')
    return new Promise((resolve) => {
      exec(`"${cmdPath}"`, (error, stdout) => {
        if (error) {
          console.error('Error running batocera-systems:', error)
          resolve([])
          return
        }
        
        const lines = stdout.split(/\r?\n/)
        const systems: any[] = []
        let currentSystem: any = null

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('> ')) {
            if (currentSystem) {
              systems.push(currentSystem)
            }
            currentSystem = {
              name: trimmed.substring(2).trim(),
              bios: []
            }
          } else if (currentSystem) {
            const tokens = trimmed.split(/\s+/)
            if (tokens.length >= 3) {
              const status = tokens[0]
              const md5 = tokens[1]
              const path = tokens.slice(2).join(' ')
              currentSystem.bios.push({ status, md5, path })
            }
          }
        }
        if (currentSystem) {
          systems.push(currentSystem)
        }
        resolve(systems)
      })
    })
  })

  ipcMain.handle('get-file-content', async (_, filePath: string) => {
    try {
      const allowedPath = resolveAllowedAppPath(filePath)
      if (existsSync(allowedPath)) {
        return await fsPromises.readFile(allowedPath, 'utf-8')
      }
      return null
    } catch (e) {
      console.error('Failed to read file content:', e)
      return null
    }
  })

  ipcMain.handle('check-file-exists', async (_, filePath: string) => {
    try {
      await fsPromises.access(resolveAllowedAppPath(filePath))
      return true
    } catch (e) {
      return false
    }
  })

  ipcMain.handle('get-overlay-path', async (_, name: string) => {
    const file = join(getResourcesPath(), 'overlay', name)
    return existsSync(file) ? `file:///${file.replace(/\\/g, '/')}` : ''
  })

  ipcMain.handle('get-riescade-logo-path', async () => {
    let file = join(getResourcesPath(), 'riescade.webp')
    if (!existsSync(file)) {
      file = join(getRiescadePath(), 'resources', 'riescade.webp')
    }
    return existsSync(file) ? `file:///${file.replace(/\\/g, '/')}` : ''
  })

  ipcMain.handle('get-music-files', async (_, subfolder?: string) => {
    try {
      const { readdirSync, statSync, existsSync, mkdirSync } = require('fs')
      const { extname, basename } = require('path')
      const baseDir = getMusicPath()
      const targetDir = subfolder ? join(baseDir, subfolder) : baseDir
      
      if (!existsSync(baseDir)) {
        mkdirSync(baseDir, { recursive: true })
      }
      if (!existsSync(join(baseDir, 'systems'))) {
        mkdirSync(join(baseDir, 'systems'), { recursive: true })
      }
      if (!existsSync(join(baseDir, 'favorites'))) {
        mkdirSync(join(baseDir, 'favorites'), { recursive: true })
      }
      
      if (!existsSync(targetDir)) return []
      
      const files = readdirSync(targetDir)
      const allowedExtensions = ['.mp3', '.ogg', '.wav', '.mp4', '.m4a', '.flac', '.aac']
      
      const results: { name: string; relativePath: string; url: string }[] = []
      for (const file of files) {
        const fullPath = join(targetDir, file)
        const stat = statSync(fullPath)
        if (stat.isFile() && allowedExtensions.includes(extname(file).toLowerCase())) {
          const relPath = subfolder ? `${subfolder}/${file}` : file
          const cleanName = basename(file, extname(file)).replace(/_/g, ' ')
          const fileUrl = `file:///${fullPath.replace(/\\/g, '/')}`
          results.push({
            name: cleanName,
            relativePath: relPath,
            url: fileUrl
          })
        }
      }
      return results
    } catch (e) {
      console.error('Failed to get music files:', e)
      return []
    }
  })

  ipcMain.handle('get-music-path', async () => {
    return getMusicPath()
  })

  ipcMain.handle('start-scrape', async (event, options?: { systemName?: string; gamePath?: string }) => {
    if (scraperService.isActive()) return false
    void scraperService.scrape(options, event.sender)
    return true
  })

  ipcMain.handle('cancel-scrape', async () => {
    scraperService.cancel()
    return true
  })

  ipcMain.handle('submit-manual-scrape-query', async (event, query: string) => {
    scraperService.resolveManualSearch(query)
    return true
  })

  ipcMain.handle('cancel-manual-scrape', async () => {
    scraperService.resolveManualSearch(null)
    return true
  })

  ipcMain.handle('test-screenscraper', async (event, ssid, sspassword) => {
    try {
      const devid = 'retrobat'
      const devpassword = 'JRLmOtnZXwo'
      const softname = 'retrobat'
      
      let url = `https://api.screenscraper.fr/api2/ssuserInfos.php?devid=${devid}&devpassword=${devpassword}&softname=${softname}&output=json`
      if (ssid) {
        url += `&ssid=${encodeURIComponent(ssid)}`
      }
      if (sspassword) {
        url += `&sspassword=${encodeURIComponent(sspassword)}`
      }
      
      const response = await fetch(url)
      if (!response.ok) {
        return { success: false, reason: `Erro HTTP: ${response.status}` }
      }
      
      const json = await response.json()
      const user = json.response?.ssuser
      
      if (!user || user.numid === '0' || !user.numid) {
        return { success: false, reason: 'Usuário ou senha incorretos.' }
      }
      
      const requestsToday = parseInt(user.requeststoday || '0', 10)
      const maxRequests = parseInt(user.maxrequestsperday || '0', 10)
      const requestsRemaining = maxRequests - requestsToday
      const motors = parseInt(
        user.maxthreads
          || user.maxThreads
          || user.threads
          || user.moteurs
          || json.response?.maxthreads
          || '1',
        10
      )
      const availableMotors = String(Number.isFinite(motors) && motors > 0 ? motors : 1)
      settingsParser.saveSetting('ScreenScraperMotors', availableMotors, 'int')
      
      return { 
        success: true, 
        username: user.id || ssid, 
        requests: String(requestsRemaining), 
        maxRequests: String(maxRequests),
        motors: availableMotors,
        maxThreads: availableMotors
      }
    } catch (err: any) {
      return { success: false, reason: err.message || 'Falha na conexão.' }
    }
  })

  // Helper functions for scrapers
  async function queryScreenScraper(
    systemName: string,
    gameName: string,
    gamePath: string | undefined,
    preferredRegion: string,
    systemLanguage: string,
    ssid: string,
    sspassword: string,
    systemId: number
  ): Promise<any[]> {
    const devid = 'retrobat'
    const devpassword = 'JRLmOtnZXwo'
    const softname = 'retrobat'

    let jeux: any[] = []

    if (gamePath) {
      const romName = basename(gamePath)
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

      try {
        const response = await fetch(url)
        if (response.ok) {
          const json = await response.json()
          const jeu = json.response?.jeu
          if (jeu) {
            jeux = [jeu]
          }
        }
      } catch (err) {
        console.error('ScreenScraper romnom search failed:', err)
      }
    }

    if (jeux.length === 0) {
      let cleanedName = gameName.replace(/\.[a-zA-Z0-9]{2,4}$/, '')
      cleanedName = cleanedName.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
      cleanedName = cleanedName.replace(/[_-]/g, ' ')
      cleanedName = cleanedName.replace(/\s+/g, ' ').trim()
      if (!cleanedName) cleanedName = gameName

      let url = `https://api.screenscraper.fr/api2/jeuInfos.php?devid=${devid}&devpassword=${devpassword}&softname=${softname}&output=json&recherche=${encodeURIComponent(cleanedName)}`
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
      if (response.ok) {
        const json = await response.json()
        if (json.response?.jeux) {
          jeux = Array.isArray(json.response.jeux) ? json.response.jeux : [json.response.jeux]
        } else if (json.response?.jeu) {
          jeux = Array.isArray(json.response.jeu) ? json.response.jeu : [json.response.jeu]
        }
      } else {
        throw new Error(`ScreenScraper returned status ${response.status}`)
      }
    }

    const getRipList = (imageSource: string): string[] => {
      if (imageSource === 'ss') return ['ss', 'sstitle']
      if (imageSource === 'sstitle') return ['sstitle', 'ss']
      if (imageSource === 'mixrbv1' || imageSource === 'mixrbv') return ['mixrbv1', 'mixrbv2', 'fanart', 'ss', 'sstitle']
      if (imageSource === 'mixrbv2') return ['mixrbv2', 'mixrbv1', 'fanart', 'ss', 'sstitle']
      if (imageSource === 'box-2D') return ['box-2D', 'box-3D', 'cover']
      if (imageSource === 'box-3D') return ['box-3D', 'box-2D', 'cover']
      if (imageSource === 'wheel') return ['wheel', 'wheel-hd', 'wheel-steel', 'wheel-carbon', 'screenmarqueesmall', 'screenmarquee', 'logo']
      if (imageSource === 'wheel-hd') return ['wheel-hd', 'wheel', 'wheel-steel', 'wheel-carbon', 'screenmarqueesmall', 'screenmarquee', 'logo']
      if (imageSource === 'marquee') return ['screenmarqueesmall', 'screenmarquee', 'wheel', 'wheel-hd', 'wheel-steel', 'wheel-carbon', 'logo']
      if (imageSource === 'video') return ['video-normalized', 'video']
      return [imageSource]
    }

    const imageSrc = settingsParser.getSetting('ScrapperImageSrc', 'string') || 'mixrbv2'
    const thumbSrc = settingsParser.getSetting('ScrapperThumbSrc', 'string') || 'box-2D'
    const logoSrc = settingsParser.getSetting('ScrapperLogoSrc', 'string') || 'wheel-hd'

    const findMediaUrl = (medias: any[], typeList: string[]): string | undefined => {
      if (!medias || !Array.isArray(medias)) return undefined
      const regions = [preferredRegion, 'wor', 'us', 'eu', 'jp', 'ss', '']
      for (const type of typeList) {
        for (const reg of regions) {
          const match = medias.find(m => m.type === type && (reg === '' || String(m.region || '').toLowerCase() === reg.toLowerCase()))
          if (match && match.url) {
            return match.url
          }
        }
      }
      const fallback = medias.find(m => typeList.includes(m.type) && m.url)
      return fallback ? fallback.url : undefined
    }

    const results: any[] = []
    for (const jeu of jeux) {
      const noms = jeu.noms || []
      const regions = [preferredRegion, 'wor', 'us', 'eu', 'jp', 'ss', '']
      let gameNameParsed = ''
      for (const reg of regions) {
        const nomMatch = noms.find((n: any) => reg === '' || String(n.region || '').toLowerCase() === reg.toLowerCase())
        if (nomMatch) {
          gameNameParsed = nomMatch.text
          break
        }
      }
      if (!gameNameParsed && noms.length > 0) gameNameParsed = noms[0].text
      if (!gameNameParsed) gameNameParsed = gameName

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

      results.push({
        id: String(jeu.id),
        name: gameNameParsed,
        db: 'ScreenScraper',
        releasedate: relDate,
        developer: gameDev,
        publisher: gamePub,
        genre: gameGenre,
        rating: gameRating,
        desc: gameDesc,
        players: gamePlayers,
        media: {
          image: findMediaUrl(jeu.medias, getRipList(imageSrc)),
          thumbnail: findMediaUrl(jeu.medias, getRipList(thumbSrc)),
          marquee: findMediaUrl(jeu.medias, getRipList(logoSrc)),
          video: findMediaUrl(jeu.medias, getRipList('video'))
        }
      })
    }

    return results
  }

  ipcMain.handle('search-game-media', async (_, systemName: string, gameName: string, _databases: string[], gamePath?: string) => {
    try {
      const preferredRegion = settingsParser.getSetting('ScraperRegion', 'string') || 'eu'
      const configuredLanguage = settingsParser.getSetting('Language', 'string') || 'auto'
      const systemLanguage = (configuredLanguage === 'auto'
        ? app.getLocale()
        : configuredLanguage).substring(0, 2).toLowerCase()

      const ssid = settingsParser.getSetting('ScreenScraperUser', 'string') || ''
      const sspassword = settingsParser.getSetting('ScreenScraperPass', 'string') || ''

      const systemInfo = libraryService.getSystems().find(s => s.name === systemName)
      const systemId = SYSTEM_TO_SCREENSCRAPER_PLATFORM[systemName.toLowerCase()] || 
                       (systemInfo ? SYSTEM_TO_SCREENSCRAPER_PLATFORM[systemInfo.platform.toLowerCase()] : 0)

      const results = await queryScreenScraper(
        systemName,
        gameName,
        gamePath,
        preferredRegion,
        systemLanguage,
        ssid,
        sspassword,
        systemId
      )

      if (results.length === 0) {
        throw new Error('CONFIGURAÇÃO INCOMPLETA: Credenciais ausentes ou inválidas nas configurações do menu.')
      }

      return results
    } catch (e: any) {
      console.error('search-game-media error:', e)
      throw e
    }
  })

  ipcMain.handle('download-game-media', async (_, systemName: string, gamePath: string, matchData: any) => {
    try {
      const systems = libraryService.getSystems()
      const system = systems.find(s => s.name === systemName)
      if (!system) throw new Error(`System ${systemName} not found`)

      const games = libraryService.getGames(systemName)
      const game = games.find(g => g.path === gamePath)
      if (!game) throw new Error(`Game ${gamePath} not found in system ${systemName}`)

      const mediaFolder = join(system.path, 'media')
      const romName = basename(game.path)
      const romNameNoExt = romName.replace(/\.[^/.]+$/, '')

      const updatedFields: Partial<Game> = {}

      if (matchData.media?.image) {
        const destPathWithoutExt = join(mediaFolder, 'fanart', romNameNoExt)
        const ext = await downloadFile(matchData.media.image, destPathWithoutExt, 'png')
        updatedFields.image = `./media/fanart/${romNameNoExt}.${ext}`
      }

      if (matchData.media?.thumbnail) {
        const destPathWithoutExt = join(mediaFolder, 'cover', romNameNoExt)
        const ext = await downloadFile(matchData.media.thumbnail, destPathWithoutExt, 'png')
        updatedFields.thumbnail = `./media/cover/${romNameNoExt}.${ext}`
      }

      if (matchData.media?.marquee) {
        const destPathWithoutExt = join(mediaFolder, 'logo', romNameNoExt)
        const ext = await downloadFile(matchData.media.marquee, destPathWithoutExt, 'png')
        updatedFields.marquee = `./media/logo/${romNameNoExt}.${ext}`
      }

      if (matchData.media?.video) {
        const destPathWithoutExt = join(mediaFolder, 'video', romNameNoExt)
        const ext = await downloadFile(matchData.media.video, destPathWithoutExt, 'mp4')
        updatedFields.video = `./media/video/${romNameNoExt}.${ext}`
      }

      if (matchData.name) updatedFields.name = matchData.name
      if (matchData.desc) updatedFields.desc = matchData.desc
      if (matchData.developer) updatedFields.developer = matchData.developer
      if (matchData.publisher) updatedFields.publisher = matchData.publisher
      if (matchData.genre) updatedFields.genre = matchData.genre
      if (matchData.players) updatedFields.players = matchData.players
      if (matchData.rating !== undefined) updatedFields.rating = matchData.rating
      if (matchData.releasedate) updatedFields.releasedate = matchData.releasedate

      const updatedGame = { ...game, ...updatedFields }
      await libraryService.updateGame(systemName, updatedGame)
      return updatedGame
    } catch (e: any) {
      console.error('download-game-media error:', e)
      throw e
    }
  })

  ipcMain.handle('download-temp-media', async (_, url: string) => {
    try {
      if (!url || typeof url !== 'string') return ''
      const crypto = require('crypto')
      const hash = crypto.createHash('md5').update(url).digest('hex')
      const tempDir = join(app.getPath('temp'), 'riescade-scraper')
      const destPathWithoutExt = join(tempDir, hash)
      
      const fs = require('fs')
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mkv', 'webm']
      for (const ext of extensions) {
        const checkPath = `${destPathWithoutExt}.${ext}`
        if (fs.existsSync(checkPath)) {
          return checkPath
        }
      }

      const defaultExt = url.includes('.mp4') || url.includes('video') ? 'mp4' : 'png'
      const ext = await downloadFile(url, destPathWithoutExt, defaultExt)
      return `${destPathWithoutExt}.${ext}`
    } catch (e) {
      console.error('download-temp-media error:', e)
      return ''
    }
  })


  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (romsWatcher) {
    romsWatcher.stop()
    romsWatcher = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function downloadFile(url: string, destPathWithoutExt: string, defaultExt: string): Promise<string> {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:' || !(parsedUrl.hostname === 'screenscraper.fr' || parsedUrl.hostname.endsWith('.screenscraper.fr'))) {
    throw new Error('Download de mídia bloqueado: somente ScreenScraper é permitido.')
  }
  if (!isPathInside(destPathWithoutExt, getRetroBatPath())) {
    throw new Error('Destino de mídia externo ao RIESCADE OS.')
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`)
  }

  let ext = defaultExt
  const contentType = response.headers.get('content-type')
  if (contentType) {
    const mime = contentType.toLowerCase().split(';')[0].trim()
    if (mime === 'image/png') ext = 'png'
    else if (mime === 'image/jpeg' || mime === 'image/jpg') ext = 'jpg'
    else if (mime === 'image/gif') ext = 'gif'
    else if (mime === 'image/webp') ext = 'webp'
    else if (mime === 'video/mp4') ext = 'mp4'
    else if (mime === 'video/mkv') ext = 'mkv'
    else if (mime === 'video/webm') ext = 'webm'
    else {
      const parts = mime.split('/')
      if (parts.length === 2 && (parts[0] === 'image' || parts[0] === 'video')) {
        const temp = parts[1]
        if (temp && temp.length > 0 && temp !== 'octet-stream') {
          ext = temp
        }
      }
    }
  } else {
    try {
      const parsed = new URL(url)
      const pathExt = extname(parsed.pathname)
      if (pathExt && pathExt.length > 1) {
        const temp = pathExt.substring(1).toLowerCase()
        if (temp !== 'php') {
          ext = temp
        }
      }
    } catch (e) {
      console.debug(`[Media] Could not infer extension from URL ${url}.`, e)
    }
  }

  if (!ext || ext.length > 5 || ext === 'php') {
    ext = defaultExt
  }

  const destPath = `${destPathWithoutExt}.${ext}`
  const dir = dirname(destPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destPath, buffer)
  return ext
}
