import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export class Pcsx2x6Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Pcsx2x6Generator: Configuring PCSX2x6`);
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const pcsx2Dir = join(emulatorsDir, 'pcsx2x6');
    
    let exePath = join(pcsx2Dir, 'pcsx2-qt.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Pcsx2x6Generator: PCSX2x6 executable not found at ${exePath}. Falling back to default path.`);
    }

    const commandArgs: string[] = [
      '-batch',
      '-nogui',
      '-fullscreen',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
