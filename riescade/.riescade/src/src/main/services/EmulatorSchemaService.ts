import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getRiescadePath } from '../utils/paths'

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
    return join(getRiescadePath(), 'configs', 'emulator-schemas')
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
    return this.schemas.get(id) || null
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
