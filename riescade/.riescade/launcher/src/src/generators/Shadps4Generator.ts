import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Shadps4Generator extends BaseGenerator {
  private resolvedRom: string = '';

  public configure(): void {
    Logger.info(`Shadps4Generator: Configuring ShadPS4`);
    
    const emulatorsDir = getEmulatorsPath();
    const shadps4Dir = join(emulatorsDir, 'shadps4');

    // Resolve ROM first to find eboot.bin if it's a directory
    this.resolvedRom = this.rom;
    if (existsSync(this.rom) && statSync(this.rom).isDirectory()) {
      const foundEboot = this.findEbootBin(this.rom);
      if (foundEboot) {
        this.resolvedRom = foundEboot;
        Logger.info(`Shadps4Generator: Found eboot.bin at ${foundEboot}`);
      } else {
        Logger.warn(`Shadps4Generator: eboot.bin not found in directory: ${this.rom}`);
      }
    }

    const configPath = join(shadps4Dir, 'user', 'config.toml');

    try {
      const fullscreen = (Config.getEmulatorSetting('shadps4', 'shadps4_fullscreen') ?? Config.getEmulatorSetting('shadps4', 'forcefullscreen') ?? Config.getEmulatorSetting('shadps4', 'fullscreen', 'true')) === 'true';
      
      updateIniSetting(configPath, 'GPU', 'Fullscreen', fullscreen ? 'true' : 'false');
      if (fullscreen) {
        updateIniSetting(configPath, 'GPU', 'FullscreenMode', '"Fullscreen (Borderless)"');
      } else {
        updateIniSetting(configPath, 'GPU', 'FullscreenMode', '"Windowed"');
      }

      Logger.info(`Shadps4Generator: Updated config.toml (Fullscreen: ${fullscreen})`);
    } catch (err) {
      Logger.error(`Shadps4Generator: Failed to update config.toml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const shadps4Dir = join(emulatorsDir, 'shadps4');
    
    const launcherExe = join(shadps4Dir, 'shadPS4QtLauncher.exe');
    const useLauncher = existsSync(launcherExe);

    // Resolve realExe (the actual emulator executable, shadPS4.exe)
    let realExe = '';

    // 1. Try to read from qt_ui.ini
    const qtUiPath = join(shadps4Dir, 'launcher', 'qt_ui.ini');
    if (existsSync(qtUiPath)) {
      try {
        const content = readFileSync(qtUiPath, 'utf8');
        const match = content.match(/versionSelected\s*=\s*(.+)/);
        if (match) {
          const rawPath = match[1].trim();
          const normalized = rawPath.replace(/\\/g, '/');
          const relMatch = normalized.match(/\/emulators\/shadps4\/(.*)$/i) || normalized.match(/\/shadps4\/(.*)$/i);
          if (relMatch) {
            const candidate = join(shadps4Dir, relMatch[1]);
            if (existsSync(candidate)) {
              realExe = candidate;
              Logger.info(`Shadps4Generator: Resolved active shadPS4.exe from qt_ui.ini: ${realExe}`);
            }
          } else {
            const candidate = join(shadps4Dir, rawPath);
            if (existsSync(candidate)) {
              realExe = candidate;
              Logger.info(`Shadps4Generator: Resolved active shadPS4.exe from qt_ui.ini directly: ${realExe}`);
            } else if (existsSync(rawPath)) {
              realExe = rawPath;
              Logger.info(`Shadps4Generator: Resolved active shadPS4.exe from qt_ui.ini as absolute: ${realExe}`);
            }
          }
        }
      } catch (err) {
        Logger.error(`Shadps4Generator: Failed to parse qt_ui.ini`, err);
      }
    }

    // 2. Fall back to versions.json if not found or doesn't exist
    if (!realExe) {
      const versionsJsonPath = join(shadps4Dir, 'launcher', 'versions.json');
      if (existsSync(versionsJsonPath)) {
        try {
          const versions = JSON.parse(readFileSync(versionsJsonPath, 'utf8'));
          if (Array.isArray(versions)) {
            const sorted = [...versions].sort((a, b) => {
              const dateA = a.date || '';
              const dateB = b.date || '';
              return dateB.localeCompare(dateA);
            });
            for (const v of sorted) {
              if (v.path) {
                const normalized = v.path.replace(/\\/g, '/');
                const relMatch = normalized.match(/\/emulators\/shadps4\/(.*)$/i) || normalized.match(/\/shadps4\/(.*)$/i);
                let candidate = '';
                if (relMatch) {
                  candidate = join(shadps4Dir, relMatch[1]);
                } else if (v.path.startsWith('./')) {
                  candidate = join(shadps4Dir, v.path.slice(2));
                } else {
                  candidate = join(shadps4Dir, v.path);
                }
                if (existsSync(candidate)) {
                  realExe = candidate;
                  Logger.info(`Shadps4Generator: Resolved latest shadPS4.exe from versions.json: ${realExe}`);
                  break;
                }
              }
            }
          }
        } catch (err) {
          Logger.error(`Shadps4Generator: Failed to parse versions.json`, err);
        }
      }
    }

    // 3. Fall back to scanning directories in launcher/versions
    if (!realExe) {
      const versionsDir = join(shadps4Dir, 'launcher', 'versions');
      if (existsSync(versionsDir)) {
        try {
          const dirs = readdirSync(versionsDir);
          const sortedDirs = dirs.sort((a, b) => b.localeCompare(a));
          for (const d of sortedDirs) {
            const candidate = join(versionsDir, d, 'shadPS4.exe');
            if (existsSync(candidate)) {
              realExe = candidate;
              Logger.info(`Shadps4Generator: Resolved shadPS4.exe from launcher/versions directory scanning: ${realExe}`);
              break;
            }
          }
        } catch (err) {
          Logger.error(`Shadps4Generator: Failed to scan launcher/versions directory`, err);
        }
      }
    }

    // 4. Ultimate fallback to standard directory
    if (!realExe) {
      realExe = join(shadps4Dir, 'shadPS4.exe');
      Logger.warn(`Shadps4Generator: Falling back to default executable path: ${realExe}`);
    }

    const commandArgs: string[] = [];
    let exePath = '';

    if (useLauncher) {
      exePath = launcherExe;
      commandArgs.push('-g', this.resolvedRom || this.rom);
      commandArgs.push('-e', realExe);
    } else {
      exePath = realExe;
      commandArgs.push(this.resolvedRom || this.rom);
    }

    if (!existsSync(exePath)) {
      Logger.warn(`Shadps4Generator: Executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }

  private findEbootBin(dir: string): string | null {
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        if (statSync(fullPath).isDirectory()) {
          const found = this.findEbootBin(fullPath);
          if (found) return found;
        } else if (file.toLowerCase() === 'eboot.bin') {
          return fullPath;
        }
      }
    } catch (err) {
      Logger.error(`Shadps4Generator: Error searching for eboot.bin in ${dir}:`, err);
    }
    return null;
  }
}
