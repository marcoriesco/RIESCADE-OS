import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getConfigsPath } from './utils/paths.js';
import { Logger } from './utils/logger.js';
import type { LaunchArgs } from './types.js';

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
  private static systemConfig: Record<string, any> = {};
  private static gameConfig: Record<string, any> = {};
  private static inheritanceMap: Record<string, Record<string, string>> = {};
  private static launchContext: Pick<LaunchArgs, 'system' | 'emulator' | 'core' | 'rom' | 'gameConfigKey'> | null = null;
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
    const currentEmulatorFile = join(configsDir, 'emulator-settings.json');
    const legacyEmulatorFile = join(configsDir, 'emulator.json');
    const legacyMigrationPending = existsSync(legacyEmulatorFile)
      && !existsSync(join(configsDir, 'emulator.json.migrated'));
    const emulatorFile = legacyMigrationPending
      ? legacyEmulatorFile
      : (existsSync(currentEmulatorFile) ? currentEmulatorFile : legacyEmulatorFile);
    if (existsSync(emulatorFile)) {
      try {
        const raw = readFileSync(emulatorFile, 'utf8');
        this.emulatorConfig = JSON.parse(raw);
        Logger.debug(`Loaded ${emulatorFile.endsWith('emulator-settings.json') ? 'emulator-settings.json' : 'legacy emulator.json'} (${Object.keys(this.emulatorConfig).length} entries)`);
      } catch (err) {
        Logger.error(`Failed to parse emulator settings`, err);
      }
    } else {
      Logger.warn(`Emulator settings not found at ${emulatorFile}`);
    }

    this.systemConfig = this.readScopedSettings(join(configsDir, 'system-settings.json'), 'systems');
    this.gameConfig = this.readScopedSettings(join(configsDir, 'game-settings.json'), 'games');

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
        const globalConfig = this.emulatorConfig['_global'] || this.emulatorConfig['global'];
        if (globalConfig) {
          const globalVal = globalConfig[globalKey];
          if (globalVal !== undefined && globalVal !== 'auto') {
            val = globalVal;
          }
        }
      }
    }

    if (val === undefined || val === 'auto') val = defaultValue;

    const context = this.launchContext;
    const coreConfig = emulator === 'libretro' && context?.core
      ? this.emulatorConfig['libretro']?.cores?.[context.core]?.[key]
        ?? this.emulatorConfig['libretro']?.[`core.${context.core}.${key}`]
      : undefined;
    if (coreConfig !== undefined && coreConfig !== 'auto') val = coreConfig;

    return this.applyScopedOverrides(key, val);
  }

  public static getCoreSetting(core: string, key: string, defaultValue?: any): any {
    this.load();
    const retroarch = this.emulatorConfig['libretro'] || {};
    const coreValue = retroarch[`core.${core}.${key}`] ?? retroarch.cores?.[core]?.[key];
    if (coreValue !== undefined && coreValue !== 'auto') return this.applyScopedOverrides(key, coreValue);
    return this.getEmulatorSetting('libretro', key, defaultValue);
  }

  public static setLaunchContext(args: LaunchArgs): void {
    this.launchContext = {
      system: args.system,
      emulator: args.emulator,
      core: args.core,
      rom: args.rom,
      gameConfigKey: args.gameConfigKey,
    };
  }

  private static readScopedSettings(filePath: string, collection: 'systems' | 'games'): Record<string, any> {
    if (!existsSync(filePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      return parsed?.[collection] && typeof parsed[collection] === 'object' ? parsed[collection] : {};
    } catch (err) {
      Logger.error(`Failed to parse ${filePath}`, err);
      return {};
    }
  }

  private static scopeMatches(entry: any, context: Pick<LaunchArgs, 'emulator' | 'core'>): boolean {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.emulator && entry.emulator !== 'auto' && entry.emulator !== context.emulator) return false;
    if (entry.core && entry.core !== 'auto' && entry.core !== context.core) return false;
    return true;
  }

  private static applyScopedOverrides(key: string, inheritedValue: any): any {
    const context = this.launchContext;
    if (!context) return inheritedValue;
    let value = inheritedValue;
    const systemEntry = this.systemConfig[`${context.system}|${context.emulator}|${context.core || ''}`]
      || this.systemConfig[context.system];
    if (this.scopeMatches(systemEntry, context)) {
      const systemValue = systemEntry?.settings?.[key];
      if (systemValue !== undefined && systemValue !== 'auto') value = systemValue;
    }
    const gameKey = context.gameConfigKey || `${context.system}|${this.normalizeRom(context.rom)}`;
    const gameEntry = this.gameConfig[gameKey];
    if (this.scopeMatches(gameEntry, context)) {
      const gameValue = gameEntry?.settings?.[key];
      if (gameValue !== undefined && gameValue !== 'auto') value = gameValue;
    }
    return value;
  }

  private static normalizeRom(value: string): string {
    return String(value || '').replace(/\\/g, '/');
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
