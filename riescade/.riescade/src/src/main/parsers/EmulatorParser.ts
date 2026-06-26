import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getRiescadePath } from '../utils/paths'

export class EmulatorParser {
  constructor() {}

  private getEmulatorJsonPath(): string {
    return join(getRiescadePath(), 'configs', 'emulator.json')
  }

  public getAllSettings(): any {
    const filePath = this.getEmulatorJsonPath()
    if (!existsSync(filePath)) return {}

    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error parsing emulator.json:', error)
      return {}
    }
  }

  public saveSetting(emulator: string, name: string, value: any): void {
    const filePath = this.getEmulatorJsonPath()
    const allSettings = this.getAllSettings()

    if (!allSettings[emulator]) {
      allSettings[emulator] = {}
    }

    allSettings[emulator][name] = value

    try {
      const jsonContent = JSON.stringify(allSettings, null, 2)
      writeFileSync(filePath, jsonContent, 'utf-8')
    } catch (error) {
      console.error('Error saving emulator setting:', error)
    }
  }
}
