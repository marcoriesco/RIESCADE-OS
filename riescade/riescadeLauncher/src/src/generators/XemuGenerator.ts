import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class XemuGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`XemuGenerator: Configuring Xemu`);
    
    const emulatorsDir = getEmulatorsPath();
    const xemuDir = join(emulatorsDir, 'xemu');
    const configPath = join(xemuDir, 'xemu.toml');

    try {
      const vsync = (Config.getEmulatorSetting('xemu', 'vsync') ?? Config.getEmulatorSetting('xemu', 'xemu_vsync', 'true')) === 'true';
      const renderScale = Config.getEmulatorSetting('xemu', 'render_scale') ?? '1';

      updateIniSetting(configPath, 'display.window', 'vsync', vsync ? 'true' : 'false');
      updateIniSetting(configPath, 'display.quality', 'surface_scale', renderScale);

      Logger.info(`XemuGenerator: Updated xemu.toml (VSync: ${vsync}, surface_scale: ${renderScale})`);
    } catch (err) {
      Logger.error(`XemuGenerator: Failed to update xemu.toml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const xemuDir = join(emulatorsDir, 'xemu');
    const exePath = join(xemuDir, 'xemu.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`XemuGenerator: Xemu executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      '-dvd',
      this.rom
    ];
    const fullscreen = (Config.getEmulatorSetting('xemu', 'fullscreen') ?? Config.getEmulatorSetting('xemu', 'forcefullscreen') ?? Config.getEmulatorSetting('xemu', 'xemu_fullscreen', 'true')) === 'true';

    if (fullscreen) {
      commandArgs.push('-fullscreen');
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
