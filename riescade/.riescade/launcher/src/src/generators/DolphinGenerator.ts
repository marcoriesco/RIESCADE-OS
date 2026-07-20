import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class DolphinGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`DolphinGenerator: Configuring Dolphin`);

    const emulatorsDir = getEmulatorsPath();
    const dolphinDir = join(emulatorsDir, 'dolphin-emu');
    const dolphinIniPath = join(dolphinDir, 'User', 'Config', 'Dolphin.ini');
    const gfxIniPath = join(dolphinDir, 'User', 'Config', 'GFX.ini');

    try {
      const fullscreen = Config.getEmulatorSetting('dolphin', 'fullscreen', 'true') === 'true';
      const backend = Config.getEmulatorSetting('dolphin', 'video_driver', 'Vulkan');
      const aspect = Config.getEmulatorSetting('dolphin', 'aspect_ratio', '0');
      const vsync = Config.getEmulatorSetting('dolphin', 'vsync', 'true') === 'true';

      // Dolphin.ini updates
      updateIniSetting(dolphinIniPath, 'Display', 'Fullscreen', fullscreen ? 'True' : 'False');
      updateIniSetting(dolphinIniPath, 'Core', 'GFXBackend', backend);

      // GFX.ini updates
      updateIniSetting(gfxIniPath, 'Settings', 'AspectRatio', aspect);
      updateIniSetting(gfxIniPath, 'Hardware', 'VSync', vsync ? 'True' : 'False');

      Logger.info(`DolphinGenerator: Updated Dolphin configs (Fullscreen: ${fullscreen}, GFXBackend: ${backend}, AspectRatio: ${aspect}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`DolphinGenerator: Failed to configure Dolphin INI files`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const dolphinDir = join(emulatorsDir, 'dolphin-emu');
    const exePath = join(dolphinDir, 'Dolphin.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`DolphinGenerator: Dolphin executable not found at ${exePath}. Falling back to default path.`);
    }

    const fullscreen = Config.getEmulatorSetting('dolphin', 'fullscreen', 'true') === 'true';

    const commandArgs: string[] = [
      '-b', // Run in batch mode (nogui)
      '-e', // Open the ROM
    ];

    if (fullscreen) {
      commandArgs.push('-f'); // Open in fullscreen
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
