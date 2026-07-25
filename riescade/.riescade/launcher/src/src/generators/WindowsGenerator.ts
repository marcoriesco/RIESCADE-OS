import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { Logger } from '../utils/logger.js';

export class WindowsGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`WindowsGenerator: No custom configuration required for Windows game`);
  }

  private findConfiguredExe(dir: string): string | null {
    const folderName = basename(dir).replace(/\.game$/i, '');
    const preferredMarker = `${folderName}.gamexe`;
    const markers = readdirSync(dir)
      .filter(file => file.toLowerCase().endsWith('.gamexe'))
      .sort((a, b) => {
        if (a.toLowerCase() === preferredMarker.toLowerCase()) return -1;
        if (b.toLowerCase() === preferredMarker.toLowerCase()) return 1;
        return a.localeCompare(b);
      });

    for (const marker of markers) {
      const markerPath = join(dir, marker);
      try {
        const configured = readFileSync(markerPath, 'utf8')
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .map(line => line.trim())
          .find(line => line && !line.startsWith('#'))
          ?.replace(/^["']|["']$/g, '');

        if (!configured) {
          Logger.warn(`WindowsGenerator: Empty .gamexe file: ${markerPath}`);
          continue;
        }

        const candidate = resolve(dir, configured);
        const relativePath = relative(dir, candidate);
        const staysInsideGame = relativePath !== ''
          && !relativePath.startsWith('..')
          && !isAbsolute(relativePath);
        const isExecutable = candidate.toLowerCase().endsWith('.exe');

        if (!staysInsideGame || !isExecutable || !existsSync(candidate) || !lstatSync(candidate).isFile()) {
          Logger.warn(`WindowsGenerator: Invalid target in ${markerPath}: ${configured}`);
          continue;
        }

        Logger.info(`WindowsGenerator: Resolved executable from ${marker}: ${candidate}`);
        return candidate;
      } catch (error) {
        Logger.warn(`WindowsGenerator: Could not read ${markerPath}: ${error}`);
      }
    }

    return null;
  }

  private findFirstExe(dir: string): string | null {
    try {
      const files = readdirSync(dir);
      
      // 1. Look for .exe at the root level first
      const exes = files.filter(f => f.toLowerCase().endsWith('.exe'));
      if (exes.length > 0) {
        const bestExe = exes.find(e => !e.toLowerCase().includes('uninst') && !e.toLowerCase().includes('setup')) || exes[0];
        return join(dir, bestExe);
      }

      // 2. If not found at the root, scan subdirectories
      for (const file of files) {
        const fullPath = join(dir, file);
        try {
          if (lstatSync(fullPath).isDirectory()) {
            if (file.startsWith('.') || file.toLowerCase() === 'node_modules') continue;
            const found = this.findFirstExe(fullPath);
            if (found) return found;
          }
        } catch {
          // Skip folders with access issues
        }
      }
    } catch (e) {
      Logger.error(`WindowsGenerator: Error scanning directory ${dir}`, e);
    }
    return null;
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    let targetExecutable = this.rom;

    if (existsSync(this.rom) && lstatSync(this.rom).isDirectory()) {
      Logger.info(`WindowsGenerator: Launch target is a directory: ${this.rom}`);
      const exePath = this.findConfiguredExe(this.rom) || this.findFirstExe(this.rom);
      if (exePath) {
        Logger.info(`WindowsGenerator: Found executable inside folder: ${exePath}`);
        targetExecutable = exePath;
      } else {
        Logger.warn(`WindowsGenerator: No executable found inside folder: ${this.rom}`);
      }
    } else if (!existsSync(this.rom)) {
      Logger.warn(`WindowsGenerator: Executable or shortcut not found at: ${this.rom}`);
    }

    return {
      executable: targetExecutable,
      args: [],
    };
  }
}
