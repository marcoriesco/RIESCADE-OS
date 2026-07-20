import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class PpssppGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`PpssppGenerator: Configuring PPSSPP`);
    
    const emulatorsDir = getEmulatorsPath();
    const ppssppDir = join(emulatorsDir, 'ppsspp');
    let iniPath = join(ppssppDir, 'memstick', 'PSP', 'SYSTEM', 'ppsspp.ini');
    if (!existsSync(iniPath)) {
      iniPath = join(ppssppDir, 'ppsspp.ini');
    }

    try {
      const fullscreen = (Config.getEmulatorSetting('ppsspp', 'ppsspp_fullscreen') ?? Config.getEmulatorSetting('ppsspp', 'forcefullscreen') ?? Config.getEmulatorSetting('ppsspp', 'fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('ppsspp', 'ppsspp_vsync') ?? Config.getEmulatorSetting('ppsspp', 'vsync', 'true')) === 'true';
      
      updateIniSetting(iniPath, 'Graphics', 'FullScreen', fullscreen ? 'True' : 'False');
      updateIniSetting(iniPath, 'Graphics', 'VSync', vsync ? 'True' : 'False');

      Logger.info(`PpssppGenerator: Updated ppsspp.ini (FullScreen: ${fullscreen}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`PpssppGenerator: Failed to update ppsspp.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const ppssppDir = join(emulatorsDir, 'ppsspp');
    
    let exePath = join(ppssppDir, 'PPSSPPWindows64.exe');
    if (!existsSync(exePath)) {
      exePath = join(ppssppDir, 'PPSSPP.exe');
    }

    if (!existsSync(exePath)) {
      Logger.warn(`PpssppGenerator: PPSSPP executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
