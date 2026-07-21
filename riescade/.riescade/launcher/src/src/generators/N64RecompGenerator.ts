import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class N64RecompGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`N64RecompGenerator: Configuring n64recomplauncher`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'n64recomplauncher', 'settings.json');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'n64recomp.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('n64recomp', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`N64RecompGenerator: Failed to configure settings.json`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'n64recomplauncher', 'N64RecompLauncher.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`N64RecompGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('n64recomp', 'fullscreen', 'true') === 'true';
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
