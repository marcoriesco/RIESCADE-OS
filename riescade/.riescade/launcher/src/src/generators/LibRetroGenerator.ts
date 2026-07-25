import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getConfigsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config, InputConfig, InputItem } from '../config.js';
import { resolveLibretroVisuals } from '../utils/libretroVisuals.js';

export class LibRetroGenerator extends BaseGenerator {
  private retroarchDir: string = '';
  private retroarchCfgPath: string = '';
  private shaderPreset?: string;

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

      // Apply the resolved global, emulator, system and game configuration.
      const fullscreen = Config.getEmulatorSetting('libretro', 'fullscreen', 'true');
      cfg['video_fullscreen'] = (fullscreen === 'true' || fullscreen === true) ? 'true' : 'false';

      const aspect = Config.getEmulatorSetting('libretro', 'aspect_ratio', 'auto');
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

      const videoDriver = Config.getEmulatorSetting('libretro', 'video_driver', 'auto');
      if (videoDriver && videoDriver !== 'auto') {
        cfg['video_driver'] = videoDriver.toLowerCase();
      }

      const audioDriver = Config.getEmulatorSetting('libretro', 'audio_driver', 'auto');
      if (audioDriver && audioDriver !== 'auto') {
        cfg['audio_driver'] = audioDriver.toLowerCase();
      }

      const vsync = Config.getEmulatorSetting('libretro', 'vsync', 'true');
      cfg['video_vsync'] = (vsync === 'true' || vsync === true) ? 'true' : 'false';

      const menuDriver = String(Config.getEmulatorSetting('libretro', 'menu_driver', 'ozone'));
      cfg['menu_driver'] = menuDriver === 'auto' ? 'ozone' : menuDriver;
      cfg['global_core_options'] = 'true';
      cfg['input_autodetect_enable'] = 'true'; // Let RetroArch configure controls natively

      const visuals = resolveLibretroVisuals(
        this.system,
        this.rom,
        String(Config.getCoreSetting(this.core, 'bezels', 'auto')),
        String(Config.getCoreSetting(this.core, 'shaders', 'auto')),
        String(Config.getCoreSetting(this.core, 'videofilters',
          Config.getCoreSetting(this.core, 'filters', 'auto'))),
        videoDriver === 'gl' || videoDriver === 'glcore' || videoDriver === 'opengl'
      );
      this.shaderPreset = visuals.shaderPreset;
      cfg['input_overlay_enable'] = visuals.overlayConfig ? 'true' : 'false';
      if (visuals.overlayConfig) cfg['input_overlay'] = visuals.overlayConfig;
      else delete cfg['input_overlay'];
      cfg['video_shader_enable'] = visuals.shaderPreset ? 'true' : 'false';
      if (visuals.shaderPreset) cfg['video_shader'] = visuals.shaderPreset;
      else delete cfg['video_shader'];
      if (visuals.videoFilter) cfg['video_filter'] = visuals.videoFilter;
      else delete cfg['video_filter'];

      const selectedStatePath = this.args.rawArgs['-state_path'];
      const autosaveRequested = this.args.rawArgs['-autosave'] === '1';
      if (selectedStatePath) {
        // Numbered slots are loaded by --entryslot. Autosave uses the
        // standard .state.auto file associated with the explicit base path.
        cfg['savestate_auto_load'] = /\.state\.auto$/i.test(selectedStatePath) ? 'true' : 'false';
        cfg['savestate_auto_save'] = 'false';
      } else {
        cfg['savestate_auto_load'] = autosaveRequested ? 'true' : 'false';
        cfg['savestate_auto_save'] = autosaveRequested ? 'true' : 'false';
      }

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
    ];

    const selectedStatePath = this.args.rawArgs['-state_path'];
    const selectedSlot = this.args.rawArgs['-state_slot'];
    if (selectedStatePath) {
      const stateBasePath = selectedStatePath
        .replace(/\.auto$/i, '')
        .replace(/(\.state)\d+$/i, '$1');
      launchArgs.push('--savestate', stateBasePath);
    }
    if (selectedSlot !== undefined && Number(selectedSlot) >= 0) {
      launchArgs.push('--entryslot', selectedSlot);
    }
    launchArgs.push(this.rom);
    if (this.shaderPreset) {
      launchArgs.push('--set-shader', this.shaderPreset);
    }

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
    // Load controllers.json to get deadzones
    let configs: Record<string, any> = {};
    try {
      const configPath = join(getConfigsPath(), 'controllers.json');
      if (existsSync(configPath)) {
        configs = JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      Logger.error('LibRetroGenerator: Failed to load controllers.json', e);
    }

    // Native RetroArch exit mapping is kept as a redundant path when both
    // bindings are buttons. The launcher SDL3 monitor covers axes and hats.
    try {
      const inputPath = join(getConfigsPath(), 'input.json');
      if (existsSync(inputPath) && this.args.controllers.length > 0) {
        const inputConfig = JSON.parse(readFileSync(inputPath, 'utf8'));
        const firstController = this.args.controllers[0];
        const profile = (inputConfig.inputConfigs || []).find((item: any) =>
          String(item.device?.deviceGUID || item.deviceGUID || '').toLowerCase() === firstController.guid.toLowerCase()
        ) || (inputConfig.inputConfigs || []).find((item: any) =>
          String(item.device?.deviceName || item.deviceName || '').toLowerCase() === firstController.name.toLowerCase()
        );
        const inputs = profile?.inputs || [];
        const quitCombo = profile?.hotkey?.combos?.find((combo: any) => combo.action === 'quit');
        const hotkey = inputs.find((input: any) => input.name === 'hotkey');
        const exit = inputs.find((input: any) => input.name === (quitCombo?.button || 'start'));
        if (hotkey?.type === 'button' && exit?.type === 'button') {
          cfg['input_enable_hotkey_btn'] = String(hotkey.id);
          cfg['input_exit_emulator_btn'] = String(exit.id);
          Logger.info(`LibRetroGenerator: Native exit combo set to buttons ${hotkey.id} + ${exit.id}.`);
        }
      }
    } catch (error) {
      Logger.warn(`LibRetroGenerator: Could not configure native exit combo: ${error}`);
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
