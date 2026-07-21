import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class ArcadeFlashWebGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`ArcadeFlashWebGenerator: Configuring ArcadeFlashWeb`);
    // No config file detected for configuring
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'ArcadeFlashWeb', 'ArcadeFlashWeb.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`ArcadeFlashWebGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('arcadeflashweb', 'fullscreen', 'true') === 'true';
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
