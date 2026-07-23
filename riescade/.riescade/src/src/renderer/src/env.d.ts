/// <reference types="vite/client" />
import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      preloadLibrary: (forcePhysicalScan?: boolean, systemName?: string) => Promise<any>
      getSystems: () => Promise<any>
      getGames: (systemName: string) => Promise<any>
      updateGame: (systemName: string, gameData: any) => Promise<void>
      deleteGame: (systemName: string, gamePath: string, deletePhysical: boolean) => Promise<void>
      launchGame: (game: any, system: any, saveStateSlot?: number) => Promise<any>
      scanSaveStates: (systemName: string, gamePath: string) => Promise<any[]>
      getCustomCollections: () => Promise<string[]>
      getCollectionGames: (collectionName: string) => Promise<any[]>
      getThemes: () => Promise<any>
      getActiveTheme: () => Promise<string>
      loadTheme: (themeName: string) => Promise<any>
      getSettings: () => Promise<any>
      getGpuDiagnostics: () => Promise<any>
      saveSetting: (name: string, value: any, type: string) => Promise<any>
      saveWindowBounds: (windowId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      getEmulatorSettings: () => Promise<any>
      saveEmulatorSetting: (emulator: string, name: string, value: any) => Promise<any>
      getEmulatorSchemas: () => Promise<{ id: string; name: string; description?: string; icon?: string; groupCount: number; optionCount: number }[]>
      getEmulatorSchema: (id: string) => Promise<any>
      getResolvedEmulatorSettings: (emulator: string) => Promise<Record<string, { value: any; source: 'emulator' | 'global' | 'default' }>>
      resetEmulatorSetting: (emulator: string, key: string) => Promise<void>
      resetAllEmulatorSettings: (emulator: string) => Promise<void>
      reloadEmulatorSchemas: () => Promise<any>
      getFeatures: () => Promise<any>
      checkBatteryExists: () => Promise<boolean>
      selectBgImage: () => Promise<string | null>
      selectBgVideo: () => Promise<string | null>
      getThemeSettings: (themeName: string) => Promise<any>
      saveThemeSetting: (themeName: string, key: string, value: string) => Promise<any>
      getConfiguredControllers: () => Promise<any>
      saveInputConfig: (data: { deviceName: string; deviceGUID: string; mappings: any }) => Promise<boolean>
      getBluetoothDevices: () => Promise<any[]>
      detectControllers: () => Promise<any[]>
      getControllerState: (index: number) => Promise<any>
      saveControllerConfig: (guid: string, config: any) => Promise<boolean>
      getControllerConfigs: () => Promise<any>
      rumbleController: (instanceId: string, durationMs: number) => Promise<boolean>
      exportDebugReport: (recentEvents?: any[]) => Promise<any>
      getSdlVersion: () => Promise<string>
      executeCommand: (command: string, data?: any) => void
      openAppWindow: (type: 'system' | 'tool', id: string) => void
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      getVersion: () => Promise<{ app: string; es: string }>
      checkForUpdates: () => Promise<any>
      downloadAndInstallUpdate: (zipUrl: string) => Promise<boolean>
      getOverlayPath: (name: string) => Promise<string>
      getCollectionsForGame: (systemName: string, gamePath: string) => Promise<string[]>
      toggleGameInCollection: (collectionName: string, systemName: string, gamePath: string, action: 'add' | 'remove') => Promise<boolean>
      getFileContent: (path: string) => Promise<string | null>
      checkFileExists: (path: string) => Promise<boolean>
      getHostname: () => Promise<string>
      getBiosInformation: () => Promise<any[]>
      cleanGamelists: () => Promise<any>
      resetGamelistUsage: () => Promise<any>
      resetFileExtensions: () => Promise<any>
      clearCaches: () => Promise<any>
      getMusicFiles: (subfolder?: string) => Promise<string[]>
      getMusicPath: () => Promise<string>
      startScrape: (options?: { systemName?: string; gamePath?: string }) => Promise<boolean>
      cancelScrape: () => Promise<boolean>
      submitManualScrapeQuery: (query: string) => Promise<boolean>
      cancelManualScrape: () => Promise<boolean>
      searchGameMedia: (systemName: string, gameName: string, databases: string[], gamePath?: string) => Promise<any[]>
      downloadGameMedia: (systemName: string, gamePath: string, matchData: any) => Promise<any>
      downloadTempMedia: (url: string) => Promise<string>
      getRiescadeLogoPath: () => Promise<string>
      checkMediaFolders: (systemPath: string) => Promise<Record<string, boolean>>
      dbGetGamesPaginated: (system: string, page: number, pageSize: number, search: string, sortBy: string, sortDir: string) => Promise<{ games: any[]; total: number; pages: number }>
      dbUpdateGame: (game: any) => Promise<boolean>
      dbDeleteGames: (items: { system: string; path: string; deletePhysical?: boolean }[]) => Promise<boolean>
      dbGetSystemsInfo: () => Promise<{ name: string; fullname: string; lastScanAt: number; gameCount: number }[]>
      dbGetStats: () => Promise<{ totalGames: number; totalSystems: number; dbSize: number; lastSyncAt: number }>
      dbVacuum: () => Promise<boolean>
      dbRebuild: () => Promise<boolean>
      on: (channel: string, callback: (...args: any[]) => void) => () => void

    }
  }
}
