import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class WinArcadiaGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`WinArcadiaGenerator: Configuring winarcadia`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'winarcadia', 'RAPrefs_WinArcadia.cfg');

    try {
      const schemaPath = join(process.cwd(), 'configs', 'emulator-schemas', 'winarcadia.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('winarcadia', opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`WinArcadiaGenerator: Failed to configure RAPrefs_WinArcadia.cfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'winarcadia', 'WinArcadia.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`WinArcadiaGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('winarcadia', 'fullscreen', 'true') === 'true';
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
