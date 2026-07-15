import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class EdenGenerator extends BaseGenerator {
  public configure(): void {
    const emuName = this.emulator.toLowerCase(); // 'eden' or 'eden-nightly'
    Logger.info(`EdenGenerator: Configuring ${emuName}`);
    
    const emulatorsDir = getEmulatorsPath();
    const edenDir = join(emulatorsDir, emuName);
    const configPath = join(edenDir, 'user', 'config', 'qt-config.ini');

    // Make sure parent folders exist
    try {
      const configDir = dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
    } catch (e) {}

    try {
      const fullscreen = (Config.getEmulatorSetting(emuName, 'fullscreen') ?? Config.getEmulatorSetting(emuName, 'forcefullscreen') ?? Config.getEmulatorSetting(emuName, `${emuName}_fullscreen`, 'true')) === 'true';
      const vsync = Config.getEmulatorSetting(emuName, `${emuName}_vsync`);
      const docked = (Config.getEmulatorSetting(emuName, `${emuName}_undock`) ?? 'false') !== 'true';

      updateIniSetting(configPath, 'UI', 'fullscreen', fullscreen ? 'true' : 'false');
      updateIniSetting(configPath, 'UI', 'fullscreen\\default', 'false');

      if (vsync !== undefined) {
        // vsync: '0' = Off, '1' = FIFO (On), '2' = Mailbox, etc.
        const vsyncVal = vsync === 'true' || vsync === '1' ? '1' : (vsync === 'false' || vsync === '0' ? '0' : vsync);
        updateIniSetting(configPath, 'Renderer', 'use_vsync', vsyncVal);
        updateIniSetting(configPath, 'Renderer', 'use_vsync\\default', 'false');
      }

      updateIniSetting(configPath, 'System', 'use_docked_mode', docked ? 'true' : 'false');
      updateIniSetting(configPath, 'System', 'use_docked_mode\\default', 'false');

      Logger.info(`EdenGenerator: Updated qt-config.ini (Fullscreen: ${fullscreen}, VSync: ${vsync}, Docked: ${docked})`);
    } catch (err) {
      Logger.error(`EdenGenerator: Failed to update qt-config.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const emuName = this.emulator.toLowerCase();
    const edenDir = join(emulatorsDir, emuName);
    const exePath = join(edenDir, 'eden.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`EdenGenerator: Eden executable not found at ${exePath}.`);
    }

    const fullscreen = (Config.getEmulatorSetting(emuName, 'fullscreen') ?? Config.getEmulatorSetting(emuName, `${emuName}_fullscreen`, 'true')) === 'true';

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
