import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getRiescadePath } from '../utils/paths'
import { EmulatorParser } from './EmulatorParser'

export type SettingsScope = 'system' | 'game'

export interface SettingsContext {
  system: string
  emulator: string
  core?: string
  rom?: string
}

interface ScopeEntry {
  system: string
  rom?: string
  emulator: string
  core?: string
  settings: Record<string, any>
}

interface ScopeDocument {
  $schema: string
  version: number
  systems?: Record<string, ScopeEntry>
  games?: Record<string, ScopeEntry>
}

export class ScopedSettingsParser {
  private getPath(scope: SettingsScope): string {
    const configsPath = join(getRiescadePath(), 'configs')
    const emulatorsPath = join(configsPath, 'emulators')
    const filename = scope === 'system' ? 'systems.json' : 'games.json'
    const currentPath = join(emulatorsPath, filename)
    mkdirSync(emulatorsPath, { recursive: true })
    return currentPath
  }

  private collectionName(scope: SettingsScope): 'systems' | 'games' {
    return scope === 'system' ? 'systems' : 'games'
  }

  public makeKey(scope: SettingsScope, context: SettingsContext): string {
    if (scope === 'system') return `${context.system}|${context.emulator}|${context.core || ''}`
    return `${context.system}|${String(context.rom || '').replace(/\\/g, '/')}`
  }

  public getDocument(scope: SettingsScope): ScopeDocument {
    const collection = this.collectionName(scope)
    const empty: ScopeDocument = {
      $schema: scope === 'system' ? 'riescade-system-settings-v1' : 'riescade-game-settings-v1',
      version: 1,
      [collection]: {}
    }
    const filePath = this.getPath(scope)
    if (!existsSync(filePath)) return empty
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
      return {
        ...empty,
        ...parsed,
        [collection]: parsed?.[collection] && typeof parsed[collection] === 'object' ? parsed[collection] : {}
      }
    } catch (error) {
      console.error(`Error parsing ${scope}-settings.json:`, error)
      return empty
    }
  }

  public getEntry(scope: SettingsScope, context: SettingsContext): ScopeEntry | null {
    const document = this.getDocument(scope)
    const collection = (document[this.collectionName(scope)] || {}) as Record<string, ScopeEntry>
    return collection[this.makeKey(scope, context)] || null
  }

  public saveSetting(scope: SettingsScope, context: SettingsContext, name: string, value: any): void {
    const document = this.getDocument(scope)
    const collectionName = this.collectionName(scope)
    const collection = (document[collectionName] || {}) as Record<string, ScopeEntry>
    const key = this.makeKey(scope, context)
    const current = collection[key] || {
      system: context.system,
      ...(scope === 'game' ? { rom: String(context.rom || '').replace(/\\/g, '/') } : {}),
      emulator: context.emulator,
      core: context.core || '',
      settings: {}
    }

    current.emulator = context.emulator
    current.core = context.core || ''
    if (value === undefined || value === null || value === 'auto') {
      delete current.settings[name]
    } else {
      current.settings[name] = value
    }

    if (Object.keys(current.settings).length === 0) {
      delete collection[key]
    } else {
      collection[key] = current
    }
    document[collectionName] = collection
    this.writeDocument(scope, document)
  }

  public reset(scope: SettingsScope, context: SettingsContext, name?: string): void {
    const document = this.getDocument(scope)
    const collectionName = this.collectionName(scope)
    const collection = (document[collectionName] || {}) as Record<string, ScopeEntry>
    const key = this.makeKey(scope, context)
    if (!collection[key]) return
    if (name) {
      delete collection[key].settings[name]
      if (Object.keys(collection[key].settings).length === 0) delete collection[key]
    } else {
      delete collection[key]
    }
    document[collectionName] = collection
    this.writeDocument(scope, document)
  }

  public getResolved(scope: SettingsScope, context: SettingsContext): Record<string, { value: any; source: string }> {
    const result: Record<string, { value: any; source: string }> = new EmulatorParser().getResolvedSettings(context.emulator)
    const systemEntry = this.getEntry('system', context)
    if (systemEntry && this.matches(systemEntry, context)) {
      for (const [key, value] of Object.entries(systemEntry.settings || {})) {
        if (value !== 'auto') result[key] = { value, source: 'system' }
      }
    }
    if (scope === 'game') {
      const gameEntry = this.getEntry('game', context)
      if (gameEntry && this.matches(gameEntry, context)) {
        for (const [key, value] of Object.entries(gameEntry.settings || {})) {
          if (value !== 'auto') result[key] = { value, source: 'game' }
        }
      }
    }
    return result
  }

  private matches(entry: ScopeEntry, context: SettingsContext): boolean {
    if (entry.emulator && entry.emulator !== 'auto' && entry.emulator !== context.emulator) return false
    if (entry.core && entry.core !== 'auto' && entry.core !== (context.core || '')) return false
    return true
  }

  private writeDocument(scope: SettingsScope, document: ScopeDocument): void {
    const filePath = this.getPath(scope)
    const temporaryPath = `${filePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8')
    renameSync(temporaryPath, filePath)
  }
}
