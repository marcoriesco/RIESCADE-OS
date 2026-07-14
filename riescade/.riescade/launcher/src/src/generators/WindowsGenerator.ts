import { existsSync } from 'fs';
import { BaseGenerator } from './BaseGenerator.js';
import { Logger } from '../utils/logger.js';

export class WindowsGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`WindowsGenerator: No custom configuration required for Windows game`);
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    if (!existsSync(this.rom)) {
      Logger.warn(`WindowsGenerator: Executable or shortcut not found at: ${this.rom}`);
    }

    return {
      executable: this.rom,
      args: [],
    };
  }
}
