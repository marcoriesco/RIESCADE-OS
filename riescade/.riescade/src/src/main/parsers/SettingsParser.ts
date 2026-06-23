import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getConfigPath } from '../utils/paths'
import { XMLParser } from 'fast-xml-parser'

export class SettingsParser {
  constructor() {}

  private getSettingsPath(): string {
    return join(getConfigPath(), 'es_settings.cfg')
  }

  public getAllSettings(): any {
    const settingsPath = this.getSettingsPath()
    if (!existsSync(settingsPath)) return {}

    try {
      const content = readFileSync(settingsPath, 'utf-8')
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseAttributeValue: true,
        ignoreDeclaration: true
      })
      const xmlObj = parser.parse(content)
      const config = xmlObj.config || {}
      const settings: any = {}

      const types: ('bool' | 'string' | 'int' | 'float')[] = ['bool', 'string', 'int', 'float']
      for (const type of types) {
        const elements = config[type]
        if (elements) {
          const list = Array.isArray(elements) ? elements : [elements]
          list.forEach((s: any) => {
            const name = s['@_name']
            let value = s['@_value']
            if (value !== undefined) {
              if (type === 'bool') {
                value = value === true || String(value) === 'true'
              } else if (type === 'int') {
                value = parseInt(value, 10)
              } else if (type === 'float') {
                value = parseFloat(value)
              }
              settings[name] = { value, type }
            }
          })
        }
      }
      return settings
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

    if (value !== null && value !== undefined && String(value) !== '' && String(value) !== 'null' && !isRedundantAuto) {
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
      // Serialize settings to XML format
      let xmlContent = '<?xml version="1.0"?>\n<config>\n'
      for (const [key, item] of Object.entries(settings) as [string, any][]) {
        const keyEscaped = String(key).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const valueEscaped = String(item.value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        xmlContent += `\t<${item.type} name="${keyEscaped}" value="${valueEscaped}" />\n`
      }
      xmlContent += '</config>\n'

      writeFileSync(settingsPath, xmlContent, 'utf-8')

      // Clear systems cache on settings change that might affect system configuration
      const affectingSettings = [
        'VisibleSystems',
        'HiddenSystems',
        'SystemsGrouped',
        'LoadEmptySystems',
        'CollectionSystemsAuto',
        'CollectionSystemsCustom'
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
}
