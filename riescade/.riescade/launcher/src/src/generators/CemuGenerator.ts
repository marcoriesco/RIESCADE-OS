import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class CemuGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`CemuGenerator: Configuring Cemu`);
    
    const emulatorsDir = getEmulatorsPath();
    const cemuDir = join(emulatorsDir, 'cemu');
    let settingsPath = join(cemuDir, 'portable', 'settings.xml');
    if (!existsSync(settingsPath)) {
      settingsPath = join(cemuDir, 'settings.xml');
    }

    if (!existsSync(settingsPath)) {
      Logger.warn(`CemuGenerator: settings.xml not found at ${settingsPath}.`);
      return;
    }

    try {
      let content = readFileSync(settingsPath, 'utf8');

      const fullscreen = (Config.getEmulatorSetting('cemu', 'fullscreen') ?? Config.getEmulatorSetting('cemu', 'forcefullscreen') ?? Config.getEmulatorSetting('cemu', 'cemu_fullscreen', 'true')) === 'true';
      const vsync = Config.getEmulatorSetting('cemu', 'cemu_vsync') ?? '1';
      const renderer = Config.getEmulatorSetting('cemu', 'video_renderer') ?? '1'; // 1 = Vulkan, 0 = OpenGL

      // Regex updates for settings.xml
      content = content.replace(/<fullscreen>[^<]*<\/fullscreen>/g, `<fullscreen>${fullscreen ? 'true' : 'false'}</fullscreen>`);
      content = content.replace(/<VSync>[^<]*<\/VSync>/g, `<VSync>${vsync}</VSync>`);
      content = content.replace(/<api>[^<]*<\/api>/g, `<api>${renderer}</api>`);

      writeFileSync(settingsPath, content, 'utf8');
      Logger.info(`CemuGenerator: Updated settings.xml (Fullscreen: ${fullscreen}, VSync: ${vsync}, api: ${renderer})`);
    } catch (err) {
      Logger.error(`CemuGenerator: Failed to update settings.xml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const cemuDir = join(emulatorsDir, 'cemu');
    const exePath = join(cemuDir, 'Cemu.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`CemuGenerator: Cemu executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      '-g',
      this.rom
    ];
    const fullscreen = (Config.getEmulatorSetting('cemu', 'fullscreen') ?? Config.getEmulatorSetting('cemu', 'forcefullscreen') ?? Config.getEmulatorSetting('cemu', 'cemu_fullscreen', 'true')) === 'true';

    if (fullscreen) {
      commandArgs.push('-f');
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
