import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class DuckstationGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`DuckstationGenerator: Configuring DuckStation`);
    
    const emulatorsDir = getEmulatorsPath();
    const duckstationDir = join(emulatorsDir, 'duckstation');
    const iniPath = join(duckstationDir, 'settings.ini');

    try {
      const fullscreen = (Config.getEmulatorSetting('duckstation', 'duckstation_fullscreen') ?? Config.getEmulatorSetting('duckstation', 'forcefullscreen') ?? Config.getEmulatorSetting('duckstation', 'fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('duckstation', 'duckstation_vsync') ?? Config.getEmulatorSetting('duckstation', 'vsync', 'true')) === 'true';
      const renderer = Config.getEmulatorSetting('duckstation', 'duckstation_renderer') ?? Config.getEmulatorSetting('duckstation', 'renderer', 'D3D11');

      updateIniSetting(iniPath, 'Console', 'StartFullscreen', fullscreen);
      updateIniSetting(iniPath, 'Display', 'VSync', vsync);
      updateIniSetting(iniPath, 'Display', 'Renderer', renderer);

      Logger.info(`DuckstationGenerator: Updated settings.ini (Fullscreen: ${fullscreen}, VSync: ${vsync}, Renderer: ${renderer})`);
    } catch (err) {
      Logger.error(`DuckstationGenerator: Failed to update settings.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const duckstationDir = join(emulatorsDir, 'duckstation');
    
    let exePath = join(duckstationDir, 'duckstation-qt.exe');
    if (!existsSync(exePath)) {
      exePath = join(duckstationDir, 'duckstation.exe');
    }

    if (!existsSync(exePath)) {
      Logger.warn(`DuckstationGenerator: DuckStation executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      '-batch',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
