import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Model2Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Model2Generator: Configuring Model 2 Emulator`);
    
    const emulatorsDir = getEmulatorsPath();
    const model2Dir = join(emulatorsDir, 'model2');
    const configPath = join(model2Dir, 'Emulator.ini');

    try {
      const fullscreen = (Config.getEmulatorSetting('model2', 'fullscreen') ?? Config.getEmulatorSetting('model2', 'forcefullscreen') ?? Config.getEmulatorSetting('model2', 'model2_fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('model2', 'vsync') ?? Config.getEmulatorSetting('model2', 'model2_vsync', 'true')) === 'true';

      updateIniSetting(configPath, 'Renderer', 'AutoFull', fullscreen ? '1' : '0');
      updateIniSetting(configPath, 'Renderer', 'ForceSync', vsync ? '1' : '0');

      Logger.info(`Model2Generator: Updated Emulator.ini (Fullscreen: ${fullscreen}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`Model2Generator: Failed to update Emulator.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const model2Dir = join(emulatorsDir, 'model2');
    const exePath = join(model2Dir, 'emulator.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Model2Generator: Model 2 emulator executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: [this.rom],
    };
  }
}
