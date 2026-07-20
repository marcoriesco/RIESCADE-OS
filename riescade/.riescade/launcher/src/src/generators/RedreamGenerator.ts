import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class RedreamGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`RedreamGenerator: Configuring Redream`);
    
    const emulatorsDir = getEmulatorsPath();
    const redreamDir = join(emulatorsDir, 'redream');
    const configPath = join(redreamDir, 'redream.cfg');

    try {
      const fullscreen = (Config.getEmulatorSetting('redream', 'redream_fullscreen') ?? Config.getEmulatorSetting('redream', 'forcefullscreen') ?? Config.getEmulatorSetting('redream', 'fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('redream', 'redream_vsync') ?? Config.getEmulatorSetting('redream', 'vsync', 'true')) === 'true';

      updateIniSetting(configPath, '', 'fullmode', fullscreen ? 'borderless fullscreen' : 'windowed');
      updateIniSetting(configPath, '', 'mode', fullscreen ? 'borderless fullscreen' : 'windowed');
      updateIniSetting(configPath, '', 'vsync', vsync ? '1' : '0');

      Logger.info(`RedreamGenerator: Updated redream.cfg (Fullscreen: ${fullscreen}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`RedreamGenerator: Failed to update redream.cfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const redreamDir = join(emulatorsDir, 'redream');
    const exePath = join(redreamDir, 'redream.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`RedreamGenerator: Redream executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: [this.rom],
    };
  }
}
