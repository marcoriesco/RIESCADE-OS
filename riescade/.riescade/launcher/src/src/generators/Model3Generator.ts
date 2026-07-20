import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Model3Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Model3Generator: Configuring Model 3 (Supermodel)`);
    
    const emulatorsDir = getEmulatorsPath();
    const model3Dir = join(emulatorsDir, 'model3');
    const configPath = join(model3Dir, 'Config', 'Supermodel.ini');

    try {
      const fullscreen = (Config.getEmulatorSetting('supermodel', 'supermodel_fullscreen') ?? Config.getEmulatorSetting('supermodel', 'forcefullscreen') ?? Config.getEmulatorSetting('supermodel', 'fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('supermodel', 'supermodel_vsync') ?? Config.getEmulatorSetting('supermodel', 'vsync', 'true')) === 'true';

      updateIniSetting(configPath, 'Global', 'FullScreen', fullscreen ? '1' : '0');
      updateIniSetting(configPath, 'Global', 'VSync', vsync ? '1' : '0');

      Logger.info(`Model3Generator: Updated Supermodel.ini (FullScreen: ${fullscreen}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`Model3Generator: Failed to update Supermodel.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const model3Dir = join(emulatorsDir, 'model3');
    const exePath = join(model3Dir, 'Supermodel.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Model3Generator: Supermodel executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: [this.rom],
    };
  }
}
