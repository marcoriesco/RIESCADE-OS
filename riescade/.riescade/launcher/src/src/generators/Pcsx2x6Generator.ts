import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Pcsx2x6Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Pcsx2x6Generator: Configuring PCSX2x6`);

    const emulatorsDir = getEmulatorsPath();
    const pcsx2Dir = join(emulatorsDir, 'pcsx2x6');
    const iniPath = join(pcsx2Dir, 'inis', 'PCSX2.ini');

    try {
      const fullscreen = (Config.getEmulatorSetting('pcsx2x6', 'pcsx2x6_fullscreen') ?? Config.getEmulatorSetting('pcsx2x6', 'forcefullscreen') ?? Config.getEmulatorSetting('pcsx2x6', 'fullscreen', 'true')) === 'true';
      const aspect = Config.getEmulatorSetting('pcsx2x6', 'pcsx2x6_aspectratio') ?? Config.getEmulatorSetting('pcsx2x6', 'ratio', '16:9');
      const renderer = Config.getEmulatorSetting('pcsx2x6', 'pcsx2x6_renderer') ?? Config.getEmulatorSetting('pcsx2x6', 'renderer', '-1');

      updateIniSetting(iniPath, 'UI', 'StartFullscreen', fullscreen);
      updateIniSetting(iniPath, 'EmuCore/GS', 'AspectRatio', aspect);
      updateIniSetting(iniPath, 'EmuCore/GS', 'Renderer', renderer);

      Logger.info(`Pcsx2x6Generator: Updated PCSX2.ini settings (Fullscreen: ${fullscreen}, AspectRatio: ${aspect}, Renderer: ${renderer})`);
    } catch (err) {
      Logger.error(`Pcsx2x6Generator: Failed to update PCSX2.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const pcsx2Dir = join(emulatorsDir, 'pcsx2x6');
    
    let exePath = join(pcsx2Dir, 'pcsx2-qt.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Pcsx2x6Generator: PCSX2x6 executable not found at ${exePath}. Falling back to default path.`);
    }

    const fullscreen = (Config.getEmulatorSetting('pcsx2x6', 'pcsx2x6_fullscreen') ?? Config.getEmulatorSetting('pcsx2x6', 'forcefullscreen') ?? Config.getEmulatorSetting('pcsx2x6', 'fullscreen', 'true')) === 'true';

    const commandArgs: string[] = [
      '-batch',
      '-nogui',
      fullscreen ? '-fullscreen' : '-windowed',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
