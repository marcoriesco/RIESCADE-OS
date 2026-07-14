import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class BigPemuGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`BigPemuGenerator: Configuring BigPEmu`);
    
    const emulatorsDir = getEmulatorsPath();
    const bigpemuDir = join(emulatorsDir, 'bigpemu');
    const configPath = join(bigpemuDir, 'userdata', 'BigPEmuConfig.bigpcfg');

    if (!existsSync(configPath)) {
      Logger.warn(`BigPemuGenerator: BigPEmuConfig.bigpcfg not found at ${configPath}.`);
      return;
    }

    try {
      const content = readFileSync(configPath, 'utf8');
      const json = JSON.parse(content);

      const fullscreen = (Config.getEmulatorSetting('bigpemu', 'fullscreen') ?? Config.getEmulatorSetting('bigpemu', 'forcefullscreen') ?? Config.getEmulatorSetting('bigpemu', 'bigpemu_fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('bigpemu', 'vsync') ?? Config.getEmulatorSetting('bigpemu', 'bigpemu_vsync', 'true')) === 'true';

      if (json.video) {
        json.video.fullscreen = fullscreen;
        json.video.vsync = vsync;
      }

      writeFileSync(configPath, JSON.stringify(json, null, 2), 'utf8');
      Logger.info(`BigPemuGenerator: Updated BigPEmuConfig.bigpcfg (Fullscreen: ${fullscreen}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`BigPemuGenerator: Failed to update BigPEmuConfig.bigpcfg`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const bigpemuDir = join(emulatorsDir, 'bigpemu');
    const exePath = join(bigpemuDir, 'BigPEmu.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`BigPemuGenerator: BigPEmu executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      '-localdata',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
