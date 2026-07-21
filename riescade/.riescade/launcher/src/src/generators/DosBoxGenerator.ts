import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class DosBoxGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`DosBoxGenerator: Configuring dosbox`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'dosbox', 'dosbox.cfg');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'dosbox.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('dosbox', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`DosBoxGenerator: Failed to configure dosbox.cfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'dosbox', 'dosbox.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`DosBoxGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('dosbox', 'fullscreen', 'true') === 'true';
    if (fullscreen) {
      commandArgs.push('-fullscreen');
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
