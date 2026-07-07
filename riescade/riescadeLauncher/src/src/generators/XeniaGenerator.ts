import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export class XeniaGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`XeniaGenerator: Configuring Xenia/Xenia-Canary`);
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const isCanary = this.emulator.toLowerCase() === 'xenia-canary';
    const targetFolder = isCanary ? 'xenia-canary' : 'xenia';
    const exeName = isCanary ? 'xenia_canary.exe' : 'xenia.exe';
    const exePath = join(emulatorsDir, targetFolder, exeName);

    if (!existsSync(exePath)) {
      Logger.warn(`XeniaGenerator: Xenia executable not found at ${exePath}. Falling back to default path.`);
    }

    const commandArgs: string[] = [
      '--fullscreen',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
