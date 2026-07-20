import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class RyujinxGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`RyujinxGenerator: Configuring Ryujinx`);
    
    const emulatorsDir = getEmulatorsPath();
    const ryujinxDir = join(emulatorsDir, 'ryujinx');
    let configPath = join(ryujinxDir, 'portable', 'Config.json');
    if (!existsSync(configPath)) {
      configPath = join(ryujinxDir, 'Config.json');
    }

    if (!existsSync(configPath)) {
      Logger.warn(`RyujinxGenerator: Config.json not found at ${configPath}.`);
      return;
    }

    try {
      const content = readFileSync(configPath, 'utf8');
      const json = JSON.parse(content);

      const fullscreen = (Config.getEmulatorSetting('ryujinx', 'ryujinx_fullscreen') ?? Config.getEmulatorSetting('ryujinx', 'forcefullscreen') ?? Config.getEmulatorSetting('ryujinx', 'fullscreen', 'true')) === 'true';
      const vsync = Config.getEmulatorSetting('ryujinx', 'ryujinx_vsync');
      const docked = (Config.getEmulatorSetting('ryujinx', 'ryujinx_undock') ?? 'false') !== 'true';

      json.start_fullscreen = fullscreen;
      if (vsync !== undefined) {
        json.vsync_mode = parseInt(vsync, 10);
      }
      json.docked_mode = docked;
      json.show_confirm_exit = false;
      json.check_updates_on_start = false;

      writeFileSync(configPath, JSON.stringify(json, null, 2), 'utf8');
      Logger.info(`RyujinxGenerator: Updated Config.json (Fullscreen: ${fullscreen}, VSync: ${vsync}, Docked: ${docked})`);
    } catch (err) {
      Logger.error(`RyujinxGenerator: Failed to update Config.json`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const ryujinxDir = join(emulatorsDir, 'ryujinx');
    const exePath = join(ryujinxDir, 'Ryujinx.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`RyujinxGenerator: Ryujinx executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: [this.rom],
    };
  }
}
