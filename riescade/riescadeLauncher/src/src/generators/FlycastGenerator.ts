import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class FlycastGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`FlycastGenerator: Configuring Flycast`);
    
    const emulatorsDir = getEmulatorsPath();
    const flycastDir = join(emulatorsDir, 'flycast');
    const configPath = join(flycastDir, 'emu.cfg');

    try {
      const fullscreen = (Config.getEmulatorSetting('flycast', 'fullscreen') ?? Config.getEmulatorSetting('flycast', 'forcefullscreen') ?? Config.getEmulatorSetting('flycast', 'flycast_fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('flycast', 'vsync') ?? Config.getEmulatorSetting('flycast', 'flycast_vsync', 'true')) === 'true';
      
      updateIniSetting(configPath, 'config', 'window.fullscreen', fullscreen ? 'yes' : 'no');
      updateIniSetting(configPath, 'config', 'video.VSync', vsync ? 'yes' : 'no');

      Logger.info(`FlycastGenerator: Updated emu.cfg (Fullscreen: ${fullscreen}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`FlycastGenerator: Failed to update emu.cfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const flycastDir = join(emulatorsDir, 'flycast');
    const exePath = join(flycastDir, 'flycast.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`FlycastGenerator: Flycast executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: [this.rom],
    };
  }
}
