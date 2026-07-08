import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class XeniaGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`XeniaGenerator: Configuring Xenia/Xenia-Canary`);

    const emulatorsDir = getEmulatorsPath();
    const isCanary = this.emulator.toLowerCase() === 'xenia-canary';
    const targetFolder = isCanary ? 'xenia-canary' : 'xenia';
    const configName = isCanary ? 'xenia-canary.config.toml' : 'xenia.config.toml';
    const configPath = join(emulatorsDir, targetFolder, configName);

    if (!existsSync(configPath)) {
      Logger.warn(`XeniaGenerator: Config file not found at ${configPath}. Skipping configuration.`);
      return;
    }

    try {
      let configText = readFileSync(configPath, 'utf8');

      // Helper to update TOML values
      const updateTomlSetting = (key: string, value: string | boolean | number) => {
        // match line like: key = value or key=value, with optional comment after #
        const regex = new RegExp(`^(\\s*${key}\\s*=\\s*)[^#\\n]*(.*)$`, 'm');
        if (regex.test(configText)) {
          const formattedValue = typeof value === 'string' ? `"${value}"` : String(value);
          configText = configText.replace(regex, `$1${formattedValue}$2`);
        }
      };

      const fullscreen = (Config.getEmulatorSetting('xenia', 'fullscreen') ?? Config.getEmulatorSetting('xenia', 'forcefullscreen') ?? Config.getEmulatorSetting('xenia', 'xenia_fullscreen', 'false')) === 'true';
      const gpu = Config.getEmulatorSetting('xenia', 'gpu') ?? Config.getEmulatorSetting('xenia', 'xenia_gpu', 'any');
      const vsync = (Config.getEmulatorSetting('xenia', 'vsync') ?? Config.getEmulatorSetting('xenia', 'xenia_vsync', 'true')) === 'true';
      const licenseMaskSetting = Config.getEmulatorSetting('xenia', 'license_mask') ?? Config.getEmulatorSetting('xenia', 'xenia_license_mask', '0');
      const licenseMask = parseInt(licenseMaskSetting, 10);

      updateTomlSetting('fullscreen', fullscreen);
      updateTomlSetting('gpu', gpu);
      updateTomlSetting('vsync', vsync);
      updateTomlSetting('license_mask', licenseMask);

      // Internal Resolution Scaling
      const resolutionSetting = Config.getEmulatorSetting('xenia', 'xenia_resolution');
      if (resolutionSetting) {
        const parts = resolutionSetting.split('_');
        if (parts.length === 2) {
          const scaleX = parseInt(parts[0], 10);
          const scaleY = parseInt(parts[1], 10);
          if (!isNaN(scaleX) && !isNaN(scaleY)) {
            updateTomlSetting('draw_resolution_scale_x', scaleX);
            updateTomlSetting('draw_resolution_scale_y', scaleY);
          }
        }
      }

      // Other features
      const allowInvalidFetch = Config.getEmulatorSetting('xenia', 'gpu_allow_invalid_fetch_constants');
      if (allowInvalidFetch !== undefined) {
        updateTomlSetting('gpu_allow_invalid_fetch_constants', allowInvalidFetch === 'true' || allowInvalidFetch === true);
      }

      const readbackResolve = Config.getEmulatorSetting('xenia', 'd3d12_readback_resolve');
      if (readbackResolve !== undefined) {
        updateTomlSetting('d3d12_readback_resolve', readbackResolve === 'true' || readbackResolve === true);
      }

      const antialiasing = Config.getEmulatorSetting('xenia', 'postprocess_antialiasing');
      if (antialiasing) {
        updateTomlSetting('postprocess_antialiasing', antialiasing);
      }

      const allowVrr = Config.getEmulatorSetting('xenia', 'xenia_allow_variable_refresh_rate_and_tearing');
      if (allowVrr !== undefined) {
        updateTomlSetting('xenia_allow_variable_refresh_rate_and_tearing', allowVrr === 'true' || allowVrr === true);
      }

      const userLangSetting = Config.getEmulatorSetting('xenia', 'xenia_lang');
      if (userLangSetting) {
        const userLang = parseInt(userLangSetting, 10);
        if (!isNaN(userLang)) {
          updateTomlSetting('user_language', userLang);
        }
      }

      const mountCache = Config.getEmulatorSetting('xenia', 'mount_cache');
      if (mountCache !== undefined) {
        updateTomlSetting('mount_cache', mountCache === 'true' || mountCache === true);
      }

      const scribbleHeap = Config.getEmulatorSetting('xenia', 'scribble_heap');
      if (scribbleHeap !== undefined) {
        updateTomlSetting('scribble_heap', scribbleHeap === 'true' || scribbleHeap === true);
      }

      const protectZero = Config.getEmulatorSetting('xenia', 'protect_zero');
      if (protectZero !== undefined) {
        updateTomlSetting('protect_zero', protectZero === 'true' || protectZero === true);
      }

      const d3dDebug = Config.getEmulatorSetting('xenia', 'xenia_d3d12_debug');
      if (d3dDebug !== undefined) {
        updateTomlSetting('d3d12_debug', d3dDebug === 'true' || d3dDebug === true);
      }

      const apu = Config.getEmulatorSetting('xenia', 'apu');
      if (apu) {
        updateTomlSetting('apu', apu);
      }

      const hidSetting = Config.getEmulatorSetting('xenia', 'xenia_hid');
      if (hidSetting) {
        updateTomlSetting('hid', hidSetting);
      }

      writeFileSync(configPath, configText, 'utf8');
      Logger.info(`XeniaGenerator: Successfully configured ${configName}`);
    } catch (err) {
      Logger.error(`XeniaGenerator: Failed to configure Xenia config`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const isCanary = this.emulator.toLowerCase() === 'xenia-canary';
    const targetFolder = isCanary ? 'xenia-canary' : 'xenia';
    const exeName = isCanary ? 'xenia_canary.exe' : 'xenia.exe';
    const exePath = join(emulatorsDir, targetFolder, exeName);

    if (!existsSync(exePath)) {
      Logger.warn(`XeniaGenerator: Xenia executable not found at ${exePath}. Falling back to default path.`);
    }

    const commandArgs: string[] = [
      '--fullscreen',
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
