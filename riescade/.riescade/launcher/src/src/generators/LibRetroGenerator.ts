import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config, InputConfig, InputItem } from '../config.js';

export class LibRetroGenerator extends BaseGenerator {
  private retroarchDir: string = '';
  private retroarchCfgPath: string = '';

  public async configure(): Promise<void> {
    const emulatorsDir = getEmulatorsPath();
    this.retroarchDir = join(emulatorsDir, 'retroarch');
    this.retroarchCfgPath = join(this.retroarchDir, 'retroarch.cfg');

    Logger.info(`LibRetroGenerator: Configuring RetroArch at ${this.retroarchCfgPath}`);

    if (!existsSync(this.retroarchCfgPath)) {
      Logger.warn(`LibRetroGenerator: retroarch.cfg not found at ${this.retroarchCfgPath}. Creating an empty one.`);
      writeFileSync(this.retroarchCfgPath, '', 'utf8');
    }

    try {
      const cfg = this.readCfg(this.retroarchCfgPath);

      // Clean existing input player settings to avoid legacy overrides
      for (const key of Object.keys(cfg)) {
        if (key.startsWith('input_player') || key.startsWith('input_enable_hotkey') || key.startsWith('input_exit_emulator') || key.startsWith('input_menu_toggle') || key.startsWith('input_load_state') || key.startsWith('input_save_state') || key.startsWith('input_state_slot')) {
          delete cfg[key];
        }
      }

      // Apply standard general configurations
      cfg['video_fullscreen'] = 'true';
      cfg['menu_driver'] = 'ozone';
      cfg['global_core_options'] = 'true';
      cfg['input_autodetect_enable'] = 'true'; // Let RetroArch configure controls natively

      // Map controllers
      this.mapControllers(cfg);

      this.writeCfg(this.retroarchCfgPath, cfg);
      Logger.info(`LibRetroGenerator: Successfully wrote retroarch.cfg`);
    } catch (err) {
      Logger.error(`LibRetroGenerator: Failed to configure RetroArch`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const executable = join(emulatorsDir, 'retroarch', 'retroarch.exe');
    const corePath = join(emulatorsDir, 'retroarch', 'cores', `${this.core}_libretro.dll`);

    Logger.info(`LibRetroGenerator: Launching core ${this.core} (${corePath})`);

    const launchArgs = [
      '-L',
      corePath,
      this.rom
    ];

    return {
      executable,
      args: launchArgs,
    };
  }

  private readCfg(filePath: string): Record<string, string> {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const config: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        config[key] = value;
      }
    }

    return config;
  }

  private writeCfg(filePath: string, config: Record<string, string>) {
    const lines: string[] = [];
    for (const [key, val] of Object.entries(config)) {
      lines.push(`${key} = "${val}"`);
    }
    writeFileSync(filePath, lines.join('\n'), 'utf8');
  }

  private mapControllers(cfg: Record<string, string>) {
    // Up to 4 players
    for (let player = 1; player <= 4; player++) {
      const indexStr = this.args.rawArgs[`-p${player}index`];

      if (indexStr === undefined) continue;

      const deviceIndex = parseInt(indexStr, 10);

      Logger.info(`LibRetroGenerator: Mapping Player ${player} to index ${deviceIndex} (letting RetroArch handle autoconfig)`);

      cfg[`input_player${player}_joypad_index`] = deviceIndex.toString();
      cfg[`input_player${player}_analog_dpad_mode`] = '1';
    }
  }
}
