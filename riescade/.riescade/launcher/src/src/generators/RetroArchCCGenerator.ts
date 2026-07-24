import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class RetroArchCCGenerator extends BaseGenerator {
  private readonly directory = join(getEmulatorsPath(), 'retroarchCC');

  public configure(): void {
    const configPath = join(this.directory, 'retroarch.cfg');
    const config = this.readConfig(configPath);
    const fullscreen = Config.getEmulatorSetting('retroarchcc', 'fullscreen', 'true');
    const aspect = String(Config.getEmulatorSetting('retroarchcc', 'aspect_ratio', 'auto')).toLowerCase();

    config.video_fullscreen = String(fullscreen === true || fullscreen === 'true');
    config.video_vsync = String(Config.getEmulatorSetting('retroarchcc', 'vsync', 'true'));
    config.video_scale_integer = String(Config.getEmulatorSetting('retroarchcc', 'integer_scale', 'false'));
    config.input_autodetect_enable = String(Config.getEmulatorSetting('retroarchcc', 'input_autodetect', 'true'));

    if (aspect === '4:3') config.aspect_ratio_index = '0';
    else if (aspect === '16:9') config.aspect_ratio_index = '1';
    else if (aspect === 'stretch') config.aspect_ratio_index = '22';
    else config.aspect_ratio_index = '20';

    const videoDriver = Config.getEmulatorSetting('retroarchcc', 'video_driver', 'auto');
    const audioDriver = Config.getEmulatorSetting('retroarchcc', 'audio_driver', 'auto');
    if (videoDriver !== 'auto') config.video_driver = String(videoDriver);
    if (audioDriver !== 'auto') config.audio_driver = String(audioDriver);

    writeFileSync(
      configPath,
      Object.entries(config).map(([key, value]) => `${key} = "${value}"`).join('\n'),
      'utf8'
    );
    Logger.info(`RetroArchCCGenerator: Updated ${configPath}`);
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const executable = join(this.directory, 'retroarch.exe');
    if (!existsSync(executable)) Logger.warn(`RetroArchCCGenerator: Executable not found at ${executable}.`);
    return { executable, args: [this.rom] };
  }

  private readConfig(configPath: string): Record<string, string> {
    if (!existsSync(configPath)) return {};
    const config: Record<string, string> = {};
    for (const line of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#][^=]+?)\s*=\s*"?([^"]*)"?\s*$/);
      if (match) config[match[1].trim()] = match[2].trim();
    }
    return config;
  }
}
