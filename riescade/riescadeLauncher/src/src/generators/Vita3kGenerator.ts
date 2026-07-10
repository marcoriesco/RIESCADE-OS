import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync, symlinkSync, mkdirSync } from 'fs';
import { join, basename, parse } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getRetroBatPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class Vita3kGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Vita3kGenerator: Configuring Vita3K`);

    const emulatorsDir = getEmulatorsPath();
    const vita3kDir = join(emulatorsDir, 'vita3k');
    const configPath = join(vita3kDir, 'config.yml');

    // Create junctions for Vita partitions
    try {
      const retroBatPath = getRetroBatPath();
      const gamesDir = join(retroBatPath, 'roms', 'psvita', 'games');
      const prefPath = join(retroBatPath, 'saves', 'psvita', 'vita3k');

      if (existsSync(gamesDir)) {
        if (!existsSync(prefPath)) {
          mkdirSync(prefPath, { recursive: true });
          Logger.info(`Vita3kGenerator: Created preference directory at ${prefPath}`);
        }

        const partitions = readdirSync(gamesDir);
        for (const p of partitions) {
          const srcPartition = join(gamesDir, p);
          if (statSync(srcPartition).isDirectory()) {
            const destPartition = join(prefPath, p);
            try {
              // lstatSync will succeed even for a broken junction link
              lstatSync(destPartition);
            } catch (e) {
              // Junction doesn't exist (or is broken), let's create it
              symlinkSync(srcPartition, destPartition, 'junction');
              Logger.info(`Vita3kGenerator: Created junction link from ${srcPartition} to ${destPartition}`);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`Vita3kGenerator: Failed to create partition junctions`, err);
    }

    if (!existsSync(configPath)) {
      Logger.warn(`Vita3kGenerator: config.yml not found at ${configPath}. Skipping configuration.`);
      return;
    }

    try {
      let configText = readFileSync(configPath, 'utf8');

      // Helper to update YAML values
      const updateYmlSetting = (key: string, value: string | boolean | number) => {
        const regex = new RegExp(`^(\\s*${key}\\s*:\\s*)[^\\n]*(.*)$`, 'm');
        if (regex.test(configText)) {
          const formattedValue = typeof value === 'string' ? value : String(value);
          configText = configText.replace(regex, `$1${formattedValue}$2`);
        }
      };

      const fullscreen = (Config.getEmulatorSetting('vita3k', 'fullscreen') ?? Config.getEmulatorSetting('vita3k', 'forcefullscreen') ?? Config.getEmulatorSetting('vita3k', 'vita3k_fullscreen', 'true')) === 'true';
      const vsync = (Config.getEmulatorSetting('vita3k', 'vsync') ?? Config.getEmulatorSetting('vita3k', 'vita3k_vsync', 'true')) === 'true';
      const backend = Config.getEmulatorSetting('vita3k', 'backend-renderer') ?? Config.getEmulatorSetting('vita3k', 'backend', 'Vulkan');

      updateYmlSetting('boot-apps-full-screen', fullscreen);
      updateYmlSetting('v-sync', vsync);
      updateYmlSetting('backend-renderer', backend);

      writeFileSync(configPath, configText, 'utf8');
      Logger.info(`Vita3kGenerator: Updated config.yml (Fullscreen: ${fullscreen}, VSync: ${vsync}, Backend: ${backend})`);
    } catch (err) {
      Logger.error(`Vita3kGenerator: Failed to update config.yml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const vita3kDir = join(emulatorsDir, 'vita3k');
    const exePath = join(vita3kDir, 'Vita3K.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Vita3kGenerator: Vita3K executable not found at ${exePath}.`);
    }

    let titleId = '';
    if (this.rom) {
      if (this.rom.toLowerCase().endsWith('.m3u')) {
        if (existsSync(this.rom)) {
          titleId = readFileSync(this.rom, 'utf8').trim();
        }
      } else {
        const baseName = basename(this.rom);
        if (/^[A-Z]{4}\d{5}$/i.test(baseName)) {
          titleId = baseName.toUpperCase();
        } else {
          const nameWithoutExt = parse(this.rom).name;
          if (/^[A-Z]{4}\d{5}$/i.test(nameWithoutExt)) {
            titleId = nameWithoutExt.toUpperCase();
          }
        }
      }
    }

    const commandArgs: string[] = [];
    
    const fullscreen = (Config.getEmulatorSetting('vita3k', 'fullscreen') ?? Config.getEmulatorSetting('vita3k', 'forcefullscreen') ?? Config.getEmulatorSetting('vita3k', 'vita3k_fullscreen', 'true')) === 'true';
    if (fullscreen) {
      commandArgs.push('--fullscreen');
    }

    if (titleId) {
      commandArgs.push('-r', titleId);
    } else {
      Logger.warn(`Vita3kGenerator: Could not resolve Title ID for ROM: ${this.rom}`);
      commandArgs.push(this.rom);
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
