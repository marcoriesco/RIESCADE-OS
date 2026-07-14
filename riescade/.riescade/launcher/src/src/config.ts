import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getConfigsPath } from './utils/paths.js';
import { Logger } from './utils/logger.js';

export interface SettingItem {
  value: any;
  type: string;
}

export interface InputItem {
  name: string;
  type: 'key' | 'button' | 'axis' | 'hat';
  id: number;
  value: number;
  code?: number; // Optional keyboard scan code or button code
}

export interface InputConfig {
  type: 'keyboard' | 'joystick';
  deviceName: string;
  deviceGUID: string | number;
  deviceIndex?: number;
  inputs: InputItem[];
}

export interface InputJson {
  inputConfigs: InputConfig[];
}

export class Config {
  private static settings: Record<string, SettingItem> = {};
  private static input: InputJson = { inputConfigs: [] };
  private static systems: any = null;
  private static features: any = null;
  private static emulatorConfig: Record<string, any> = {};
  private static loaded = false;

  public static load() {
    if (this.loaded) return;

    const configsDir = getConfigsPath();
    Logger.info(`Loading configurations from: ${configsDir}`);

    // Load Settings
    const settingsFile = join(configsDir, 'settings.json');
    if (existsSync(settingsFile)) {
      try {
        const raw = readFileSync(settingsFile, 'utf8');
        this.settings = JSON.parse(raw);
        Logger.debug(`Loaded settings.json (${Object.keys(this.settings).length} entries)`);
      } catch (err) {
        Logger.error(`Failed to parse settings.json`, err);
      }
    } else {
      Logger.warn(`settings.json not found at ${settingsFile}`);
    }

    // Load Input Configs
    const inputFile = join(configsDir, 'input.json');
    if (existsSync(inputFile)) {
      try {
        const raw = readFileSync(inputFile, 'utf8');
        this.input = JSON.parse(raw);
        Logger.debug(`Loaded input.json (${this.input.inputConfigs?.length || 0} configurations)`);
      } catch (err) {
        Logger.error(`Failed to parse input.json`, err);
      }
    } else {
      Logger.warn(`input.json not found at ${inputFile}`);
    }

    // Load Systems
    const systemsFile = join(configsDir, 'systems.json');
    if (existsSync(systemsFile)) {
      try {
        const raw = readFileSync(systemsFile, 'utf8');
        this.systems = JSON.parse(raw);
      } catch (err) {
        Logger.error(`Failed to parse systems.json`, err);
      }
    }

    // Load Features
    const featuresFile = join(configsDir, 'features.json');
    if (existsSync(featuresFile)) {
      try {
        const raw = readFileSync(featuresFile, 'utf8');
        this.features = JSON.parse(raw);
      } catch (err) {
        Logger.error(`Failed to parse features.json`, err);
      }
    }
    // Load Emulator Settings
    const emulatorFile = join(configsDir, 'emulator.json');
    if (existsSync(emulatorFile)) {
      try {
        const raw = readFileSync(emulatorFile, 'utf8');
        this.emulatorConfig = JSON.parse(raw);
        Logger.debug(`Loaded emulator.json (${Object.keys(this.emulatorConfig).length} entries)`);
      } catch (err) {
        Logger.error(`Failed to parse emulator.json`, err);
      }
    } else {
      Logger.warn(`emulator.json not found at ${emulatorFile}`);
    }

    this.loaded = true;
  }

  public static getSetting(key: string, defaultValue?: any): any {
    this.load();
    const item = this.settings[key];
    if (item === undefined) return defaultValue;
    return item.value;
  }

  private static readonly GLOBAL_KEY_MAP: Record<string, string> = {
    // Fullscreen
    'fullscreen': 'fullscreen',
    'forcefullscreen': 'fullscreen',
    'ares_fullscreen': 'fullscreen',
    'bigpemu_fullscreen': 'fullscreen',
    'cemu_fullscreen': 'fullscreen',
    'dolphin_fullscreen': 'fullscreen',
    'duckstation_fullscreen': 'fullscreen',
    'flycast_fullscreen': 'fullscreen',
    'mame64_fullscreen': 'fullscreen',
    'model2_fullscreen': 'fullscreen',
    'supermodel_fullscreen': 'fullscreen',
    'pcsx2_fullscreen': 'fullscreen',
    'pcsx2x6_fullscreen': 'fullscreen',
    'ppsspp_fullscreen': 'fullscreen',
    'redream_fullscreen': 'fullscreen',
    'rpcs3_fullscreen': 'fullscreen',
    'ryujinx_fullscreen': 'fullscreen',
    'shadps4_fullscreen': 'fullscreen',
    'teknoparrot_fullscreen': 'fullscreen',
    'vita3k_fullscreen': 'fullscreen',
    'xemu_fullscreen': 'fullscreen',
    'xenia_fullscreen': 'fullscreen',
    
    // Video Driver
    'backend': 'video_driver',
    'dolphin_backend': 'video_driver',
    'renderer': 'video_driver',
    'video_renderer': 'video_driver',
    'duckstation_renderer': 'video_driver',
    'gfxbackend': 'video_driver',
    'video': 'video_driver',
    'mame64_video': 'video_driver',
    'pcsx2_renderer': 'video_driver',
    'pcsx2x6_renderer': 'video_driver',
    'backend-renderer': 'video_driver',
    'gpu': 'video_driver',
    'xenia_gpu': 'video_driver',
    'video_driver': 'video_driver',
    
    // Audio Driver
    'sound': 'audio_driver',
    'mame64_sound': 'audio_driver',
    'audio_driver': 'audio_driver',
    'ares_audio_renderer': 'audio_driver',
    'audio_backend': 'audio_driver',
    
    // Resolution
    'videomode': 'resolution',
    'resolution': 'resolution',
    'xenia_resolution': 'resolution',
    'tp_play_resolution': 'resolution',
    'rpcs3_internal_resolution': 'resolution',
    'internal_resolution': 'resolution',
    'res_scale': 'resolution',
    'render_scale': 'resolution',
    'internalresolution': 'resolution',
    
    // VSync
    'vsync': 'vsync',
    'bigpemu_vsync': 'vsync',
    'cemu_vsync': 'vsync',
    'dolphin_vsync': 'vsync',
    'duckstation_vsync': 'vsync',
    'flycast_vsync': 'vsync',
    'mame64_vsync': 'vsync',
    'model2_vsync': 'vsync',
    'supermodel_vsync': 'vsync',
    'pcsx2_vsync': 'vsync',
    'ppsspp_vsync': 'vsync',
    'redream_vsync': 'vsync',
    'rpcs3_vsync': 'vsync',
    'ryujinx_vsync': 'vsync',
    'vita3k_vsync': 'vsync',
    'xemu_vsync': 'vsync',
    'xenia_vsync': 'vsync',
    'video_vsync': 'vsync',
    
    // HDR
    'enable_hdr': 'hdr',
    'hdr': 'hdr',
    
    // Monitor Index
    'MonitorIndex': 'monitor_index',
    'monitor_index': 'monitor_index',
    
    // GPU Index
    'GPUIndex': 'gpu_index',
    'gpu_index': 'gpu_index',
    
    // Shaders
    'shaderset': 'shaders',
    'shaders': 'shaders',
    'dolphin_shaders': 'shaders',
    
    // Bezels
    'bezel': 'bezels',
    'bezels': 'bezels',
    
    // Filters
    'videofilters': 'filters',
    'filters': 'filters',
    
    // Discord
    'discord': 'discord',
    'psvita.discord': 'discord',
    'switch.discord': 'discord'
  };

  public static getEmulatorSetting(emulator: string, key: string, defaultValue?: any): any {
    this.load();
    const emuConfig = this.emulatorConfig[emulator];
    let val = emuConfig ? emuConfig[key] : undefined;

    // Fall back to global if specific setting is not defined or set to 'auto'
    if ((val === undefined || val === 'auto') && emulator !== 'global') {
      const globalKey = this.GLOBAL_KEY_MAP[key];
      if (globalKey) {
        const globalConfig = this.emulatorConfig['global'];
        if (globalConfig) {
          const globalVal = globalConfig[globalKey];
          if (globalVal !== undefined && globalVal !== 'auto') {
            val = globalVal;
          }
        }
      }
    }

    if (val === undefined) return defaultValue;
    return val;
  }

  public static getInputConfig(): InputJson {
    this.load();
    return this.input;
  }

  public static getSystems(): any {
    this.load();
    return this.systems;
  }

  public static getFeatures(): any {
    this.load();
    return this.features;
  }
}
