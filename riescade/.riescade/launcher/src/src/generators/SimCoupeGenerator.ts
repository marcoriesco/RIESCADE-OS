import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class SimCoupeGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`SimCoupeGenerator: Configuring simcoupe`);
    // No config file detected for configuring
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'simcoupe', 'simcoupe.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`SimCoupeGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('simcoupe', 'fullscreen', 'true') === 'true';
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
