import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class CitronGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`CitronGenerator: Configuring Citron`);
    
    const emulatorsDir = getEmulatorsPath();
    const citronDir = join(emulatorsDir, 'citron');
    const configPath = join(citronDir, 'user', 'config', 'qt-config.ini');

    // Make sure parent folders exist
    try {
      const configDir = dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
    } catch (e) {}

    try {
      const fullscreen = Config.getEmulatorSetting('citron', 'fullscreen', 'true') === 'true';
      const vsync = Config.getEmulatorSetting('citron', 'vsync');
      const docked = (Config.getEmulatorSetting('citron', 'citron_undock') ?? 'false') !== 'true';

      updateIniSetting(configPath, 'UI', 'fullscreen', fullscreen ? 'true' : 'false');
      updateIniSetting(configPath, 'UI', 'fullscreen\\default', 'false');

      if (vsync !== undefined) {
        const vsyncVal = vsync === 'true' || vsync === '1' ? '1' : (vsync === 'false' || vsync === '0' ? '0' : vsync);
        updateIniSetting(configPath, 'Renderer', 'use_vsync', vsyncVal);
        updateIniSetting(configPath, 'Renderer', 'use_vsync\\default', 'false');
      }

      updateIniSetting(configPath, 'System', 'use_docked_mode', docked ? 'true' : 'false');
      updateIniSetting(configPath, 'System', 'use_docked_mode\\default', 'false');

      Logger.info(`CitronGenerator: Updated qt-config.ini (Fullscreen: ${fullscreen}, VSync: ${vsync}, Docked: ${docked})`);
    } catch (err) {
      Logger.error(`CitronGenerator: Failed to update qt-config.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const citronDir = join(emulatorsDir, 'citron');
    const exePath = join(citronDir, 'citron-cmd.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`CitronGenerator: Citron executable not found at ${exePath}.`);
    }

    const fullscreen = Config.getEmulatorSetting('citron', 'fullscreen', 'true') === 'true';

    const launchArgs: string[] = [];
    if (fullscreen) {
      launchArgs.push('-f');
    }
    launchArgs.push('-g', this.rom);

    return {
      executable: exePath,
      args: launchArgs,
    };
  }
}
