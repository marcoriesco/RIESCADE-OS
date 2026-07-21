import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Mupen64Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Mupen64Generator: Configuring mupen64`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'mupen64', 'mupen64plus.cfg');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'mupen64.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('mupen64', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`Mupen64Generator: Failed to configure mupen64plus.cfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'mupen64', 'RMG.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Mupen64Generator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('mupen64', 'fullscreen', 'true') === 'true';
    if (fullscreen) {
      commandArgs.push('-f');
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
