import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';
import { resolveScummVmMarker } from '../utils/scummvm.js';

export class ScummVmGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`ScummVmGenerator: Configuring scummvm`);
    // No config file detected for configuring
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'scummvm', 'scummvm.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`ScummVmGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('scummvm', 'fullscreen', 'true') === 'true';
    if (fullscreen) {
      commandArgs.push('--fullscreen');
    }

    const marker = resolveScummVmMarker(this.rom);
    commandArgs.push(`--path=${dirname(marker.markerPath)}`);
    commandArgs.push(marker.target);
    Logger.info(`ScummVmGenerator: Using ${marker.markerPath} with target "${marker.target}".`);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
