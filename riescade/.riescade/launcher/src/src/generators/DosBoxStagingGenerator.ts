import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class DosBoxStagingGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`DosBoxStagingGenerator: Configuring dosbox-staging`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'dosbox-staging', 'dosbox-staging.conf');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'dosboxstaging.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('dosboxstaging', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`DosBoxStagingGenerator: Failed to configure dosbox-staging.conf`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'dosbox-staging', 'dosbox.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`DosBoxStagingGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('dosboxstaging', 'fullscreen', 'true') === 'true';
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
