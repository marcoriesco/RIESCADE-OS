import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getConfigsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class DosBoxStagingGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`DosBoxStagingGenerator: Configuring dosbox-staging`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'dosbox-staging', 'dosbox-staging.conf');

    try {
      const schemaPath = join(getConfigsPath(), 'emulator-schemas', 'dosbox-staging.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('dosbox-staging', opt.configKey || opt.id, opt.default || 'auto');
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
    
    const fullscreen = Config.getEmulatorSetting('dosbox-staging', 'fullscreen', 'true') === 'true';
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
