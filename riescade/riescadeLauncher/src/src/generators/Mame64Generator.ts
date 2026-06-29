import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getRetroBatPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export class Mame64Generator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Mame64Generator: Configuring MAME64`);
    
    // Ensure save directories exist
    const retroBatPath = getRetroBatPath();
    const dirs = [
      join(retroBatPath, 'riescade', 'saves', 'mame', 'artwork'),
      join(retroBatPath, 'riescade', 'saves', 'mame', 'cfg'),
      join(retroBatPath, 'riescade', 'saves', 'mame', 'states'),
      join(retroBatPath, 'riescade', 'saves', 'mame', 'nvram'),
      join(retroBatPath, 'riescade', 'saves', 'mame', 'ctrlr')
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (e) {
          Logger.error(`Mame64Generator: Failed to create directory ${dir}: ${e}`);
        }
      }
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const retroBatPath = getRetroBatPath();
    
    const mameDir = join(emulatorsDir, 'mame');
    const exePath = join(mameDir, 'mame.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Mame64Generator: MAME executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      '-skip_gameinfo',
      '-rp', `${join(retroBatPath, 'bios')};${join(retroBatPath, 'roms', 'arcade')}`,
      '-sp', join(retroBatPath, 'bios', 'mame', 'samples'),
      '-artpath', `${join(retroBatPath, 'bios', 'mame', 'artwork')};${join(emulatorsDir, 'mame', 'artwork')};${join(retroBatPath, 'riescade', 'saves', 'mame', 'artwork')}`,
      '-snapshot_directory', join(retroBatPath, 'riescade', 'screenshots'),
      '-cfg_directory', join(retroBatPath, 'riescade', 'saves', 'mame', 'cfg'),
      '-inipath', join(retroBatPath, 'bios', 'mame', 'ini'),
      '-hash', join(retroBatPath, 'bios', 'mame', 'hash'),
      '-state_directory', join(retroBatPath, 'riescade', 'saves', 'mame', 'states'),
      '-nvram_directory', join(retroBatPath, 'riescade', 'saves', 'mame', 'nvram'),
      '-ctrlrpath', join(retroBatPath, 'riescade', 'saves', 'mame', 'ctrlr'),
      '-noflt',
      '-v',
      '-throttle',
      '-sound', 'dsound',
      '-video', 'd3d',
      '-resolution', 'auto',
      '-noka',
      '-waitvsync',
      '-mouse_device', 'mouse',
      '-ui_mouse',
      '-pedal_device', 'joystick',
      '-lightgun_device', 'mouse',
      '-mouse',
      '-paddle_device', 'none',
      '-adstick_device', 'joystick',
      '-positional_device', 'none',
      '-trackball_device', 'none',
      '-dial_device', 'none',
      '-joystickprovider', 'winhybrid',
      '-multimouse',
      '-ui_active',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
