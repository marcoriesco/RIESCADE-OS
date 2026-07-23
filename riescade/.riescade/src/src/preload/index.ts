import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Simplified API - all config is done through EmulationStation
const api = {
  // Library
  preloadLibrary: (forcePhysicalScan?: boolean, systemName?: string) => ipcRenderer.invoke('preload-library', forcePhysicalScan, systemName),
  getSystems: () => ipcRenderer.invoke('get-systems'),
  getGames: (systemName: string) => ipcRenderer.invoke('get-games', systemName),
  updateGame: (systemName: string, gameData: any) => ipcRenderer.invoke('update-game', systemName, gameData),
  deleteGame: (systemName: string, gamePath: string, deletePhysical: boolean) => ipcRenderer.invoke('delete-game', systemName, gamePath, deletePhysical),
  launchGame: (game: any, system: any, saveStateSlot?: number) => ipcRenderer.invoke('launch-game', game, system, saveStateSlot),
  checkEmulatorStatus: (emulatorName: string, systemName: string) => ipcRenderer.invoke('check-emulator-status', emulatorName, systemName),
  downloadAndInstallEmulator: (emulatorName: string, sourceUrl: string) => ipcRenderer.invoke('download-install-emulator', emulatorName, sourceUrl),
  scanSaveStates: (systemName: string, gamePath: string) => ipcRenderer.invoke('scan-save-states', systemName, gamePath),
  getCustomCollections: () => ipcRenderer.invoke('get-custom-collections'),
  getCollectionGames: (collectionName: string) => ipcRenderer.invoke('get-collection-games', collectionName),
  getCollectionsForGame: (systemName: string, gamePath: string) => ipcRenderer.invoke('get-collections-for-game', systemName, gamePath),
  toggleGameInCollection: (collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove') => ipcRenderer.invoke('toggle-game-in-collection', collectionName, systemName, gamePath, action),

  // Themes
  getThemes: () => ipcRenderer.invoke('get-themes'),
  getActiveTheme: () => ipcRenderer.invoke('get-active-theme'),
  loadTheme: (themeName: string) => ipcRenderer.invoke('load-theme', themeName),

  // Settings (read from ES config, write for UI prefs)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getGpuDiagnostics: () => ipcRenderer.invoke('get-gpu-diagnostics'),
  saveSetting: (name: string, value: any, type: 'string' | 'bool' | 'int' | 'float') =>
    ipcRenderer.invoke('save-setting', name, value, type),
  saveWindowBounds: (windowId: string, bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('save-window-bounds', windowId, bounds),
  getEmulatorSettings: () => ipcRenderer.invoke('get-emulator-settings'),
  saveEmulatorSetting: (emulator: string, name: string, value: any) =>
    ipcRenderer.invoke('save-emulator-setting', emulator, name, value),
  getEmulatorSchemas: () => ipcRenderer.invoke('get-emulator-schemas'),
  getEmulatorSchema: (id: string) => ipcRenderer.invoke('get-emulator-schema', id),
  getResolvedEmulatorSettings: (emulator: string) => ipcRenderer.invoke('get-resolved-emulator-settings', emulator),
  resetEmulatorSetting: (emulator: string, key: string) => ipcRenderer.invoke('reset-emulator-setting', emulator, key),
  resetAllEmulatorSettings: (emulator: string) => ipcRenderer.invoke('reset-all-emulator-settings', emulator),
  reloadEmulatorSchemas: () => ipcRenderer.invoke('reload-emulator-schemas'),
  selectBgImage: () => ipcRenderer.invoke('select-bg-image'),
  selectBgVideo: () => ipcRenderer.invoke('select-bg-video'),
  getHostname: () => ipcRenderer.invoke('get-hostname'),
  getBiosInformation: () => ipcRenderer.invoke('get-bios-information'),
  cleanGamelists: () => ipcRenderer.invoke('clean-gamelists'),
  resetGamelistUsage: () => ipcRenderer.invoke('reset-gamelist-usage'),
  resetFileExtensions: () => ipcRenderer.invoke('reset-file-extensions'),
  clearCaches: () => ipcRenderer.invoke('clear-caches'),

  // Theme Settings
  getThemeSettings: (themeName: string) => ipcRenderer.invoke('get-theme-settings', themeName),
  saveThemeSetting: (themeName: string, key: string, value: string) => 
    ipcRenderer.invoke('save-theme-setting', themeName, key, value),
  getFileContent: (path: string) => ipcRenderer.invoke('get-file-content', path),
  checkFileExists: (path: string) => ipcRenderer.invoke('check-file-exists', path),

  // Controllers
  getConfiguredControllers: () => ipcRenderer.invoke('get-configured-controllers'),
  saveInputConfig: (data: { deviceName: string; deviceGUID: string; mappings: any }) =>
    ipcRenderer.invoke('save-input-config', data),
  getBluetoothDevices: () => ipcRenderer.invoke('get-bluetooth-devices'),
  detectControllers: () => ipcRenderer.invoke('detect-controllers'),
  getControllerState: (index: number) => ipcRenderer.invoke('get-controller-state', index),
  saveControllerConfig: (guid: string, config: any) => ipcRenderer.invoke('save-controller-config', { guid, config }),
  getControllerConfigs: () => ipcRenderer.invoke('get-controller-configs'),
  rumbleController: (instanceId: string, durationMs: number) => ipcRenderer.invoke('rumble-controller', { instanceId, durationMs }),
  exportDebugReport: (recentEvents?: any[]) => ipcRenderer.invoke('export-debug-report', recentEvents),
  getSdlVersion: () => ipcRenderer.invoke('get-sdl-version'),

  executeCommand: (command: string, data?: any) => ipcRenderer.send('system-command', command, data),
  openAppWindow: (type: 'system' | 'tool', id: string) => ipcRenderer.send('open-app-window', type, id),
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
  closeWindow: () => ipcRenderer.send('window-control', 'close'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadAndInstallUpdate: (zipUrl: string) => ipcRenderer.invoke('download-and-install-update', zipUrl),
  getOverlayPath: (name: string) => ipcRenderer.invoke('get-overlay-path', name),
  getMusicFiles: (subfolder?: string) => ipcRenderer.invoke('get-music-files', subfolder),
  getMusicPath: () => ipcRenderer.invoke('get-music-path'),
  startScrape: (options?: { systemName?: string; gamePath?: string }) => ipcRenderer.invoke('start-scrape', options),
  cancelScrape: () => ipcRenderer.invoke('cancel-scrape'),
  submitManualScrapeQuery: (query: string) => ipcRenderer.invoke('submit-manual-scrape-query', query),
  cancelManualScrape: () => ipcRenderer.invoke('cancel-manual-scrape'),
  testScreenScraper: (ssid: string, sspassword: string) => ipcRenderer.invoke('test-screenscraper', ssid, sspassword),
  searchGameMedia: (systemName: string, gameName: string, databases: string[], gamePath?: string) => ipcRenderer.invoke('search-game-media', systemName, gameName, databases, gamePath),
  downloadGameMedia: (systemName: string, gamePath: string, matchData: any) => ipcRenderer.invoke('download-game-media', systemName, gamePath, matchData),
  downloadTempMedia: (url: string) => ipcRenderer.invoke('download-temp-media', url),
  getRiescadeLogoPath: () => ipcRenderer.invoke('get-riescade-logo-path'),
  checkMediaFolders: (systemPath: string) => ipcRenderer.invoke('check-media-folders', systemPath),
  getFeatures: () => ipcRenderer.invoke('get-features'),
  checkBatteryExists: () => ipcRenderer.invoke('check-battery-exists'),

  // DB Manager APIs
  dbGetGamesPaginated: (system: string, page: number, pageSize: number, search: string, sortBy: string, sortDir: string) =>
    ipcRenderer.invoke('db-get-games-paginated', system, page, pageSize, search, sortBy, sortDir),
  dbUpdateGame: (game: any) => ipcRenderer.invoke('db-update-game', game),
  dbDeleteGames: (items: { system: string; path: string; deletePhysical?: boolean }[]) =>
    ipcRenderer.invoke('db-delete-games', items),
  dbGetSystemsInfo: () => ipcRenderer.invoke('db-get-systems-info'),
  dbGetStats: () => ipcRenderer.invoke('db-get-stats'),
  dbVacuum: () => ipcRenderer.invoke('db-vacuum'),
  dbRebuild: () => ipcRenderer.invoke('db-rebuild'),

  // Events

  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (event: any, ...args: any[]) => callback(event, ...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
