import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getRiescadePath } from '../utils/paths'

// Map of emulator-specific keys → global keys (same as launcher config.ts GLOBAL_KEY_MAP)
const GLOBAL_KEY_MAP: Record<string, string> = {
  fullscreen: 'fullscreen',
  forcefullscreen: 'fullscreen',
  ares_fullscreen: 'fullscreen',
  bigpemu_fullscreen: 'fullscreen',
  cemu_fullscreen: 'fullscreen',
  dolphin_fullscreen: 'fullscreen',
  duckstation_fullscreen: 'fullscreen',
  flycast_fullscreen: 'fullscreen',
  mame64_fullscreen: 'fullscreen',
  model2_fullscreen: 'fullscreen',
  supermodel_fullscreen: 'fullscreen',
  pcsx2_fullscreen: 'fullscreen',
  pcsx2x6_fullscreen: 'fullscreen',
  ppsspp_fullscreen: 'fullscreen',
  redream_fullscreen: 'fullscreen',
  rpcs3_fullscreen: 'fullscreen',
  ryujinx_fullscreen: 'fullscreen',
  shadps4_fullscreen: 'fullscreen',
  teknoparrot_fullscreen: 'fullscreen',
  vita3k_fullscreen: 'fullscreen',
  xemu_fullscreen: 'fullscreen',
  xenia_fullscreen: 'fullscreen',
  backend: 'video_driver',
  dolphin_backend: 'video_driver',
  renderer: 'video_driver',
  video_renderer: 'video_driver',
  duckstation_renderer: 'video_driver',
  gfxbackend: 'video_driver',
  video: 'video_driver',
  mame64_video: 'video_driver',
  pcsx2_renderer: 'video_driver',
  pcsx2x6_renderer: 'video_driver',
  gpu: 'video_driver',
  xenia_gpu: 'video_driver',
  video_driver: 'video_driver',
  sound: 'audio_driver',
  mame64_sound: 'audio_driver',
  audio_driver: 'audio_driver',
  ares_audio_renderer: 'audio_driver',
  audio_backend: 'audio_driver',
  videomode: 'resolution',
  resolution: 'resolution',
  xenia_resolution: 'resolution',
  tp_play_resolution: 'resolution',
  rpcs3_internal_resolution: 'resolution',
  internal_resolution: 'resolution',
  res_scale: 'resolution',
  render_scale: 'resolution',
  internalresolution: 'resolution',
  vsync: 'vsync',
  bigpemu_vsync: 'vsync',
  cemu_vsync: 'vsync',
  dolphin_vsync: 'vsync',
  duckstation_vsync: 'vsync',
  flycast_vsync: 'vsync',
  mame64_vsync: 'vsync',
  model2_vsync: 'vsync',
  supermodel_vsync: 'vsync',
  pcsx2_vsync: 'vsync',
  ppsspp_vsync: 'vsync',
  redream_vsync: 'vsync',
  rpcs3_vsync: 'vsync',
  ryujinx_vsync: 'vsync',
  vita3k_vsync: 'vsync',
  xemu_vsync: 'vsync',
  xenia_vsync: 'vsync',
  video_vsync: 'vsync',
  enable_hdr: 'hdr',
  hdr: 'hdr',
  MonitorIndex: 'monitor_index',
  monitor_index: 'monitor_index',
  GPUIndex: 'gpu_index',
  gpu_index: 'gpu_index',
  shaderset: 'shaders',
  shaders: 'shaders',
  dolphin_shaders: 'shaders',
  bezel: 'bezels',
  bezels: 'bezels',
  videofilters: 'filters',
  filters: 'filters',
  discord: 'discord',
  aspect_ratio: 'aspect_ratio',
  retroarch_aspect_ratio: 'aspect_ratio'
}

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

  /**
   * Get resolved settings for an emulator, merging global values where
   * the emulator-specific value is undefined or 'auto'.
   */
  public getResolvedSettings(emulator: string): Record<string, { value: any; source: 'emulator' | 'global' | 'default' }> {
    const allSettings = this.getAllSettings()
    const globalConfig = allSettings['global'] || {}
    const emuConfig = allSettings[emulator] || {}
    const result: Record<string, { value: any; source: 'emulator' | 'global' | 'default' }> = {}

    // First, include all emulator-specific settings
    for (const [key, val] of Object.entries(emuConfig)) {
      if (val !== undefined && val !== 'auto') {
        result[key] = { value: val, source: 'emulator' }
      } else {
        // Try to fall back to global
        const globalKey = GLOBAL_KEY_MAP[key]
        if (globalKey && globalConfig[globalKey] !== undefined && globalConfig[globalKey] !== 'auto') {
          result[key] = { value: globalConfig[globalKey], source: 'global' }
        } else {
          result[key] = { value: val ?? 'auto', source: 'default' }
        }
      }
    }

    // Also include global settings that aren't overridden
    for (const [globalKey, globalVal] of Object.entries(globalConfig)) {
      if (!result[globalKey]) {
        result[globalKey] = { value: globalVal, source: 'global' }
      }
    }

    return result
  }

  /**
   * Get the source of a specific setting ('emulator' | 'global' | 'default')
   */
  public getSettingSource(emulator: string, key: string): 'emulator' | 'global' | 'default' {
    const allSettings = this.getAllSettings()
    const emuConfig = allSettings[emulator] || {}
    const globalConfig = allSettings['global'] || {}

    const emuVal = emuConfig[key]
    if (emuVal !== undefined && emuVal !== 'auto') {
      return 'emulator'
    }

    const globalKey = GLOBAL_KEY_MAP[key]
    if (globalKey && globalConfig[globalKey] !== undefined && globalConfig[globalKey] !== 'auto') {
      return 'global'
    }

    return 'default'
  }

  /**
   * Reset a specific setting for an emulator (removes the override, falling back to global)
   */
  public resetSetting(emulator: string, key: string): void {
    const filePath = this.getEmulatorJsonPath()
    const allSettings = this.getAllSettings()

    if (allSettings[emulator] && allSettings[emulator][key] !== undefined) {
      delete allSettings[emulator][key]

      try {
        const jsonContent = JSON.stringify(allSettings, null, 2)
        writeFileSync(filePath, jsonContent, 'utf-8')
      } catch (error) {
        console.error('Error resetting emulator setting:', error)
      }
    }
  }

  /**
   * Reset all settings for an emulator
   */
  public resetAllSettings(emulator: string): void {
    if (emulator === 'global') return // Never reset global

    const filePath = this.getEmulatorJsonPath()
    const allSettings = this.getAllSettings()

    if (allSettings[emulator]) {
      allSettings[emulator] = {}

      try {
        const jsonContent = JSON.stringify(allSettings, null, 2)
        writeFileSync(filePath, jsonContent, 'utf-8')
      } catch (error) {
        console.error('Error resetting all emulator settings:', error)
      }
    }
  }
}
