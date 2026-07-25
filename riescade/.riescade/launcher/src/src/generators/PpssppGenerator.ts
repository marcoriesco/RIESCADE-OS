import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getRetroBatPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class PpssppGenerator extends BaseGenerator {
  private fullscreen = true;

  public configure(): void {
    Logger.info(`PpssppGenerator: Configuring PPSSPP`);
    
    const emulatorsDir = getEmulatorsPath();
    const ppssppDir = join(emulatorsDir, 'ppsspp');
    const memstickDir = join(getRetroBatPath(), 'saves', 'psp');
    const systemDir = join(memstickDir, 'SYSTEM');
    const iniPath = join(systemDir, 'ppsspp.ini');

    try {
      mkdirSync(systemDir, { recursive: true });

      const setting = (key: string, fallback = 'auto'): string =>
        String(Config.getEmulatorSetting('ppsspp', key, fallback));
      const write = (section: string, key: string, value: string): void => {
        if (value !== 'auto') updateIniSetting(iniPath, section, key, value);
      };
      const writeBool = (section: string, key: string, configKey: string, fallback = 'auto'): void => {
        const value = setting(configKey, fallback);
        if (value !== 'auto') write(section, key, value === 'true' ? 'True' : 'False');
      };

      this.fullscreen = setting('fullscreen', 'true') === 'true';
      write('Graphics', 'FullScreen', this.fullscreen ? 'True' : 'False');
      writeBool('Graphics', 'VSync', 'ppsspp_vsync');
      write('Graphics', 'InternalResolution', setting('ppsspp_resolution'));
      write('Graphics', 'GraphicsBackend', setting('ppsspp_backend'));
      write('Graphics', 'MultiSampleLevel', setting('ppsspp_msaa'));
      write('Graphics', 'FrameSkip', setting('ppsspp_frame_skipping'));
      writeBool('Graphics', 'TexDeposterize', 'ppsspp_TexDeposterize');
      write('Graphics', 'TexScalingLevel', setting('ppsspp_textureenhancement_level'));
      write('Graphics', 'AnisotropyLevel', setting('ppsspp_anisotropicfilter'));
      write('Graphics', 'TextureFiltering', setting('ppsspp_texture_filtering'));
      writeBool('Graphics', 'Smart2DTexFiltering', 'ppsspp_smart2d');
      writeBool('Graphics', 'ReplaceTextures', 'ppsspp_texture_replacement');
      writeBool('General', 'EnableCheats', 'ppsspp_cheats');
      writeBool('Control', 'UseMouse', 'ppsspp_mouse');
      write('Sound', 'AudioBackend', setting('ppsspp_audiobackend'));
      write('SystemParam', 'GameLanguage', setting('ppsspp_lang'));

      const confirmButton = setting('ppsspp_confirmbutton');
      if (confirmButton !== 'auto') {
        write('SystemParam', 'ButtonPreference', confirmButton === 'true' ? '0' : '1');
      }

      const ratio = setting('ppsspp_ratio');
      if (ratio !== 'auto') {
        const stretch = ratio === 'stretch';
        for (const section of ['DisplayLayout.Landscape', 'DisplayLayout.Portrait']) {
          write(section, 'DisplayStretch', stretch ? 'True' : 'False');
          write(section, 'DisplayAspectRatio', stretch ? '1.000000' : ratio);
        }
      }

      const integerScaling = setting('Integer_Scaling');
      if (integerScaling !== 'auto') {
        for (const section of ['DisplayLayout.Landscape', 'DisplayLayout.Portrait']) {
          write(section, 'DisplayIntegerScale', integerScaling === 'true' ? 'True' : 'False');
        }
      }

      const frameSkipType = setting('ppsspp_frameskip_type');
      if (frameSkipType !== 'auto') {
        write('Graphics', 'AutoFrameSkip', 'False');
      } else if (setting('ppsspp_frame_skipping') !== 'auto') {
        write('Graphics', 'AutoFrameSkip', 'True');
        write('Graphics', 'FrameSkip', '1');
      }

      const enhancement = setting('ppsspp_textureenhancement');
      if (enhancement !== 'auto') {
        const hardwareScaling = enhancement.startsWith('Tex')
          && setting('ppsspp_backend').toLowerCase().includes('vulkan');
        write('Graphics', 'TexHardwareScaling', hardwareScaling ? 'True' : 'False');
        write('Graphics', 'TextureShader', hardwareScaling ? enhancement : 'Off');
        if (!hardwareScaling) write('Graphics', 'TexScalingType', enhancement);
      }

      const shader = setting('ppsspp_shader');
      write('PostShaderList', 'PostShader1', shader);

      Logger.info(`PpssppGenerator: Updated configured PPSSPP settings in ${iniPath}`);
    } catch (err) {
      Logger.error(`PpssppGenerator: Failed to update ppsspp.ini`, err);
    }

    try {
      writeFileSync(join(ppssppDir, 'installed.txt'), memstickDir, 'utf8');
      Logger.info(`PpssppGenerator: Updated memory stick path in ${join(ppssppDir, 'installed.txt')}`);
    } catch (err) {
      Logger.warn(`PpssppGenerator: Could not update installed.txt - ${String(err)}`);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const ppssppDir = join(emulatorsDir, 'ppsspp');
    
    let exePath = join(ppssppDir, 'PPSSPPWindows64.exe');
    if (!existsSync(exePath)) {
      exePath = join(ppssppDir, 'PPSSPP.exe');
    }

    if (!existsSync(exePath)) {
      Logger.warn(`PpssppGenerator: PPSSPP executable not found at ${exePath}.`);
    }

    const commandArgs: string[] = [
      ...(this.fullscreen ? ['-fullscreen'] : []),
      this.rom
    ];

    return {
      executable: exePath,
      args: commandArgs,
    };
  }
}
