import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export class Pcsx2Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Pcsx2Generator: Configuring PCSX2`);
    // Custom configurations can be added here if needed, but standard standalone launches
    // are handled via CLI parameters.
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const pcsx2Dir = join(emulatorsDir, 'pcsx2');
    
    // Check if pcsx2-qt.exe exists (v1.7+), otherwise fall back to pcsx2.exe (v1.6)
    let exePath = join(pcsx2Dir, 'pcsx2-qt.exe');
    let isQt = true;

    if (!existsSync(exePath)) {
      exePath = join(pcsx2Dir, 'pcsx2.exe');
      isQt = false;
    }

    if (!existsSync(exePath)) {
      Logger.warn(`Pcsx2Generator: PCSX2 executable not found at ${exePath}. Falling back to default path.`);
    }

    const commandArgs: string[] = [];

    if (isQt) {
      commandArgs.push('-batch');
      commandArgs.push('-nogui');
      commandArgs.push('-fullscreen');
    } else {
      commandArgs.push('--portable');
      commandArgs.push('--fullscreen');
      commandArgs.push('--nogui');
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
