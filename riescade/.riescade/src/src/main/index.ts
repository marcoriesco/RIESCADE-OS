import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname, extname, basename } from 'path'
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
import { RomsWatcherService } from './services/RomsWatcherService'
import { registerUpdaterIpc } from './services/UpdaterService'
import { Game, System } from '../shared/types'
import { ControllerManager } from './services/ControllerManager'
import { watch, FSWatcher, readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { getRetroBatPath, getConfigPath, getResourcesPath, getRiescadePath, getDatabasePath } from './utils/paths'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import { SYSTEM_TO_SCREENSCRAPER_PLATFORM } from './services/ScraperService'

const libraryService = new LibraryService()
const launcherService = new LauncherService()
const settingsParser = new SettingsParser()
const systemService = new SystemService(libraryService)
const scraperService = new ScraperService(libraryService)

// Configure Chromium GPU graphics backend switches based on user settings
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
const gpuDriver = settingsParser.getSetting('RIESCADE.GpuDriver', 'string')
if (gpuDriver && gpuDriver !== 'default') {
  if (gpuDriver === 'd3d12') {
    app.commandLine.appendSwitch('use-angle', 'd3d12')
  } else if (gpuDriver === 'opengl') {
    app.commandLine.appendSwitch('use-gl', 'desktop')
  } else if (gpuDriver === 'vulkan') {
    app.commandLine.appendSwitch('use-angle', 'vulkan')
    app.commandLine.appendSwitch('enable-features', 'Vulkan')
  } else if (gpuDriver === 'software') {
    app.commandLine.appendSwitch('disable-gpu')
  } else if (gpuDriver === 'd3d11') {
    app.commandLine.appendSwitch('use-angle', 'd3d11')
  }
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
      sandbox: false,
      webSecurity: false
    }
  }
  
  if (savedX !== null && savedY !== null) {
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
  electronApp.setAppUserModelId('com.riescade')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Start polling game controllers and emit changes to the frontend
  const controllerManager = ControllerManager.getInstance()
  controllerManager.startPolling((controllers) => {
    sendToMainWindow('controllers-updated', controllers)
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
    } catch {}

    const totalGamesRow = db.prepare('SELECT COUNT(*) as count FROM games').get() as any
    const totalSystemsRow = db.prepare("SELECT COUNT(*) as count FROM systems WHERE name != '__es_systems.cfg'").get() as any
    const lastSyncRow = db.prepare('SELECT MAX(last_scan_at) as last_scan FROM systems').get() as any

    return {
      totalGames: totalGamesRow?.count || 0,
      totalSystems: totalSystemsRow?.count || 0,
      dbSize,
      lastSyncAt: lastSyncRow?.last_scan || 0
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
    const folders = ['cover', 'cover3d', 'coverback', 'fanart', 'logo', 'marquee', 'screenshot', 'title', 'mix', 'video', 'manual']
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

    for (const f of folders) {
      results[f] = fs.existsSync(join(systemPath, 'media', f))
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

  ipcMain.handle('download-install-emulator', async (event, emulatorName: string, sourceUrl: string) => {
    return EmulatorInstaller.downloadAndInstall(emulatorName, sourceUrl, (pct) => {
      event.sender.send('emulator-download-progress', { emulatorName, pct })
    })
  })

  ipcMain.handle('launch-game', async (_, game: Game, system: System, saveStateSlot?: number) => {
    let targetSystem = system
    if (system.name === 'collections') {
      const realSystem = libraryService.getSystems().find(s => s.name.toLowerCase() === game.system.toLowerCase())
      if (realSystem) {
        targetSystem = realSystem
      }
    }

    const result = await launcherService.launch(game, targetSystem, ControllerManager.getInstance().getConnected(), saveStateSlot)
    
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

  ipcMain.handle('save-setting', async (_, name: string, value: any, type: 'string' | 'bool' | 'int' | 'float') => {
    const res = settingsParser.saveSetting(name, value, type)
    
    // Broadcast setting change to main window
    sendToMainWindow('setting-changed', { name, value, type })
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

  ipcMain.handle('save-emulator-setting', async (_, emulator: string, name: string, value: any) => {
    const emulatorParser = new EmulatorParser()
    emulatorParser.saveSetting(emulator, name, value)
    
    // Broadcast setting change to main window
    sendToMainWindow('emulator-setting-changed', { emulator, name, value })
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

  ipcMain.handle('save-input-config', async (_, { deviceName, deviceGUID, mappings }) => {
    const configPath = join(getConfigPath(), 'es_input.cfg')
    const lastConfigPath = join(getConfigPath(), 'es_last_input.cfg')

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: true,
      ignoreDeclaration: true
    })
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: true,
      ignoreDeclaration: true
    })

    let jsonObj: any = { inputList: { inputConfig: [] } }
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8')
        jsonObj = parser.parse(content)
        if (!jsonObj.inputList) jsonObj.inputList = {}
        if (!jsonObj.inputList.inputConfig) jsonObj.inputList.inputConfig = []
        if (!Array.isArray(jsonObj.inputList.inputConfig)) {
          jsonObj.inputList.inputConfig = [jsonObj.inputList.inputConfig]
        }
      } catch (err) {
        console.error('Failed to parse es_input.cfg:', err)
      }
    }

    // Filter out existing mapping with the same GUID or Name
    jsonObj.inputList.inputConfig = jsonObj.inputList.inputConfig.filter(
      (cfg: any) => cfg['@_deviceGUID'] !== deviceGUID && cfg['@_deviceName'] !== deviceName
    )

    // Construct the new mapping config
    const newInputConfig: any = {
      '@_type': 'joystick',
      '@_deviceName': deviceName,
      '@_deviceGUID': deviceGUID,
      input: Object.entries(mappings).map(([name, val]: [string, any]) => ({
        '@_name': name,
        '@_type': val.type,
        '@_id': String(val.id),
        '@_value': String(val.value)
      }))
    }

    jsonObj.inputList.inputConfig.push(newInputConfig)

    // Build the XML content
    try {
      const xmlContent = '<?xml version="1.0"?>\n' + builder.build(jsonObj)
      writeFileSync(configPath, xmlContent, 'utf-8')

      // Also write to es_last_input.cfg containing ONLY the last configured controller
      const lastJsonObj = {
        inputList: {
          inputConfig: [newInputConfig]
        }
      }
      const lastXmlContent = '<?xml version="1.0"?>\n' + builder.build(lastJsonObj)
      writeFileSync(lastConfigPath, lastXmlContent, 'utf-8')
      
      console.log('Successfully saved controller config for:', deviceName)
      return true
    } catch (err) {
      console.error('Failed to write es_input.cfg:', err)
      return false
    }
  })

  ipcMain.handle('get-configured-controllers', async () => {
    const configPath = join(getConfigPath(), 'es_input.cfg')
    if (!existsSync(configPath)) return []
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseAttributeValue: true,
        ignoreDeclaration: true
      })
      const content = readFileSync(configPath, 'utf-8')
      const jsonObj = parser.parse(content)
      const configs = jsonObj.inputList?.inputConfig
      if (!configs) return []
      const configList = Array.isArray(configs) ? configs : [configs]
      return configList.map((cfg: any) => ({
        name: cfg['@_deviceName'],
        guid: cfg['@_deviceGUID'],
        type: cfg['@_type']
      }))
    } catch (err) {
      console.error('Failed to read configured controllers:', err)
      return []
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
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8')
      }
      return null
    } catch (e) {
      console.error('Failed to read file content:', e)
      return null
    }
  })

  ipcMain.handle('check-file-exists', async (_, filePath: string) => {
    try {
      if (!filePath) return false
      let cleanPath = filePath
      if (cleanPath.startsWith('file:///')) {
        cleanPath = cleanPath.substring(8)
      }
      return existsSync(cleanPath)
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
      const { readdirSync, statSync } = require('fs')
      const { extname } = require('path')
      const baseDir = join(getConfigPath(), 'music')
      const targetDir = subfolder ? join(baseDir, subfolder) : baseDir
      
      if (!existsSync(targetDir)) return []
      
      const files = readdirSync(targetDir)
      const allowedExtensions = ['.mp3', '.ogg', '.wav', '.mp4', '.m4a', '.aac']
      
      const results: string[] = []
      for (const file of files) {
        const fullPath = join(targetDir, file)
        const stat = statSync(fullPath)
        if (stat.isFile() && allowedExtensions.includes(extname(file).toLowerCase())) {
          const relPath = subfolder ? `${subfolder}/${file}` : file
          results.push(relPath)
        }
      }
      return results
    } catch (e) {
      console.error('Failed to get music files:', e)
      return []
    }
  })

  ipcMain.handle('get-music-path', async () => {
    return join(getConfigPath(), 'music')
  })

  ipcMain.handle('start-scrape', async (event, options?: { systemName?: string; gamePath?: string }) => {
    scraperService.scrape(options)
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
      
      let url = `https://api.screenscraper.fr/api2/systemesListe.php?devid=${devid}&devpassword=${devpassword}&softname=${softname}&output=json`
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
      
      return { 
        success: true, 
        username: user.id || ssid, 
        requests: String(requestsRemaining), 
        maxRequests: String(maxRequests) 
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

  async function queryArcadeDB(gameName: string): Promise<any[]> {
    let cleanName = gameName.replace(/\.[a-zA-Z0-9]{2,4}$/, '')
    cleanName = cleanName.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    cleanName = cleanName.replace(/[_-]/g, '')
    cleanName = cleanName.replace(/[\s.]/g, '').toLowerCase().trim()
    if (!cleanName) cleanName = gameName.toLowerCase().replace(/[\s.]/g, '')

    const url = `http://adb.arcadeitalia.net/service_scraper.php?ajax=query_mame&lang=en&use_parent=1&game_name=${encodeURIComponent(cleanName)}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`ArcadeDB status ${response.status}`)
    }

    const json = await response.json()
    if (!json.result || !Array.isArray(json.result)) {
      return []
    }

    const results: any[] = []
    for (const game of json.result) {
      const gameNameParsed = game.short_title || game.title || gameName
      let relDate = ''
      if (game.year) {
        relDate = `${game.year}0101T000000`
      }

      results.push({
        id: `arcadedb-${gameNameParsed.replace(/\s+/g, '-').toLowerCase()}`,
        name: gameNameParsed,
        db: 'ArcadeDB',
        releasedate: relDate,
        developer: game.manufacturer || '',
        publisher: game.manufacturer || '',
        genre: game.genre || '',
        rating: undefined,
        desc: game.history || '',
        players: game.players ? String(game.players) : '',
        media: {
          image: game.url_image_ingame || game.url_image_flyer || '',
          thumbnail: game.url_image_flyer || game.url_image_ingame || '',
          marquee: game.url_image_marquee || game.url_image_title || '',
          video: game.url_video_shortplay_hd || game.url_video_shortplay || ''
        }
      })
    }

    return results
  }

  async function queryIGDB(gameName: string, clientID: string, secret: string): Promise<any[]> {
    if (!clientID || !secret) {
      throw new Error('CREDENCIAIS_AUSENTES: IGDB Client ID ou Client Secret ausentes.')
    }

    const authUrl = 'https://id.twitch.tv/oauth2/token'
    const tokenResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `client_id=${encodeURIComponent(clientID)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`
    })

    if (!tokenResponse.ok) {
      throw new Error(`IGDB OAuth falhou com status ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    if (!accessToken) {
      throw new Error('IGDB OAuth falhou em obter token de acesso.')
    }

    let cleanedName = gameName.replace(/\.[a-zA-Z0-9]{2,4}$/, '')
    cleanedName = cleanedName.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    cleanedName = cleanedName.replace(/[_-]/g, ' ')
    cleanedName = cleanedName.replace(/\s+/g, ' ').trim()
    if (!cleanedName) cleanedName = gameName

    const searchUrl = 'https://api.igdb.com/v4/games'
    const query = `fields id, name, platforms.name, genres.name, game_modes.name, multiplayer_modes.offlinemax, release_dates.date, release_dates.region, release_dates.platform, cover.*, screenshots.*, artworks.*, url, summary, aggregated_rating, involved_companies.company.name, involved_companies.developer, involved_companies.publisher; search "${cleanedName}"; limit 10;`

    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Client-ID': clientID,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
        'Accept': 'application/json'
      },
      body: query
    })

    if (!searchResponse.ok) {
      throw new Error(`IGDB Search falhou com status ${searchResponse.status}`)
    }

    const games = await searchResponse.json()
    if (!Array.isArray(games)) return []

    const results: any[] = []
    for (const game of games) {
      let dev = ''
      let pub = ''
      if (game.involved_companies && Array.isArray(game.involved_companies)) {
        for (const comp of game.involved_companies) {
          const name = comp.company?.name
          if (name) {
            if (comp.developer) dev = name
            if (comp.publisher) pub = name
          }
        }
      }

      let relDate = ''
      if (game.release_dates && Array.isArray(game.release_dates) && game.release_dates.length > 0) {
        const timestamp = game.release_dates[0].date
        if (timestamp) {
          const dateObj = new Date(timestamp * 1000)
          relDate = dateObj.toISOString().replace(/[-:]/g, '').split('.')[0] + 'T000000'
        }
      }

      const genreStr = game.genres ? game.genres.map((g: any) => g.name).join(', ') : ''
      const playersStr = game.multiplayer_modes ? String(Math.max(...game.multiplayer_modes.map((m: any) => m.offlinemax || 1))) : ''
      const ratingNum = game.aggregated_rating ? game.aggregated_rating / 100 : undefined

      results.push({
        id: `igdb-${game.id}`,
        name: game.name || gameName,
        db: 'IGDB',
        releasedate: relDate,
        developer: dev,
        publisher: pub,
        genre: genreStr,
        rating: ratingNum,
        desc: game.summary || '',
        players: playersStr,
        media: {
          image: game.screenshots && game.screenshots.length > 0 ? `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${game.screenshots[0].image_id}.jpg` : '',
          thumbnail: game.cover ? `https://images.igdb.com/igdb/image/upload/t_original/${game.cover.image_id}.jpg` : '',
          marquee: game.artworks && game.artworks.length > 0 ? `https://images.igdb.com/igdb/image/upload/t_1080p/${game.artworks[0].image_id}.jpg` : '',
          video: ''
        }
      })
    }

    return results
  }

  async function queryTheGamesDB(gameName: string, apiKey: string, configPath: string): Promise<any[]> {
    if (!apiKey) {
      throw new Error('CREDENCIAIS_AUSENTES: TheGamesDB API key ausente.')
    }

    let cleanedName = gameName.replace(/\.[a-zA-Z0-9]{2,4}$/, '')
    cleanedName = cleanedName.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    cleanedName = cleanedName.replace(/[_-]/g, ' ')
    cleanedName = cleanedName.replace(/\s+/g, ' ').trim()
    if (!cleanedName) cleanedName = gameName

    const url = `https://api.thegamesdb.net/v1/Games/ByGameName?apikey=${apiKey}&fields=players,publishers,genres,overview,last_updated,rating,platform,alternates&include=boxart&name=${encodeURIComponent(cleanedName)}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`TheGamesDB status ${response.status}`)
    }

    const json = await response.json()
    if (!json.data || !json.data.games || !Array.isArray(json.data.games)) {
      return []
    }

    let devMap: any = {}
    let pubMap: any = {}
    let genMap: any = {}

    try {
      const fs = require('fs')
      const joinPath = require('path').join
      const devFile = joinPath(configPath, 'scrapers', 'gamesdb_developers.json')
      const pubFile = joinPath(configPath, 'scrapers', 'gamesdb_publishers.json')
      const genFile = joinPath(configPath, 'scrapers', 'gamesdb_genres.json')

      if (fs.existsSync(devFile)) devMap = JSON.parse(fs.readFileSync(devFile, 'utf-8'))?.data?.developers || {}
      if (fs.existsSync(pubFile)) pubMap = JSON.parse(fs.readFileSync(pubFile, 'utf-8'))?.data?.publishers || {}
      if (fs.existsSync(genFile)) genMap = JSON.parse(fs.readFileSync(genFile, 'utf-8'))?.data?.genres || {}
    } catch (err) {
      console.error('Failed to parse TheGamesDB JSON maps:', err)
    }

    const getMappedNames = (ids: any[], map: any) => {
      if (!ids || !Array.isArray(ids)) return ''
      return ids.map(id => map[id]?.name || map[id] || String(id)).join(', ')
    }

    const boxartInclude = json.include?.boxart || {}
    const baseUrlLarge = boxartInclude.base_url?.large || 'https://legacy.thegamesdb.net/images/original/'

    const results: any[] = []
    for (const game of json.data.games) {
      let relDate = ''
      if (game.release_date) {
        relDate = game.release_date.replace(/-/g, '') + 'T000000'
      }

      const devStr = getMappedNames(game.developers, devMap)
      const pubStr = getMappedNames(game.publishers, pubMap)
      const genreStr = getMappedNames(game.genres, genMap)

      let frontBoxart = ''
      const gameId = String(game.id)
      if (boxartInclude.data && boxartInclude.data[gameId] && Array.isArray(boxartInclude.data[gameId])) {
        const matchFront = boxartInclude.data[gameId].find((b: any) => b.type === 'boxart' && b.side === 'front')
        const fallback = boxartInclude.data[gameId][0]
        const relativePath = matchFront ? matchFront.filename : (fallback ? fallback.filename : '')
        if (relativePath) {
          frontBoxart = `${baseUrlLarge}${relativePath}`
        }
      }

      results.push({
        id: `thegamesdb-${game.id}`,
        name: game.game_title || gameName,
        db: 'TheGamesDB',
        releasedate: relDate,
        developer: devStr,
        publisher: pubStr,
        genre: genreStr,
        rating: game.rating ? game.rating / 10 : undefined,
        desc: game.overview || '',
        players: game.players ? String(game.players) : '',
        media: {
          image: frontBoxart,
          thumbnail: frontBoxart,
          marquee: '',
          video: ''
        }
      })
    }

    return results
  }

  async function queryHfsDB(gameName: string, hfsUser: string, hfsPass: string): Promise<any[]> {
    if (!hfsUser || !hfsPass) {
      throw new Error('CREDENCIAIS_AUSENTES: HfsDB username ou password ausentes.')
    }

    const basicAuth = Buffer.from(`${hfsUser}:${hfsPass}`).toString('base64');
    const tokenResponse = await fetch('https://db.hfsplay.fr/api/v1/auth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `username=${encodeURIComponent(hfsUser)}&password=${encodeURIComponent(hfsPass)}`
    });

    if (!tokenResponse.ok) {
      throw new Error(`HfsDB Auth falhou com status ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json()
    const token = tokenData.token
    if (!token) {
      throw new Error('HfsDB Auth falhou em obter token.')
    }

    let cleanedName = gameName.replace(/\.[a-zA-Z0-9]{2,4}$/, '')
    cleanedName = cleanedName.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    cleanedName = cleanedName.replace(/[_-]/g, ' ')
    cleanedName = cleanedName.replace(/\s+/g, ' ').trim()
    if (!cleanedName) cleanedName = gameName

    const searchUrl = `https://db.hfsplay.fr/api/v1/games?search=${encodeURIComponent(cleanedName)}&limit=25`
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Token ${token}`
      }
    })

    if (!searchResponse.ok) {
      throw new Error(`HfsDB Search falhou com status ${searchResponse.status}`)
    }

    const json = await searchResponse.json()
    if (!json.results || !Array.isArray(json.results)) {
      return []
    }

    const findHfsMedia = (game: any, scrapeSource: string): string => {
      if (!game.medias || !Array.isArray(game.medias)) return '';
      const getMediaTagNames = (source: string): string[] => {
        if (source === 'ss' || source === 'mixrbv2' || source === 'mixrbv1' || source === 'mixrbv') {
          return ['screenshot/in game', 'screenshot/title', 'screenshot'];
        }
        if (source === 'sstitle') {
          return ['screenshot/title', 'screenshot/in game', 'screenshot'];
        }
        if (source === 'box-2D') {
          return ['cover2d/front', 'cover2d', 'artwork/Flyer', 'cover3d'];
        }
        if (source === 'box-3D') {
          return ['cover3d', 'cover2d/front'];
        }
        if (source === 'wheel' || source === 'wheel-hd') {
          return ['logo'];
        }
        if (source === 'marquee') {
          return ['wheel', 'artwork/Marquee'];
        }
        if (source === 'video') {
          return ['video'];
        }
        if (source === 'manual') {
          return ['manual'];
        }
        if (source === 'fanart') {
          return ['wallpaper', 'artwork'];
        }
        if (source === 'box-2D-back') {
          return ['cover2d/back'];
        }
        return [];
      };

      const tags = getMediaTagNames(scrapeSource);
      for (const tag of tags) {
        let tagName = tag;
        let tagType = '';
        const idx = tag.indexOf('/');
        if (idx !== -1) {
          tagType = tag.substring(idx + 1);
          tagName = tag.substring(0, idx);
        }

        for (const media of game.medias) {
          if (!media.type || !media.file) continue;
          if (media.type !== tagName) continue;

          if (tagType) {
            if (media.metadata && Array.isArray(media.metadata)) {
              const match = media.metadata.find((m: any) => m.name === tagName + 'type' && m.value === tagType);
              if (match) return media.file;
            }
            if (media.description === tagType) {
              return media.file;
            }
            continue;
          }
          return media.file;
        }
      }
      return '';
    }

    const results: any[] = []
    for (const game of json.results) {
      const gameNameParsed = game.name_pt || game.name_en || game.name || gameName
      const gameDesc = game.description_pt || game.description_en || game.description || ''

      let dev = ''
      let pub = ''
      let gen = ''
      let players = ''

      if (game.metadata && Array.isArray(game.metadata)) {
        for (const meta of game.metadata) {
          if (!meta.name || !meta.value) continue
          if (meta.name === 'genre') gen = meta.value
          else if (meta.name === 'editor') pub = meta.value
          else if (meta.name === 'manufacturer') pub = meta.value
          else if (meta.name === 'developer') dev = meta.value
          else if (meta.name === 'players') {
            players = meta.value
              .replace(' joueurs', '')
              .replace(' joueur', '')
              .replace('+ de ', '')
          }
        }
      }

      let relDate = ''
      for (const rel of ['released_at_WORLD', 'released_at_US', 'released_at_PAL', 'released_at_JPN']) {
        if (game[rel]) {
          relDate = game[rel].replace(/-/g, '').split('T')[0] + 'T000000'
          break
        }
      }

      results.push({
        id: `hfsdb-${game.id}`,
        name: gameNameParsed,
        db: 'HfsDB',
        releasedate: relDate,
        developer: dev,
        publisher: pub,
        genre: gen,
        rating: undefined,
        desc: gameDesc,
        players: players,
        media: {
          image: findHfsMedia(game, 'fanart') || findHfsMedia(game, 'ss'),
          thumbnail: findHfsMedia(game, 'box-2D') || findHfsMedia(game, 'box-3D'),
          marquee: findHfsMedia(game, 'wheel') || findHfsMedia(game, 'marquee'),
          video: findHfsMedia(game, 'video')
        }
      })
    }

    return results
  }

  ipcMain.handle('search-game-media', async (_, systemName: string, gameName: string, databases: string[], gamePath?: string) => {
    try {
      const preferredRegion = settingsParser.getSetting('ScraperRegion', 'string') || 'eu'
      const systemLanguage = (settingsParser.getSetting('Language', 'string') || 'pt').substring(0, 2).toLowerCase()

      const ssid = settingsParser.getSetting('ScreenScraperUser', 'string') || ''
      const sspassword = settingsParser.getSetting('ScreenScraperPass', 'string') || ''

      const systemInfo = libraryService.getSystems().find(s => s.name === systemName)
      const systemId = SYSTEM_TO_SCREENSCRAPER_PLATFORM[systemName.toLowerCase()] || 
                       (systemInfo ? SYSTEM_TO_SCREENSCRAPER_PLATFORM[systemInfo.platform.toLowerCase()] : 0)

      const promises: Promise<any[]>[] = []
      const credentialRequiredSelected: string[] = []

      for (const db of databases) {
        if (db === 'ScreenScraper') {
          promises.push(
            queryScreenScraper(systemName, gameName, gamePath, preferredRegion, systemLanguage, ssid, sspassword, systemId)
              .catch(err => {
                console.error('ScreenScraper failed:', err)
                return []
              })
          )
          credentialRequiredSelected.push('ScreenScraper')
        } else if (db === 'ArcadeDB') {
          promises.push(
            queryArcadeDB(gameName)
              .catch(err => {
                console.error('ArcadeDB failed:', err)
                return []
              })
          )
        } else if (db === 'IGDB') {
          const clientID = settingsParser.getSetting('IGDBClientID', 'string') || 'a6j303y0qtil1b4uzhmwtu7tg1s138'
          const secret = settingsParser.getSetting('IGDBSecret', 'string') || 'bj1qgz4yvsmot64j2ocn1edl0nmdec'
          promises.push(
            queryIGDB(gameName, clientID, secret)
              .catch(err => {
                console.error('IGDB failed:', err)
                return []
              })
          )
          credentialRequiredSelected.push('IGDB')
        } else if (db === 'TheGamesDB') {
          const apiKey = settingsParser.getSetting('TheGamesDBApiKey', 'string') || 'd79b07c4e5715ec00435fa10410ab2b15c2a24762af9c3e0832694a213b74a79'
          promises.push(
            queryTheGamesDB(gameName, apiKey, getConfigPath())
              .catch(err => {
                console.error('TheGamesDB failed:', err)
                return []
              })
          )
        } else if (db === 'HfsDB') {
          const hfsUser = settingsParser.getSetting('HfsDBUser', 'string') || 'riescade'
          const hfsPass = settingsParser.getSetting('HfsDBPass', 'string') || 'ZbrSya@eu8iBNyR'
          promises.push(
            queryHfsDB(gameName, hfsUser, hfsPass)
              .catch(err => {
                console.error('HfsDB failed:', err)
                return []
              })
          )
        }
      }

      const resultsListList = await Promise.all(promises)
      const results = resultsListList.flat()

      // If ONLY credential-requiring databases were selected and ALL of them failed to return any results
      if (databases.length > 0 && credentialRequiredSelected.length === databases.length && results.length === 0) {
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
    } catch (e) {}
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
