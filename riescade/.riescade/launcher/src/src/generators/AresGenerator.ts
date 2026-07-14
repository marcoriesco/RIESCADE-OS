import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

interface BmlNode {
  key: string;
  value: string;
  indent: number;
  children: BmlNode[];
}

export class AresGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`AresGenerator: Configuring Ares`);

    const emulatorsDir = getEmulatorsPath();
    const settingsPath = join(emulatorsDir, 'ares', 'settings.bml');

    if (!existsSync(settingsPath)) {
      Logger.warn(`AresGenerator: settings.bml not found at ${settingsPath}. Cannot configure emulator settings.`);
      return;
    }

    try {
      const bmlText = readFileSync(settingsPath, 'utf8');
      const rootNodes = this.parseBml(bmlText);

      // Helper to map and update settings
      const updateSetting = (configKey: string, bmlPath: string[], fallbackValue: string) => {
        const val = Config.getEmulatorSetting('ares', configKey, fallbackValue);
        this.setBmlValue(rootNodes, bmlPath, String(val));
      };

      // Video Settings
      updateSetting('ares_aspect', ['Video', 'Output'], 'Scale');
      updateSetting('ares_aspectcorrection', ['Video', 'AspectCorrectionMode'], 'Anamorphic');
      updateSetting('ares_renderer', ['Video', 'Driver'], 'OpenGL 3.2');
      updateSetting('ares_luminance', ['Video', 'Luminance'], '1.0');
      updateSetting('ares_saturation', ['Video', 'Saturation'], '1.0');
      updateSetting('ares_gamma', ['Video', 'Gamma'], '1.0');
      updateSetting('ares_colobleed', ['Video', 'ColorBleed'], 'false');
      updateSetting('ares_coloremulation', ['Video', 'ColorEmulation'], 'true');
      updateSetting('ares_interframe_blend', ['Video', 'InterframeBlending'], 'true');
      updateSetting('ares_overscan', ['Video', 'Overscan'], 'false');
      updateSetting('ares_pixel_accurate', ['Video', 'PixelAccuracy'], 'false');
      updateSetting('ares_n64_quality', ['Video', 'Quality'], 'HD');
      updateSetting('ares_supersampling', ['Video', 'Supersampling'], 'false');
      updateSetting('ares_weavedeinterlacing', ['Video', 'WeaveDeinterlacing'], 'true');

      // Audio Settings
      updateSetting('ares_audio_renderer', ['Audio', 'Driver'], 'WASAPI');
      updateSetting('ares_audiosync', ['Audio', 'Blocking'], 'true');

      // Boot Settings
      updateSetting('ares_fastboot', ['Boot', 'Fast'], 'false');
      updateSetting('ares_region', ['Boot', 'Prefer'], 'NTSC-U');

      // Emulation/Latency Settings
      updateSetting('rewind', ['General', 'Rewind'], 'false');
      updateSetting('ares_runahead', ['General', 'RunAhead'], 'false');

      // N64 Settings
      updateSetting('ares_ExpansionPak', ['Nintendo64', 'ExpansionPak'], 'true');

      const updatedBmlText = this.formatBml(rootNodes);
      writeFileSync(settingsPath, updatedBmlText, 'utf8');
      Logger.info(`AresGenerator: Successfully configured settings.bml`);
    } catch (err) {
      Logger.error(`AresGenerator: Failed to configure settings.bml`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const exePath = join(emulatorsDir, 'ares', 'ares.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`AresGenerator: ares.exe not found at ${exePath}.`);
    }

    const commandArgs: string[] = [];

    // System argument if defined
    if (this.system) {
      const systemMap: Record<string, string> = {
        'n64': 'Nintendo 64',
        'nintendo64': 'Nintendo 64',
        'snes': 'Super Famicom',
        'sfc': 'Super Famicom',
        'nes': 'Famicom',
        'fc': 'Famicom',
        'gb': 'Game Boy',
        'gbc': 'Game Boy Color',
        'gba': 'Game Boy Advance',
        'megadrive': 'Mega Drive',
        'genesis': 'Mega Drive',
        'sega32x': 'Sega 32X',
        '32x': 'Sega 32X',
        'segacd': 'Sega CD',
        'megacd': 'Sega CD',
        'gamegear': 'Game Gear',
        'mastersystem': 'Master System',
        'sg1000': 'SG-1000',
        'pce': 'PC Engine',
        'tg16': 'PC Engine',
        'pcecd': 'PC Engine CD',
        'tgcd': 'PC Engine CD',
        'sgx': 'SuperGrafx',
        'msx': 'MSX',
        'msx2': 'MSX2',
        'coleco': 'ColecoVision',
        'colecovision': 'ColecoVision',
        'ngp': 'Neo Geo Pocket',
        'ngpc': 'Neo Geo Pocket Color',
        'wswan': 'WonderSwan',
        'wonderswan': 'WonderSwan',
        'wswanc': 'WonderSwan Color',
        'wonderswanc': 'WonderSwan Color',
        'psx': 'PlayStation',
        'ps1': 'PlayStation',
        'playstation': 'PlayStation'
      };
      let mappedSystem = systemMap[this.system.toLowerCase()] || this.system;
      if (this.system.toLowerCase() === 'laseractive') {
        mappedSystem = (this.core && this.core.toLowerCase() === 'necld')
          ? 'LaserActive (NEC PAC)'
          : 'LaserActive (SEGA PAC)';
      }
      commandArgs.push('--system', mappedSystem);
    }

    // Append rom path
    commandArgs.push(this.rom);

    // No file prompt flag to prevent dialogs
    commandArgs.push('--no-file-prompt');

    // Fullscreen flag if enabled in configuration
    const isFullscreen = Config.getEmulatorSetting('ares', 'ares_fullscreen', 'false') === 'true' || 
                         Config.getEmulatorSetting('ares', 'ares_fullscreen', 'false') === true;
    if (isFullscreen) {
      commandArgs.push('--fullscreen');
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }

  // BML Parser
  private parseBml(text: string): BmlNode[] {
    const lines = text.split(/\r?\n/);
    const rootNodes: BmlNode[] = [];
    const stack: BmlNode[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const indent = line.length - line.trimStart().length;
      const content = line.trim();
      const colonIndex = content.indexOf(':');
      let key = content;
      let value = '';
      if (colonIndex !== -1) {
        key = content.substring(0, colonIndex).trim();
        value = content.substring(colonIndex + 1).trim();
      }

      const node: BmlNode = { key, value, indent, children: [] };

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (stack.length === 0) {
        rootNodes.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
    }

    return rootNodes;
  }

  // BML Formatter
  private formatBml(nodes: BmlNode[]): string {
    let result = '';
    for (const node of nodes) {
      const spacing = ' '.repeat(node.indent);
      if (node.value) {
        result += `${spacing}${node.key}: ${node.value}\n`;
      } else {
        result += `${spacing}${node.key}\n`;
      }
      if (node.children.length > 0) {
        result += this.formatBml(node.children);
      }
    }
    return result;
  }

  // Set/Update BML Node value
  private setBmlValue(nodes: BmlNode[], path: string[], value: string, currentIndent = 0): void {
    if (path.length === 0) return;
    const [currentKey, ...rest] = path;
    let node = nodes.find(n => n.key === currentKey);
    if (!node) {
      node = { key: currentKey, value: rest.length === 0 ? value : '', indent: currentIndent, children: [] };
      nodes.push(node);
    }

    if (rest.length === 0) {
      node.value = value;
    } else {
      this.setBmlValue(node.children, rest, value, node.indent + 2);
    }
  }
}
