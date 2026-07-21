import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class JgenesisGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`JgenesisGenerator: Configuring jgenesis`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'jgenesis', 'jgenesis-config.toml');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'jgenesis.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('jgenesis', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`JgenesisGenerator: Failed to configure jgenesis-config.toml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'jgenesis', 'jgenesis-cli.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`JgenesisGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('jgenesis', 'fullscreen', 'true') === 'true';
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
