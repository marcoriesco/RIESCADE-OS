import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Pcsx2Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Pcsx2Generator: Configuring PCSX2`);
    
    const emulatorsDir = getEmulatorsPath();
    const pcsx2Dir = join(emulatorsDir, 'pcsx2');
    const iniPath = join(pcsx2Dir, 'inis', 'PCSX2.ini');

    try {
      const fullscreen = (Config.getEmulatorSetting('pcsx2', 'fullscreen') ?? Config.getEmulatorSetting('pcsx2', 'forcefullscreen') ?? Config.getEmulatorSetting('pcsx2', 'pcsx2_fullscreen', 'true')) === 'true';
      const aspect = Config.getEmulatorSetting('pcsx2', 'ratio') ?? Config.getEmulatorSetting('pcsx2', 'pcsx2_aspectratio', '16:9');
      const renderer = Config.getEmulatorSetting('pcsx2', 'renderer') ?? Config.getEmulatorSetting('pcsx2', 'pcsx2_renderer', '-1');

      updateIniSetting(iniPath, 'UI', 'StartFullscreen', fullscreen);
      updateIniSetting(iniPath, 'EmuCore/GS', 'AspectRatio', aspect);
      updateIniSetting(iniPath, 'EmuCore/GS', 'Renderer', renderer);

      Logger.info(`Pcsx2Generator: Updated PCSX2.ini settings (Fullscreen: ${fullscreen}, AspectRatio: ${aspect}, Renderer: ${renderer})`);
    } catch (err) {
      Logger.error(`Pcsx2Generator: Failed to update PCSX2.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const pcsx2Dir = join(emulatorsDir, 'pcsx2');
    
    // Check if pcsx2-qt.exe exists (v1.7+), otherwise fall back to pcsx2.exe (v1.6)
    let exePath = join(pcsx2Dir, 'pcsx2-qt.exe');
    let isQt = true;

    if (!existsSync(exePath)) {
      exePath = join(pcsx2Dir, 'pcsx2.exe');
      isQt = false;
    }

    if (!existsSync(exePath)) {
      Logger.warn(`Pcsx2Generator: PCSX2 executable not found at ${exePath}. Falling back to default path.`);
    }

    const commandArgs: string[] = [];
    const fullscreen = (Config.getEmulatorSetting('pcsx2', 'fullscreen') ?? Config.getEmulatorSetting('pcsx2', 'forcefullscreen') ?? Config.getEmulatorSetting('pcsx2', 'pcsx2_fullscreen', 'true')) === 'true';

    if (isQt) {
      commandArgs.push('-batch');
      commandArgs.push('-nogui');
      if (fullscreen) {
        commandArgs.push('-fullscreen');
      } else {
        commandArgs.push('-windowed');
      }
    } else {
      commandArgs.push('--portable');
      if (fullscreen) {
        commandArgs.push('--fullscreen');
      } else {
        commandArgs.push('--windowed');
      }
      commandArgs.push('--nogui');
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
