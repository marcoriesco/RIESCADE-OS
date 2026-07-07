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

      const fullscreen = Config.getEmulatorSetting('xenia', 'xenia_fullscreen', 'false') === 'true';
      const gpu = Config.getEmulatorSetting('xenia', 'xenia_gpu', 'any');
      const vsync = Config.getEmulatorSetting('xenia', 'xenia_vsync', 'true') === 'true';
      const licenseMask = Config.getEmulatorSetting('xenia', 'xenia_license_mask', '0');

      updateTomlSetting('fullscreen', fullscreen);
      updateTomlSetting('gpu', gpu);
      updateTomlSetting('vsync', vsync);
      updateTomlSetting('license_mask', licenseMask);

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
