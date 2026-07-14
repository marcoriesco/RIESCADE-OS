import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getConfigsPath } from '../utils/paths.js';
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

      // Apply general configurations from emulator.json
      const fullscreen = Config.getEmulatorSetting('retroarch', 'fullscreen', 'true');
      cfg['video_fullscreen'] = (fullscreen === 'true' || fullscreen === true) ? 'true' : 'false';

      const aspect = Config.getEmulatorSetting('retroarch', 'aspect_ratio', 'auto');
      if (aspect === 'Fixed4x3' || aspect === '4:3' || aspect === '4x3') {
        cfg['aspect_ratio_index'] = '0';
        cfg['video_aspect_ratio_auto'] = 'false';
      } else if (aspect === 'Fixed16x9' || aspect === '16:9' || aspect === '16x9') {
        cfg['aspect_ratio_index'] = '1';
        cfg['video_aspect_ratio_auto'] = 'false';
      } else if (aspect === 'Stretch' || aspect === 'stretch' || aspect === 'full') {
        cfg['aspect_ratio_index'] = '22';
        cfg['video_aspect_ratio_auto'] = 'false';
      } else {
        cfg['video_aspect_ratio_auto'] = 'true';
        cfg['aspect_ratio_index'] = '20';
      }

      const videoDriver = Config.getEmulatorSetting('retroarch', 'video_driver', 'auto');
      if (videoDriver && videoDriver !== 'auto') {
        cfg['video_driver'] = videoDriver.toLowerCase();
      }

      const audioDriver = Config.getEmulatorSetting('retroarch', 'audio_driver', 'auto');
      if (audioDriver && audioDriver !== 'auto') {
        cfg['audio_driver'] = audioDriver.toLowerCase();
      }

      const vsync = Config.getEmulatorSetting('retroarch', 'vsync', 'true');
      cfg['video_vsync'] = (vsync === 'true' || vsync === true) ? 'true' : 'false';

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
    // Load controllerConfigs.json to get deadzones
    let configs: Record<string, any> = {};
    try {
      const configPath = join(getConfigsPath(), 'controllerConfigs.json');
      if (existsSync(configPath)) {
        configs = JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      Logger.error('LibRetroGenerator: Failed to load controllerConfigs.json', e);
    }

    // Up to 4 players
    for (let player = 1; player <= 4; player++) {
      const indexStr = this.args.rawArgs[`-p${player}index`];
      if (indexStr === undefined) continue;

      const deviceIndex = parseInt(indexStr, 10);
      const guid = this.args.rawArgs[`-p${player}guid`];
      const nameWithQuotes = this.args.rawArgs[`-p${player}name`];
      const deviceName = nameWithQuotes ? nameWithQuotes.replace(/^"|"$/g, '') : '';

      Logger.info(`LibRetroGenerator: Mapping Player ${player} to index ${deviceIndex} (Name: "${deviceName}", GUID: "${guid}")`);

      cfg[`input_player${player}_joypad_index`] = deviceIndex.toString();
      cfg[`input_player${player}_analog_dpad_mode`] = '1';

      if (deviceName) {
        cfg[`input_player${player}_device`] = deviceName;
      }

      // Apply deadzone if configured
      if (guid && configs[guid] && configs[guid].deadzone !== undefined) {
        cfg[`input_player${player}_analog_deadzone`] = configs[guid].deadzone.toString();
      }
    }
  }
}
