import { existsSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class Snes9xGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`Snes9xGenerator: Configuring snes9x`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'snes9x', 'snes9x.conf');

    try {
      if (!existsSync(configPath)) {
        Logger.warn(`Snes9xGenerator: Configuration file not found at ${configPath}.`);
        return;
      }

      const setting = (key: string, fallback = 'auto') =>
        String(Config.getEmulatorSetting('snes9x', key, fallback));
      const writeBool = (
        key: string,
        section: string,
        realKey: string,
        enabled = 'TRUE',
        disabled = 'FALSE'
      ) => {
        const value = setting(key);
        if (value === 'auto') return;
        const isEnabled = ['true', '1', 'on', 'enabled'].includes(value.toLowerCase());
        updateIniSetting(configPath, section, realKey, isEnabled ? enabled : disabled);
      };

      const renderer = setting('snes9x_renderer');
      if (renderer !== 'auto') updateIniSetting(configPath, 'Display\\Win', 'OutputMethod', renderer);

      const filter = setting('snes9x_ntsc_filters');
      if (filter !== 'auto') updateIniSetting(configPath, 'Display\\Win', 'FilterType', filter);

      writeBool('snes9x_integer', 'Display\\Win', 'Stretch:IntegerScaling');
      writeBool('snes9x_vsync', 'Display\\Win', 'Vsync');
      writeBool('snes9x_bilinear', 'Display\\Win', 'Stretch:BilinearFilter');
      writeBool('snes9x_scanlines', 'Display\\Win', 'NTSCScanlines');
      writeBool('snes9x_showmenu', 'Display\\Win', 'HideMenu', 'FALSE', 'TRUE');
      writeBool('snes9x_framerate', 'Display', 'FrameRate', 'ON', 'OFF');
      writeBool('snes9x_dinput', 'Controls', 'UseDirectInput');
      writeBool('fullscreen', 'Display\\Win', 'Fullscreen:Enabled');
      writeBool('fullscreen', 'Display\\Win', 'FullscreenOnOpen');

      const ratio = setting('snes9x_ratio');
      if (ratio !== 'auto') {
        updateIniSetting(configPath, 'Display\\Win', 'Stretch:Enabled', 'TRUE');
        updateIniSetting(
          configPath,
          'Display\\Win',
          'Stretch:MaintainAspectRatio',
          ratio === 'stretch' ? 'FALSE' : 'TRUE'
        );
        if (ratio !== 'stretch') {
          updateIniSetting(
            configPath,
            'Display\\Win',
            'Stretch:AspectRatioBaseWidth',
            ratio === '8/7' || ratio === 'full_87' ? '256' : '299'
          );
        }
      }
    } catch (err) {
      Logger.error(`Snes9xGenerator: Failed to configure snes9x.conf`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'snes9x', 'snes9x-x64.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`Snes9xGenerator: Executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];
    
    const fullscreen = Config.getEmulatorSetting('snes9x', 'fullscreen', 'true') === 'true';
    if (fullscreen) {
      commandArgs.push('--fullscreen');
    }

    const mouse = String(Config.getEmulatorSetting('snes9x', 'snes9x_mouse', 'auto'));
    if (mouse === 'port1' || mouse === 'port2') {
      commandArgs.push(`-${mouse}`, 'mouse1');
    }

    const gunType = String(Config.getEmulatorSetting('snes9x', 'snes9x_guntype', 'auto'));
    if (gunType === 'superscope' || gunType === 'justifier' || gunType === 'justifiers') {
      commandArgs.push('-port2', gunType === 'justifiers' ? 'two-justifiers' : gunType);
    }

    commandArgs.push(this.rom);

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
