import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class Rpcs3Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Rpcs3Generator: Configuring RPCS3`);
    
    const emulatorsDir = getEmulatorsPath();
    const rpcs3Dir = join(emulatorsDir, 'rpcs3');
    const configPath = join(rpcs3Dir, 'config', 'config.yml');

    if (!existsSync(configPath)) {
      Logger.warn(`Rpcs3Generator: config.yml not found at ${configPath}.`);
      return;
    }

    try {
      let content = readFileSync(configPath, 'utf8');

      const renderer = Config.getEmulatorSetting('rpcs3', 'renderer') ?? Config.getEmulatorSetting('rpcs3', 'gfxbackend', 'Vulkan');
      const vsync = Config.getEmulatorSetting('rpcs3', 'vsync') ?? Config.getEmulatorSetting('rpcs3', 'rpcs3_vsync', 'Adaptive');

      // Simple line-by-line replacements
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('Renderer:')) {
          lines[i] = `  Renderer: ${renderer}`;
        } else if (line.includes('VSync Mode:')) {
          lines[i] = `  VSync Mode: ${vsync}`;
        }
      }

      writeFileSync(configPath, lines.join('\n'), 'utf8');
      Logger.info(`Rpcs3Generator: Updated config.yml settings (Renderer: ${renderer}, VSync: ${vsync})`);
    } catch (err) {
      Logger.error(`Rpcs3Generator: Failed to update config.yml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const rpcs3Dir = join(emulatorsDir, 'rpcs3');
    const exePath = join(rpcs3Dir, 'rpcs3.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Rpcs3Generator: RPCS3 executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [this.rom];
    const fullscreen = (Config.getEmulatorSetting('rpcs3', 'fullscreen') ?? Config.getEmulatorSetting('rpcs3', 'forcefullscreen') ?? Config.getEmulatorSetting('rpcs3', 'rpcs3_fullscreen', 'true')) === 'true';

    commandArgs.push('--no-gui');
    if (fullscreen) {
      commandArgs.push('--fullscreen');
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
