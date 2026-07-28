import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { basename, join, extname } from 'path'
import { getEmulatorsPath, getRetroBatPath, getRiescadePath } from '../utils/paths'

export interface SchemaOption {
  id: string
  label: string
  description?: string
  type: 'toggle' | 'select' | 'slider' | 'input'
  default?: string
  configKey: string
  inheritsGlobal?: string
  values?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  suffix?: string
  dynamicSource?: 'libretro-shaders' | 'libretro-decorations' | 'libretro-video-filters'
}

export interface SchemaGroup {
  id: string
  title: string
  icon?: string
  order: number
  options: SchemaOption[]
}

export interface GlobalMapping {
  configKey: string
  globalKey: string
}

export interface ConfigFileInfo {
  path: string
  format: 'ini' | 'json' | 'toml' | 'yml' | 'xml' | 'cfg' | 'bml'
}

export interface EmulatorSchema {
  $schema?: string
  id: string
  name: string
  version?: string
  icon?: string
  description?: string
  configFiles?: ConfigFileInfo[]
  globalMappings?: Record<string, GlobalMapping>
  groups: SchemaGroup[]
}

export class EmulatorSchemaService {
  private schemas: Map<string, EmulatorSchema> = new Map()
  private loaded = false

  private getSchemasDir(): string {
    const configsPath = join(getRiescadePath(), 'configs')
    const emulatorsPath = join(configsPath, 'emulators')
    const schemasPath = join(emulatorsPath, 'schemas')
    mkdirSync(emulatorsPath, { recursive: true })
    return schemasPath
  }

  public loadAll(): void {
    const schemasDir = this.getSchemasDir()
    if (!existsSync(schemasDir)) {
      console.warn(`[EmulatorSchemaService] Schemas directory not found: ${schemasDir}`)
      return
    }

    try {
      const files = readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'))
      for (const file of files) {
        try {
          const filePath = join(schemasDir, file)
          const content = readFileSync(filePath, 'utf-8')
          const schema: EmulatorSchema = JSON.parse(content)
          if (schema.id) {
            this.schemas.set(schema.id, schema)
          }
        } catch (err) {
          console.error(`[EmulatorSchemaService] Failed to parse ${file}:`, err)
        }
      }
      this.loaded = true
      console.log(`[EmulatorSchemaService] Loaded ${this.schemas.size} emulator schemas`)
    } catch (err) {
      console.error(`[EmulatorSchemaService] Failed to read schemas directory:`, err)
    }
  }

  public getAll(): EmulatorSchema[] {
    if (!this.loaded) this.loadAll()
    return Array.from(this.schemas.values())
  }

  public getSchema(id: string): EmulatorSchema | null {
    if (!this.loaded) this.loadAll()
    const schema = this.schemas.get(id)
    if (!schema) return null
    const hydrated = JSON.parse(JSON.stringify(schema)) as EmulatorSchema
    this.hydrateDynamicResources(hydrated)
    return hydrated
  }

  private hydrateDynamicResources(schema: EmulatorSchema): void {
    const dynamicValues: Record<string, { label: string; value: string }[]> = {
      'libretro-decorations': this.listDecorationTypes(),
      'libretro-shaders': this.listShaderPresets(),
      'libretro-video-filters': this.listVideoFilters()
    }
    for (const group of schema.groups) {
      for (const option of group.options) {
        if (!option.dynamicSource) continue
        option.values = [
          { label: 'AUTO', value: 'auto' },
          { label: 'Desativado', value: 'none' },
          ...(dynamicValues[option.dynamicSource] || [])
        ]
      }
    }
  }

  private listDecorationTypes(): { label: string; value: string }[] {
    const root = join(getRetroBatPath(), 'riescade', 'decorations')
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => ({ label: entry.name, value: entry.name }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }

  private listShaderPresets(): { label: string; value: string }[] {
    const root = join(getRetroBatPath(), 'riescade', 'shaders')
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => {
        if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.json') return false
        try {
          const profile = JSON.parse(readFileSync(join(root, entry.name), 'utf8'))
          const sections = [profile.default, ...Object.values(profile.systems || {})]
          return profile.$schema === 'riescade-shader-profile-v1' &&
            sections.some((section: any) => section?.shader || section?.shaderGL)
        } catch {
          return false
        }
      })
      .map(entry => {
        const value = basename(entry.name, extname(entry.name))
        return { label: value, value }
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }

  private listVideoFilters(): { label: string; value: string }[] {
    const root = join(getEmulatorsPath(), 'retroarch', 'filters', 'video')
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.filt')
      .map(entry => ({ label: entry.name.replace(/\.filt$/i, ''), value: entry.name }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }

  public getSchemaList(): { id: string; name: string; description?: string; icon?: string; groupCount: number; optionCount: number }[] {
    if (!this.loaded) this.loadAll()
    return Array.from(this.schemas.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      groupCount: s.groups.length,
      optionCount: s.groups.reduce((sum, g) => sum + g.options.length, 0)
    }))
  }

  public reload(): void {
    this.schemas.clear()
    this.loaded = false
    this.loadAll()
  }
}
