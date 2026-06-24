import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export class DolphinGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`DolphinGenerator: Configuring Dolphin`);
    // Custom configurations can be added here if needed.
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const dolphinDir = join(emulatorsDir, 'dolphin-emu');
    const exePath = join(dolphinDir, 'Dolphin.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`DolphinGenerator: Dolphin executable not found at ${exePath}. Falling back to default path.`);
    }

    const commandArgs: string[] = [
      '-b', // Run in batch mode (nogui)
      '-e', // Open the ROM
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
