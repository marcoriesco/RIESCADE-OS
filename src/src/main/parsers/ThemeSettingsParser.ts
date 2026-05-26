import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getConfigPath } from '../utils/paths'

export class ThemeSettingsParser {
  static getSettingsPath(themePath: string): string {
    return join(themePath, 'config.json')
  }

  static getThemeSettings(themeName: string, themePath: string): Record<string, string> {
    const settingsPath = this.getSettingsPath(themePath)
    const settings: Record<string, string> = {}

    // 1. Load defaults from options.json if it exists
    const optionsPath = join(themePath, 'options.json')
    if (existsSync(optionsPath)) {
      try {
        const optionsContent = readFileSync(optionsPath, 'utf8')
        const optionsData = JSON.parse(optionsContent)
        if (Array.isArray(optionsData)) {
          for (const opt of optionsData) {
            if (opt.id && opt.default !== undefined) {
              settings[opt.id] = String(opt.default)
            }
          }
        }
      } catch (e) {
        console.error('Error parsing theme options.json:', e)
      }
    }

    // 2. Override with user settings from config.json
    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf8')
        const userData = JSON.parse(content)
        if (userData && typeof userData === 'object') {
          for (const [key, val] of Object.entries(userData)) {
            settings[key] = String(val)
          }
        }
      } catch (e) {
        console.error(`Error reading ${settingsPath}:`, e)
      }
    }

    return settings
  }

  static saveThemeSetting(themeName: string, themePath: string, key: string, value: string): void {
    const settingsPath = this.getSettingsPath(themePath)
    let userData: Record<string, string> = {}
    
    if (existsSync(settingsPath)) {
      try {
        userData = JSON.parse(readFileSync(settingsPath, 'utf8'))
      } catch (e) {
        console.error('Error reading theme config.json for saving:', e)
      }
    }

    userData[key] = value
    writeFileSync(settingsPath, JSON.stringify(userData, null, 2), 'utf8')
  }
}
