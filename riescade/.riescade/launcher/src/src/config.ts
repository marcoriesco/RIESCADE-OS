import { readFileSync, existsSync, readdirSync } from 'fs';
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
  private static inheritanceMap: Record<string, Record<string, string>> = {};
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

    // Load emulator schemas for inheritance resolution
    this.loadSchemas();

    this.loaded = true;
  }

  public static getSetting(key: string, defaultValue?: any): any {
    this.load();
    const item = this.settings[key];
    if (item === undefined) return defaultValue;
    return item.value;
  }

  public static getEmulatorSetting(emulator: string, key: string, defaultValue?: any): any {
    this.load();
    const emuConfig = this.emulatorConfig[emulator];
    let val = emuConfig ? emuConfig[key] : undefined;

    // Fall back to global if specific setting is not defined or set to 'auto'
    if ((val === undefined || val === 'auto') && emulator !== 'global') {
      // Look up inheritance from schema
      const emuInheritance = this.inheritanceMap[emulator];
      const globalKey = emuInheritance?.[key];
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

  private static loadSchemas(): void {
    const schemasDir = join(getConfigsPath(), 'emulator-schemas');
    if (!existsSync(schemasDir)) return;

    try {
      const files = readdirSync(schemasDir)
        .filter(f => f.endsWith('.schema.json') && !f.startsWith('_'));

      for (const file of files) {
        try {
          const raw = readFileSync(join(schemasDir, file), 'utf8');
          const schema = JSON.parse(raw);
          const emulatorId = schema.id;
          if (!emulatorId) continue;

          const mappings: Record<string, string> = {};

          // Extract from globalMappings (primary source)
          if (schema.globalMappings) {
            for (const mapping of Object.values(schema.globalMappings)) {
              const m = mapping as any;
              if (m.configKey && m.globalKey) {
                mappings[m.configKey] = m.globalKey;
              }
            }
          }

          // Also extract from options with inheritsGlobal
          for (const group of schema.groups || []) {
            for (const option of (group as any).options || []) {
              if (option.inheritsGlobal && option.configKey) {
                mappings[option.configKey] = option.inheritsGlobal;
              }
            }
          }

          if (Object.keys(mappings).length > 0) {
            this.inheritanceMap[emulatorId] = mappings;
          }
        } catch (err) {
          Logger.error(`Failed to parse emulator schema: ${file}`, err);
        }
      }

      Logger.debug(`Loaded inheritance mappings for ${Object.keys(this.inheritanceMap).length} emulators`);
    } catch (err) {
      Logger.error(`Failed to read emulator-schemas directory`, err);
    }
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
