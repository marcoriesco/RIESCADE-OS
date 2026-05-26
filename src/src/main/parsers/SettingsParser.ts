import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getRetroBatPath } from '../utils/paths'

/**
 * SettingsParser — single-backend settings manager.
 *
 * ALL settings are stored in es_settings.cfg (XML) so there's
 * only one source of truth for the entire system.
 */
export class SettingsParser {
  private getEsSettingsPath(): string {
    return join(
      getRetroBatPath(),
      '.emulatorlauncher',
      '.emulationstation',
      'es_settings.cfg'
    )
  }

  /**
   * Parse es_settings.cfg into a flat map:
   *   { settingName: { value: string, type: 'string'|'bool'|'int'|'float' } }
   */
  private readXmlSettings(): Record<string, { value: string; type: string }> {
    const xmlPath = this.getEsSettingsPath()
    const result: Record<string, { value: string; type: string }> = {}

    if (!existsSync(xmlPath)) return result

    try {
      const content = readFileSync(xmlPath, 'utf-8')
      // Match <type name="..." value="..."/>
      const regex = /<(bool|int|float|string)\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/g
      let m: RegExpExecArray | null
      while ((m = regex.exec(content)) !== null) {
        const [, type, name, value] = m
        result[name] = { value, type }
      }
    } catch (error) {
      console.error('[SettingsParser] Error reading es_settings.cfg:', error)
    }

    return result
  }

  /**
   * Write the full settings map back to es_settings.cfg as well-formed XML.
   * Entries are grouped by type and sorted alphabetically within each group.
   */
  private writeXmlSettings(settings: Record<string, { value: string; type: string }>): void {
    const xmlPath = this.getEsSettingsPath()

    // Ensure directory exists
    const dir = dirname(xmlPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Group by type, sort by name within each group
    const groups: Record<string, { name: string; value: string }[]> = {}
    for (const [name, { value, type }] of Object.entries(settings)) {
      if (!groups[type]) groups[type] = []
      groups[type].push({ name, value })
    }

    const typeOrder = ['bool', 'int', 'float', 'string']
    const lines: string[] = ['<?xml version="1.0"?>', '<config>']

    for (const type of typeOrder) {
      const items = groups[type]
      if (!items) continue
      items.sort((a, b) => a.name.localeCompare(b.name))
      for (const { name, value } of items) {
        // Escape XML special chars in value
        const escaped = value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
        lines.push(`  <${type} name="${name}" value="${escaped}"/>`)
      }
    }

    lines.push('</config>')
    lines.push('')

    try {
      writeFileSync(xmlPath, lines.join('\n'), 'utf-8')
      console.log(`[SettingsParser] Saved es_settings.cfg (${Object.keys(settings).length} entries)`)
    } catch (error) {
      console.error('[SettingsParser] Error writing es_settings.cfg:', error)
    }
  }

  /**
   * Returns ALL settings from es_settings.cfg.
   * Format: { settingName: { value: string, type: string } }
   */
  public getAllSettings(): Record<string, { value: string; type: string }> {
    return this.readXmlSettings()
  }

  public getSelectedTheme(): string {
    return this.getSetting('RIESCADE.ThemeSet', 'string') || 'default'
  }

  public getSetting(settingName: string, type: 'string' | 'bool' | 'int' | 'float' = 'string'): any {
    const all = this.readXmlSettings()
    return all[settingName]?.value ?? null
  }

  public saveSetting(name: string, value: any, type: 'string' | 'bool' | 'int' | 'float'): void {
    const stringVal = String(value)
    const xmlSettings = this.readXmlSettings()

    // Remove if value is null, undefined, empty, or redundant auto
    const isRedundantAuto =
      stringVal.toLowerCase() === 'auto' &&
      name.includes('.') &&
      !name.startsWith('global.') &&
      !name.startsWith('RIESCADE.')

    const keysAllowEmpty = ['Desktop.Icons', 'Taskbar.Icons']
    const isEmpty = stringVal === '' && !keysAllowEmpty.includes(name)

    if (value === null || value === undefined || isEmpty || stringVal === 'null' || isRedundantAuto) {
      delete xmlSettings[name]
    } else {
      xmlSettings[name] = { value: stringVal, type }
    }

    this.writeXmlSettings(xmlSettings)

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
  }
}
