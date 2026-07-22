import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getRiescadePath } from '../utils/paths'

export class SettingsParser {
  constructor() {}

  private getSettingsPath(): string {
    return join(getRiescadePath(), 'configs', 'settings.json')
  }

  public getAllSettings(): any {
    const settingsPath = this.getSettingsPath()
    if (!existsSync(settingsPath)) return {}

    try {
      const content = readFileSync(settingsPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error parsing all settings:', error)
      return {}
    }
  }

  public getSelectedTheme(): string {
    return this.getSetting('RIESCADE.ThemeSet', 'string') || 'default'
  }

  public getSetting(settingName: string, type: 'string' | 'bool' | 'int' | 'float' = 'string'): any {
    const settings = this.getAllSettings()
    return settings[settingName]?.value ?? null
  }

  public saveSetting(name: string, value: any, type: 'string' | 'bool' | 'int' | 'float'): void {
    const settingsPath = this.getSettingsPath()
    const settings = this.getAllSettings()

    // Add new (only if value is not null, undefined, empty, or string "null", and is not a redundant "auto")
    const isRedundantAuto = String(value).toLowerCase() === 'auto' &&
      name.includes('.') &&
      !name.startsWith('global.') &&
      !name.startsWith('RIESCADE.')

    const isIconsSetting = name === 'Desktop.Icons' || name === 'Taskbar.Icons'

    if (value !== null && value !== undefined && (String(value) !== '' || isIconsSetting) && String(value) !== 'null' && !isRedundantAuto) {
      let castedValue = value
      if (type === 'bool') {
        castedValue = value === true || String(value) === 'true'
      } else if (type === 'int') {
        castedValue = parseInt(value, 10)
      } else if (type === 'float') {
        castedValue = parseFloat(value)
      }

      settings[name] = {
        value: castedValue,
        type
      }
    } else {
      delete settings[name]
    }

    try {
      const jsonContent = JSON.stringify(settings, null, 2)
      writeFileSync(settingsPath, jsonContent, 'utf-8')

      // Clear systems cache on settings change that might affect system configuration
      const affectingSettings = [
        'VisibleSystems',
        'HiddenSystems',
        'LoadEmptySystems'
      ]
      if (affectingSettings.includes(name)) {
        try {
          const { LibraryService } = require('../services/LibraryService')
          LibraryService.clearCache()
        } catch (e) {
          try {
            const { SystemsParser } = require('./SystemsParser')
            SystemsParser.clearCache()
          } catch (err) {}
        }
      }
    } catch (error) {
      console.error('Error saving setting:', error)
    }
  }

  public saveWindowBounds(windowId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    const settingsPath = this.getSettingsPath()
    const settings = this.getAllSettings()

    settings[`Window.${windowId}.X`] = { value: Math.round(bounds.x), type: 'int' }
    settings[`Window.${windowId}.Y`] = { value: Math.round(bounds.y), type: 'int' }
    settings[`Window.${windowId}.Width`] = { value: Math.round(bounds.width), type: 'int' }
    settings[`Window.${windowId}.Height`] = { value: Math.round(bounds.height), type: 'int' }

    try {
      const jsonContent = JSON.stringify(settings, null, 2)
      writeFileSync(settingsPath, jsonContent, 'utf-8')
    } catch (error) {
      console.error('Error saving window bounds:', error)
    }
  }
}
