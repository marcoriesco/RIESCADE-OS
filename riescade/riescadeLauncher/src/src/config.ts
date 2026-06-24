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

    this.loaded = true;
  }

  public static getSetting(key: string, defaultValue?: any): any {
    this.load();
    const item = this.settings[key];
    if (item === undefined) return defaultValue;
    return item.value;
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
