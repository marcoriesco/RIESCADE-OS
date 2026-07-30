import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getConfigsPath, getRetroBatPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config, InputConfig, InputItem } from '../config.js';
import { resolveLibretroVisuals } from '../utils/libretroVisuals.js';
import { resolveScummVmMarker } from '../utils/scummvm.js';

interface LibretroCoreOptionMapping {
  configKey: string;
  targetKey: string;
  kind: 'BindFeature' | 'BindFeatureSlider' | 'BindBoolFeature' | 'BindBoolFeatureOn' | 'BindBoolFeatureAuto';
  values: string[];
}

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
      const fullscreen = Config.getEmulatorSetting(
        'libretro',
        'forcefullscreen',
        Config.getEmulatorSetting('libretro', 'fullscreen', 'true')
      );
      cfg['video_fullscreen'] = (fullscreen === 'true' || fullscreen === true) ? 'true' : 'false';

      const aspect = Config.getEmulatorSetting(
        'libretro',
        'ratio',
        Config.getEmulatorSetting('libretro', 'aspect_ratio', 'auto')
      );
      if (aspect === 'Fixed4x3' || aspect === '4:3' || aspect === '4x3' || aspect === '4/3') {
        cfg['aspect_ratio_index'] = '0';
        cfg['video_aspect_ratio_auto'] = 'false';
      } else if (aspect === 'Fixed16x9' || aspect === '16:9' || aspect === '16x9' || aspect === '16/9') {
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

      const vsync = Config.getEmulatorSetting(
        'libretro',
        'video_vsync',
        Config.getEmulatorSetting('libretro', 'vsync', 'true')
      );
      cfg['video_vsync'] = (vsync === 'true' || vsync === true) ? 'true' : 'false';

      const menuDriver = String(Config.getEmulatorSetting('libretro', 'menu_driver', 'ozone'));
      cfg['menu_driver'] = menuDriver === 'auto' ? 'ozone' : menuDriver;
      cfg['global_core_options'] = 'true';
      cfg['input_autodetect_enable'] = 'true'; // Let RetroArch configure controls natively
      this.applyFrontendOptions(cfg);

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
      this.configureNetplay(cfg);

      this.applyCoreOptions(cfg);
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
    launchArgs.push(...this.getNetplayLaunchArgs());
    const launchRom = this.core.toLowerCase() === 'scummvm'
      ? resolveScummVmMarker(this.rom).markerPath
      : this.rom;
    launchArgs.push(launchRom);
    if (this.shaderPreset) {
      launchArgs.push('--set-shader', this.shaderPreset);
    }

    return {
      executable,
      args: launchArgs,
    };
  }

  private configureNetplay(cfg: Record<string, string>): void {
    const mode = this.args.rawArgs['-netplaymode'];
    if (!mode) return;

    const port = this.args.rawArgs['-netplayport'] || '55435';
    const nickname = this.args.rawArgs['-netplaynick'] || 'RIESCADE Player';
    const playerPassword = this.args.rawArgs['-netplaypassword'] || '';
    const spectatorPassword = this.args.rawArgs['-netplayspectatepassword'] || '';
    const announce = this.args.rawArgs['-netplayannounce'] !== 'false';
    const useRelay = this.args.rawArgs['-netplayrelay'] !== 'false';

    cfg['netplay_nickname'] = nickname;
    cfg['netplay_ip_port'] = port;
    cfg['netplay_public_announce'] = announce ? 'true' : 'false';
    cfg['netplay_use_mitm_server'] = useRelay && announce ? 'true' : 'false';
    cfg['netplay_start_as_spectator'] = mode === 'spectator' ? 'true' : 'false';
    cfg['netplay_spectator_mode_enable'] = mode === 'spectator' || Boolean(spectatorPassword) ? 'true' : 'false';

    if (playerPassword) cfg['netplay_password'] = playerPassword;
    else delete cfg['netplay_password'];
    if (spectatorPassword) cfg['netplay_spectate_password'] = spectatorPassword;
    else delete cfg['netplay_spectate_password'];

    if (mode === 'client' || mode === 'spectator') {
      cfg['netplay_ip_address'] = this.args.rawArgs['-netplayip'] || '';
      cfg['netplay_mode'] = 'true';
    } else {
      cfg['netplay_mode'] = 'false';
    }
    Logger.info(`LibRetroGenerator: Netplay configured as ${mode} on port ${port}`);
  }

  private getNetplayLaunchArgs(): string[] {
    const mode = this.args.rawArgs['-netplaymode'];
    if (!mode) return [];

    const result: string[] = [];
    if (mode === 'host') {
      result.push('--host');
    } else if (mode === 'client' || mode === 'spectator') {
      const host = this.args.rawArgs['-netplayip'];
      if (!host) {
        Logger.warn('LibRetroGenerator: Netplay client launch ignored because host is missing.');
        return [];
      }
      result.push('--connect', host, '--port', this.args.rawArgs['-netplayport'] || '55435');
    }

    const session = this.args.rawArgs['-netplaysession'];
    if (session) result.push('--mitm-session', session);
    return result;
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

  private applyCoreOptions(retroarchCfg: Record<string, string>): void {
    const mappingsPath = join(getConfigsPath(), 'emulators', 'libretro-core-options.json');
    const coreOptionsPath = join(this.retroarchDir, 'retroarch-core-options.cfg');

    if (!existsSync(mappingsPath)) {
      Logger.warn(`LibRetroGenerator: Core option mappings not found at ${mappingsPath}.`);
      return;
    }
    if (!existsSync(coreOptionsPath)) {
      Logger.warn(`LibRetroGenerator: Core options file not found at ${coreOptionsPath}.`);
      return;
    }

    try {
      const catalog = JSON.parse(readFileSync(mappingsPath, 'utf8'));
      const normalizedCore = this.core.toLowerCase().replace(/[^a-z0-9]/g, '');
      const mappingCore = normalizedCore === 'mupen64plusnext' || normalizedCore === 'mupen64plusnextgles3'
        ? 'mupen64plus'
        : normalizedCore;
      const mappings = (catalog.cores?.[mappingCore] || []) as LibretroCoreOptionMapping[];
      if (mappings.length === 0) {
        Logger.warn(`LibRetroGenerator: No confirmed core option mappings for ${this.core}.`);
        return;
      }

      const coreCfg = this.readCfg(coreOptionsPath);
      let applied = 0;
      for (const mapping of mappings) {
        const defaultValue = this.mappingDefault(mapping);
        const configuredValue = Config.getCoreSetting(this.core, mapping.configKey, defaultValue);
        coreCfg[mapping.targetKey] = this.convertMappedValue(mapping, configuredValue);
        applied++;
      }

      if (mappingCore === 'mupen64plus') {
        this.applyMupen64CompositeOptions(coreCfg, retroarchCfg);
      }
      if (mappingCore === 'snes9x') {
        this.applySnes9xCompositeOptions(coreCfg);
      }
      if (mappingCore === 'fbneo') {
        this.applyFbneoCompositeOptions(coreCfg);
      }
      if (mappingCore === 'mame') {
        this.applyMameExternalOptions();
      }
      this.applyAdditionalCompositeOptions(mappingCore, coreCfg, retroarchCfg);

      this.writeCfg(coreOptionsPath, coreCfg);
      Logger.info(`LibRetroGenerator: Applied ${applied} confirmed options for core ${this.core}.`);
    } catch (error) {
      Logger.error(`LibRetroGenerator: Failed to apply options for core ${this.core}`, error);
    }
  }

  private applyFrontendOptions(cfg: Record<string, string>): void {
    const boolSetting = (configKey: string, targetKey: string, defaultValue: boolean) => {
      cfg[targetKey] = this.isEnabled(
        Config.getEmulatorSetting('libretro', configKey, defaultValue)
      ) ? 'true' : 'false';
    };
    const valueSetting = (configKey: string, targetKey: string) => {
      const value = Config.getEmulatorSetting('libretro', configKey, cfg[targetKey]);
      if (value !== undefined && value !== 'auto') cfg[targetKey] = String(value);
    };

    boolSetting('integerscale', 'video_scale_integer', false);
    const disableAutoconfig = this.isEnabled(
      Config.getEmulatorSetting('libretro', 'disableautocontrollers', false)
    );
    cfg['input_autodetect_enable'] = disableAutoconfig ? 'false' : 'true';
    boolSetting('video_hard_sync', 'video_hard_sync', false);
    boolSetting('vrr_runloop_enable', 'vrr_runloop_enable', true);
    boolSetting('smooth', 'video_smooth', false);
    boolSetting('audio_sync', 'audio_sync', true);
    boolSetting('OnScreenMsg', 'video_font_enable', true);
    boolSetting('discord', 'discord_allow', false);
    boolSetting('video_frame_delay_auto', 'video_frame_delay_auto', false);
    boolSetting('secondinstance', 'run_ahead_secondary_instance', false);
    boolSetting('pause_on_disconnect', 'pause_on_disconnect', false);

    valueSetting('video_swap_interval', 'video_swap_interval');
    valueSetting('video_black_frame_insertion', 'video_black_frame_insertion');
    valueSetting('audio_resampler', 'audio_resampler');
    valueSetting('audio_resampler_quality', 'audio_resampler_quality');
    valueSetting('audio_volume', 'audio_volume');
    valueSetting('audio_mixer_volume', 'audio_mixer_volume');
    valueSetting('audio_dsp_plugin', 'audio_dsp_plugin');
    valueSetting('fastforward_ratio', 'fastforward_ratio');
    valueSetting('preemptive_frames', 'preemptive_frames');
    valueSetting('runahead', 'run_ahead_frames');
    valueSetting('input_poll_type_behavior', 'input_poll_type_behavior');
    valueSetting('input_driver', 'input_driver');
    valueSetting('analog_deadzone', 'input_analog_deadzone');
    valueSetting('analog_sensitivity', 'input_analog_sensitivity');
    valueSetting('RotateScreen', 'screen_orientation');
    valueSetting('MonitorIndex', 'video_monitor_index');
    valueSetting('CRTSwitch', 'crt_switch_resolution');
    valueSetting('CRTSuperRes', 'crt_switch_resolution_super');
    boolSetting('enable_hdr', 'video_hdr_enable', false);

    const gpuIndex = Config.getEmulatorSetting('libretro', 'GPUIndex', '0');
    if (gpuIndex !== 'auto') {
      const driver = cfg['video_driver'];
      if (['d3d10', 'd3d11', 'd3d12', 'vulkan'].includes(driver)) {
        cfg[`${driver}_gpu_index`] = String(gpuIndex);
      }
    }

    const stats = String(Config.getEmulatorSetting('libretro', 'DrawStats', 'disabled'));
    cfg['fps_show'] = stats === 'fps_only' || stats === 'fps_mem' ? 'true' : 'false';
    cfg['memory_show'] = stats === 'mem_only' || stats === 'fps_mem' ? 'true' : 'false';
    cfg['statistics_show'] = stats === 'tech_stats' ? 'true' : 'false';

    if (this.isEnabled(Config.getEmulatorSetting('libretro', 'libretro_rawinput', false))) {
      cfg['input_driver'] = 'raw';
    }
  }

  private mappingDefault(mapping: LibretroCoreOptionMapping): string {
    if (mapping.kind === 'BindBoolFeature') return mapping.values[1] ?? 'disabled';
    if (mapping.kind === 'BindBoolFeatureOn') return mapping.values[0] ?? 'enabled';
    if (mapping.kind === 'BindBoolFeatureAuto') return mapping.values[2] ?? 'auto';
    return mapping.values[0] ?? 'auto';
  }

  private convertMappedValue(mapping: LibretroCoreOptionMapping, value: unknown): string {
    if (mapping.kind === 'BindFeature' || mapping.kind === 'BindFeatureSlider') {
      return String(value);
    }

    const normalized = String(value).trim().toLowerCase();
    if (mapping.kind === 'BindBoolFeatureAuto' && normalized === 'auto') {
      return mapping.values[2] ?? 'auto';
    }

    const enabled = value === true || ['true', '1', 'yes', 'on', 'enabled'].includes(normalized);
    return enabled
      ? mapping.values[0] ?? 'enabled'
      : mapping.values[1] ?? 'disabled';
  }

  private isEnabled(value: unknown): boolean {
    return value === true || ['true', '1', 'yes', 'on', 'enabled'].includes(
      String(value).trim().toLowerCase()
    );
  }

  private applyMupen64CompositeOptions(
    coreCfg: Record<string, string>,
    retroarchCfg: Record<string, string>
  ): void {
    const parallelRdp = this.isEnabled(Config.getCoreSetting(this.core, 'RDP_Plugin', false));
    coreCfg['mupen64plus-rdp-plugin'] = parallelRdp ? 'parallel' : 'gliden64';
    coreCfg['mupen64plus-rsp-plugin'] = parallelRdp ? 'parallel' : 'hle';

    const widescreen = this.isEnabled(Config.getCoreSetting(this.core, 'mupen_Widescreen', false));
    coreCfg['mupen64plus-aspect'] = widescreen ? '16:9 adjusted' : '4:3';
    if (widescreen) {
      retroarchCfg['aspect_ratio_index'] = '1';
      retroarchCfg['video_aspect_ratio_auto'] = 'false';
      retroarchCfg['input_overlay_enable'] = 'false';
      delete retroarchCfg['input_overlay'];
    }

    const crop = String(Config.getCoreSetting(this.core, 'mupen_CropOverscan', 'none'));
    const cropValues: Record<string, string> = { t: '0', b: '0', l: '0', r: '0' };
    if (crop !== 'none' && crop !== 'auto') {
      for (const part of crop.split('_')) {
        const match = part.match(/^([tblr])(\d+)$/i);
        if (match) cropValues[match[1].toLowerCase()] = match[2];
      }
    }
    coreCfg['mupen64plus-OverscanTop'] = cropValues.t;
    coreCfg['mupen64plus-OverscanBottom'] = cropValues.b;
    coreCfg['mupen64plus-OverscanLeft'] = cropValues.l;
    coreCfg['mupen64plus-OverscanRight'] = cropValues.r;

    const performance = this.isEnabled(Config.getCoreSetting(this.core, 'PerformanceMode', false));
    const performanceValues = performance
      ? {
          'mupen64plus-EnableCopyColorToRDRAM': 'Off',
          'mupen64plus-EnableCopyDepthToRDRAM': 'Off',
          'mupen64plus-EnableFBEmulation': 'False',
          'mupen64plus-ThreadedRenderer': 'False',
          'mupen64plus-HybridFilter': 'False',
          'mupen64plus-BackgroundMode': 'OnePiece',
          'mupen64plus-EnableLegacyBlending': 'True',
          'mupen64plus-txFilterIgnoreBG': 'True',
        }
      : {
          'mupen64plus-EnableCopyColorToRDRAM': 'TripleBuffer',
          'mupen64plus-EnableCopyDepthToRDRAM': 'Software',
          'mupen64plus-EnableFBEmulation': 'True',
          'mupen64plus-ThreadedRenderer': 'True',
          'mupen64plus-HybridFilter': 'True',
          'mupen64plus-BackgroundMode': 'Stripped',
          'mupen64plus-EnableLegacyBlending': 'False',
          'mupen64plus-txFilterIgnoreBG': 'False',
        };
    Object.assign(coreCfg, performanceValues);

    const texturePack = String(Config.getCoreSetting(this.core, 'TexturesPack', 'disabled'));
    const textureEnabled = texturePack === 'legacy' || texturePack === 'cache';
    coreCfg['mupen64plus-EnableTextureCache'] = textureEnabled ? 'True' : 'False';
    coreCfg['mupen64plus-txHiresEnable'] = textureEnabled ? 'True' : 'False';
    coreCfg['mupen64plus-txCacheCompression'] = textureEnabled ? 'True' : 'False';
    coreCfg['mupen64plus-txHiresFullAlphaChannel'] = texturePack === 'cache' ? 'True' : 'False';
    coreCfg['mupen64plus-EnableEnhancedTextureStorage'] = texturePack === 'cache' ? 'True' : 'False';
    coreCfg['mupen64plus-EnableEnhancedHighResStorage'] = texturePack === 'cache' ? 'True' : 'False';
  }

  private applySnes9xCompositeOptions(coreCfg: Record<string, string>): void {
    const unsafeHacks = this.isEnabled(
      Config.getCoreSetting(this.core, 'Snes9x_UnsafeHacks', false)
    );
    coreCfg['snes9x_echo_buffer_hack'] = unsafeHacks ? 'enabled' : 'disabled';
    coreCfg['snes9x_randomize_memory'] = unsafeHacks ? 'enabled' : 'disabled';
    coreCfg['snes9x_reduce_sprite_flicker'] = unsafeHacks ? 'enabled' : 'disabled';
    coreCfg['snes9x_block_invalid_vram_access'] = unsafeHacks ? 'disabled' : 'enabled';
  }

  private applyFbneoCompositeOptions(coreCfg: Record<string, string>): void {
    const cpuOverclock = String(Config.getCoreSetting(this.core, 'fbneo_cpu_overclock', '100'));
    coreCfg['fbneo-cpu-speed-adjust'] = `${cpuOverclock === 'auto' ? '100' : cpuOverclock}%`;

    const frameskip = String(Config.getCoreSetting(this.core, 'fbneo_frameskip', 'disabled'));
    if (frameskip === 'auto') {
      coreCfg['fbneo-frameskip-type'] = 'Auto';
    } else if (frameskip !== 'disabled') {
      coreCfg['fbneo-frameskip-type'] = 'Fixed';
      coreCfg['fbneo-fixed-frameskip'] = frameskip;
    } else {
      coreCfg['fbneo-frameskip-type'] = 'disabled';
    }

    const gameName = basename(this.rom, extname(this.rom));
    const freePlay = this.isEnabled(Config.getCoreSetting(this.core, 'fbneo_freeplay', false));
    coreCfg[`fbneo-dipswitch-${gameName}-Free_Play`] = freePlay ? 'On' : 'Off';
  }

  private applyMameExternalOptions(): void {
    const iniDir = join(getRetroBatPath(), 'bios', 'mame', 'ini');
    mkdirSync(iniDir, { recursive: true });

    const mameIniPath = join(iniDir, 'mame.ini');
    this.updateMameIniValue(mameIniPath, 'writeconfig', '0');
    this.updateMameIniValue(
      mameIniPath,
      'output',
      String(Config.getCoreSetting(this.core, 'mame_output', 'auto'))
    );

    const pluginIniPath = join(iniDir, 'plugin.ini');
    this.updateMameIniValue(
      pluginIniPath,
      'cheat',
      this.isEnabled(Config.getCoreSetting(this.core, 'cheats_enable', false)) ? '1' : '0'
    );
    this.updateMameIniValue(
      pluginIniPath,
      'hiscore',
      this.isEnabled(Config.getCoreSetting(this.core, 'mame_hiscore', false)) ? '1' : '0'
    );
    this.updateMameIniValue(
      pluginIniPath,
      'layout',
      this.isEnabled(Config.getCoreSetting(this.core, 'layout_enable', true)) ? '1' : '0'
    );
    this.updateMameIniValue(
      pluginIniPath,
      'offscreenreload',
      this.isEnabled(Config.getCoreSetting(this.core, 'mame_offscreenreload', false)) ? '1' : '0'
    );
  }

  private updateMameIniValue(filePath: string, key: string, value: string): void {
    const lines = existsSync(filePath)
      ? readFileSync(filePath, 'utf8').split(/\r?\n/)
      : [];
    const settingPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`);
    const index = lines.findIndex(line => settingPattern.test(line) && !line.trimStart().startsWith('#'));
    const formatted = `${key.padEnd(24, ' ')}${value}`;
    if (index >= 0) lines[index] = formatted;
    else lines.push(formatted);
    writeFileSync(filePath, `${lines.filter((line, lineIndex) =>
      lineIndex < lines.length - 1 || line.length > 0
    ).join('\n')}\n`, 'utf8');
  }

  private applyAdditionalCompositeOptions(
    core: string,
    coreCfg: Record<string, string>,
    retroarchCfg: Record<string, string>
  ): void {
    if (core === 'ecwolf') {
      const deadzone = String(Config.getCoreSetting(this.core, 'ecwolf_analog_deadzone', '15'));
      const sensitivity = String(Config.getCoreSetting(this.core, 'ecwolf_analog_sensitivity', '10'));
      coreCfg['ecwolf-analog-deadzone'] = `${deadzone}%`;
      coreCfg['ecwolf-analog-move-sensitivity'] = sensitivity === '0' ? 'Off' : sensitivity;
      coreCfg['ecwolf-analog-turn-sensitivity'] = sensitivity === '0' ? 'Off' : sensitivity;
    }

    const freePlayKeys: Record<string, { setting: string; prefix: string }> = {
      fbalpha: { setting: 'fbalpha_freeplay', prefix: 'fba-dipswitch-' },
      fbalpha2012: { setting: 'fbalpha2012_freeplay', prefix: 'fbalpha2012_dipswitch_' },
      fbalpha2012neogeo: {
        setting: 'fbalpha2012ng_freeplay',
        prefix: 'fbalpha2012_neogeo_dipswitch_',
      },
    };
    const freePlay = freePlayKeys[core];
    if (freePlay) {
      const gameName = basename(this.rom, extname(this.rom));
      const separator = core === 'fbalpha' ? '-Free_play' : '_Free_play';
      coreCfg[`${freePlay.prefix}${gameName}${separator}`] = this.isEnabled(
        Config.getCoreSetting(this.core, freePlay.setting, false)
      ) ? 'On' : 'Off';
    }

    if (core === 'fceumm') {
      const sides = String(Config.getCoreSetting(this.core, 'fceumm_overscan_pixels_sides', '0'));
      const vertical = String(Config.getCoreSetting(this.core, 'fceumm_overscan_pixels_topdown', '8'));
      coreCfg['fceumm_overscan_h_left'] = sides;
      coreCfg['fceumm_overscan_h_right'] = sides;
      coreCfg['fceumm_overscan_v_top'] = vertical;
      coreCfg['fceumm_overscan_v_bottom'] = vertical;
    }

    if (core === 'mesen') {
      const sides = String(Config.getCoreSetting(this.core, 'mesen_overscan_pixels_sides', '0'));
      const vertical = String(Config.getCoreSetting(this.core, 'mesen_overscan_pixels_topdown', '0'));
      const sideValue = sides === '0' ? 'None' : `${sides}px`;
      const verticalValue = vertical === '0' ? 'None' : `${vertical}px`;
      coreCfg['mesen_overscan_left'] = sideValue;
      coreCfg['mesen_overscan_right'] = sideValue;
      coreCfg['mesen_overscan_up'] = verticalValue;
      coreCfg['mesen_overscan_down'] = verticalValue;
      retroarchCfg['input_overlay_show_mouse_cursor'] = this.isEnabled(
        Config.getCoreSetting(this.core, 'ShowCursor', false)
      ) ? 'true' : 'false';
    }

    if (core === 'nestopia') {
      const crop = String(Config.getCoreSetting(this.core, 'nestopia_cropoverscan', 't8_b8_l0_r0'));
      const values: Record<string, string> = crop === 'none'
        ? { t: '0', b: '0', l: '0', r: '0' }
        : { t: '8', b: '8', l: '0', r: '0' };
      if (crop !== 'none' && crop !== 'auto') {
        for (const part of crop.split('_')) {
          const match = part.match(/^([tblr])(\d+)$/i);
          if (match) values[match[1].toLowerCase()] = match[2];
        }
      }
      coreCfg['nestopia_overscan_h_left'] = values.l;
      coreCfg['nestopia_overscan_h_right'] = values.r;
      coreCfg['nestopia_overscan_v_top'] = values.t;
      coreCfg['nestopia_overscan_v_bottom'] = values.b;
    }

    if (core === 'mednafenpsxhw') {
      const pgxp = this.isEnabled(Config.getCoreSetting(this.core, 'mednafen_pgxp', false));
      coreCfg['beetle_psx_hw_pgxp_mode'] = pgxp ? 'memory only' : 'disabled';
      coreCfg['beetle_psx_hw_pgxp_texture'] = pgxp ? 'enabled' : 'disabled';
      const textures = this.isEnabled(
        Config.getCoreSetting(this.core, 'mednafen_texture_replacement', false)
      );
      coreCfg['beetle_psx_hw_replace_textures'] = textures ? 'enabled' : 'disabled';
      coreCfg['beetle_psx_hw_track_textures'] = textures ? 'enabled' : 'disabled';
    }

    if (core === 'pcsx2') {
      const scale = String(Config.getCoreSetting(this.core, 'lrps2_axis_scale', '133'));
      coreCfg['pcsx2_axis_scale1'] = `${scale}%`;
      coreCfg['pcsx2_axis_scale2'] = `${scale}%`;
    }

    if (core === 'pcsxrearmed') {
      const enhancement = String(Config.getCoreSetting(this.core, 'neon_enhancement', 'disabled'));
      coreCfg['pcsx_rearmed_neon_enhancement_enable'] =
        enhancement === 'disabled' ? 'disabled' : 'enabled';
      coreCfg['pcsx_rearmed_neon_enhancement_no_main'] =
        enhancement === 'enabled_with_speedhack' ? 'enabled' : 'disabled';
      const fixes = String(Config.getCoreSetting(this.core, 'pcsx_game_fixes', 'disabled'));
      if (fixes !== 'disabled' && fixes !== 'auto') coreCfg[fixes] = 'enabled';
    }

    if (core === 'pokemini') {
      const rumble = String(Config.getCoreSetting(this.core, 'pokemini_rumble', 'all_off'));
      const levels: Record<string, [string, string]> = {
        all_off: ['0', '0'],
        no_rumble_low: ['0', '1'],
        no_rumble_high: ['0', '3'],
        rumble_low: ['2', '0'],
        rumble_medium: ['6', '0'],
        rumble_high: ['10', '0'],
      };
      const [rumbleLevel, shakeLevel] = levels[rumble] || levels.all_off;
      coreCfg['pokemini_rumble_lv'] = rumbleLevel;
      coreCfg['pokemini_screen_shake_lv'] = shakeLevel;
    }

    if (core === 'puae') {
      const sound = Number(Config.getCoreSetting(this.core, 'floppy_sound', 25));
      coreCfg['puae_floppy_sound'] = String(100 - (Number.isFinite(sound) ? sound : 25));
    }

    if (core === 'swanstation') {
      const pgxp = this.isEnabled(Config.getCoreSetting(this.core, 'swanstation_pgxp', false));
      coreCfg['swanstation_GPU_PGXPEnable'] = pgxp ? 'true' : 'false';
      coreCfg['swanstation_GPU_PGXPCulling'] = pgxp ? 'true' : 'false';
      coreCfg['swanstation_GPU_PGXPTextureCorrection'] = pgxp ? 'true' : 'false';
    }

    if (core === 'bsnes' || core === 'bsneshdbeta') {
      const overclock = String(Config.getCoreSetting(this.core, 'bsnes_overclock', '100'));
      coreCfg['bsnes_cpu_overclock'] = overclock;
      coreCfg['bsnes_cpu_sa1_overclock'] = overclock;
      coreCfg['bsnes_cpu_sfx_overclock'] = overclock;
    }

    if (core === 'genesisplusgx' || core === 'picodrive') {
      const filter = String(Config.getCoreSetting(this.core, 'gen_audio_filter', '0'));
      const enabled = filter !== '0' && filter !== 'auto';
      const prefix = core === 'picodrive' ? 'picodrive' : 'genesis_plus_gx';
      coreCfg[`${prefix}_audio_filter`] = enabled ? 'low-pass' : 'disabled';
      coreCfg[`${prefix}_lowpass_range`] = enabled ? filter : '60';
    }

    if (core === 'citra') {
      const languageMap: Record<string, string> = {
        '0': 'Japanese', '1': 'English', '2': 'French', '3': 'German',
        '4': 'Italian', '5': 'Spanish', '6': 'Simplified Chinese',
        '7': 'Korean', '8': 'Dutch', '9': 'portuguese',
        '10': 'russian', '11': 'Traditional Chinese',
      };
      const language = String(Config.getCoreSetting(this.core, 'n3ds_language', '1'));
      coreCfg['citra_language'] = languageMap[language] || 'English';
    }

    if (core === 'opera') {
      const hack = String(Config.getCoreSetting(this.core, 'opera_hack', 'auto'));
      if (hack !== 'auto' && hack !== 'disabled') coreCfg[`opera_${hack}`] = 'enabled';
      const defaultNvram = this.rom.toLowerCase().includes('disc') ? 'shared' : 'per game';
      coreCfg['opera_nvram_storage'] = String(
        Config.getCoreSetting(this.core, 'nvram_storage', defaultNvram)
      );
    }

    if (core === 'atari800') {
      const controlHack = String(Config.getCoreSetting(this.core, 'a800_control_hacks', 'none'));
      coreCfg['atari800_opt2'] = controlHack === 'auto' ? 'none' : controlHack;
      if (
        this.system.toLowerCase() === 'atari5200'
        && this.isEnabled(Config.getCoreSetting(this.core, 'atari800_opt2', false))
      ) {
        coreCfg['atari800_opt2'] = 'enabled';
      }
    }
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
