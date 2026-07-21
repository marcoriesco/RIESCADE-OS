import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class HatariGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`HatariGenerator: Configuring hatari`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'hatari', 'hatari.cfg');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'hatari.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('hatari', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`HatariGenerator: Failed to configure hatari.cfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'hatari', 'hatari.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`HatariGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('hatari', 'fullscreen', 'true') === 'true';
    if (fullscreen) {
      commandArgs.push('--fullscreen');
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
