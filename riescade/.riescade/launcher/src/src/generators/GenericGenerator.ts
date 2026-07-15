import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export class GenericGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`GenericGenerator: No custom configuration required for ${this.emulator}`);
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    let exePath = '';

    // Common map for emulators
    const emulatorExes: Record<string, string[]> = {
      'retroarch': ['retroarch/retroarch.exe'],
      'libretro': ['retroarch/retroarch.exe'],
      'dolphin': ['dolphin-emu/Dolphin.exe'],
      'dolphin-emu': ['dolphin-emu/Dolphin.exe'],
      'pcsx2': ['pcsx2/pcsx2-qt.exe', 'pcsx2/pcsx2.exe'],
      'pcsx2qt': ['pcsx2/pcsx2-qt.exe', 'pcsx2/pcsx2.exe'],
      'pcsx2x6': ['pcsx2x6/pcsx2-qt.exe', 'pcsx2x6/pcsx2.exe'],
      'snes9x': ['snes9x/snes9x-x64.exe', 'snes9x/snes9x.exe'],
      'duckstation': ['duckstation/duckstation-qt.exe', 'duckstation/duckstation.exe'],
      'ppsspp': ['ppsspp/PPSSPPWindows64.exe', 'ppsspp/PPSSPP.exe'],
      'cemu': ['cemu/Cemu.exe'],
      'rpcs3': ['rpcs3/rpcs3.exe'],
      'ryujinx': ['ryujinx/Ryujinx.exe'],
      'eden': ['eden/eden.exe'],
      'eden-nightly': ['eden-nightly/eden.exe'],
      'citron': ['citron/citron-cmd.exe'],
      'xemu': ['xemu/xemu.exe'],
      'xenia': ['xenia/xenia.exe'],
    };

    const candidates = emulatorExes[this.emulator] || [];
    
    // Check if we can find a matching executable in candidates
    for (const candidate of candidates) {
      const fullPath = join(emulatorsDir, candidate);
      if (existsSync(fullPath)) {
        exePath = fullPath;
        break;
      }
    }

    // Fallback: search directory for any .exe matching the emulator name
    if (!exePath) {
      const targetDir = join(emulatorsDir, this.emulator);
      if (existsSync(targetDir)) {
        // Try common exe names inside target dir
        const possibleNames = [
          `${this.emulator}.exe`,
          `${this.emulator}-qt.exe`,
          `${this.emulator}64.exe`,
        ];
        for (const name of possibleNames) {
          const fullPath = join(targetDir, name);
          if (existsSync(fullPath)) {
            exePath = fullPath;
            break;
          }
        }
      }
    }

    // Default fallback
    if (!exePath) {
      exePath = join(emulatorsDir, this.emulator, `${this.emulator}.exe`);
      Logger.warn(`GenericGenerator: Executable not found. Falling back to default path: ${exePath}`);
    } else {
      Logger.info(`GenericGenerator: Found executable at ${exePath}`);
    }

    return {
      executable: exePath,
      args: [this.rom],
    };
  }
}
