import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class PinballFXGenerator extends BaseGenerator {
  public configure(): void {
    Logger.info(`PinballFXGenerator: Configuring pinballfx`);
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const system = (this.system || '').toLowerCase();
    const core = (this.core || '').toLowerCase();
    const commandArgs: string[] = [];

    const systemExeNames: { [key: string]: string } = {
      'pinballfx': 'PinballFX',
      'pinballfx2': 'Pinball FX2',
      'pinballfx3': 'Pinball FX Classic',
      'pinballm': 'Pinball FX Midnight'
    };

    const steamAppIds: { [key: string]: string } = {
      'pinballfx': '2328760',
      'pinballfx2': '226980',
      'pinballfx3': '442120',
      'pinballm': '2337640'
    };

    const fallbackExeNames: { [key: string]: string[] } = {
      'pinballfx': ['PinballFX', 'Pinball FX', 'pinballFX', 'pinballfx', 'Pinball Fx', 'Pinball_FX', 'PinballFX-Win64-Shipping'],
      'pinballfx2': ['Pinball FX2', 'PinballFX2', 'Pinball_FX2'],
      'pinballfx3': ['Pinball FX3', 'PinballFX3', 'Pinball_FX3', 'Pinball FX Classic'],
      'pinballm': ['PinballM', 'Pinball M', 'Pinball FX Midnight', 'PinballM-Win64-Shipping']
    };

    let exePath = '';

    if (core === 'steam') {
      let steamPath = 'C:\\Program Files (x86)\\Steam';
      if (process.env['ProgramFiles(x86)']) {
        steamPath = join(process.env['ProgramFiles(x86)'], 'Steam');
      }
      exePath = join(steamPath, 'steam.exe');
      if (!existsSync(exePath)) {
        exePath = 'C:\\Program Files\\Steam\\steam.exe';
      }

      commandArgs.push('-nofriendsui', '-silent', '-applaunch');
      const appId = steamAppIds[system];
      if (appId) {
        commandArgs.push(appId);
      }
    } else {
      const emulatorsDir = getEmulatorsPath();
      const path = join(emulatorsDir, system);
      const candidates = fallbackExeNames[system] || [];
      let foundExe = '';
      for (const cand of candidates) {
        const testPath = join(path, cand + '.exe');
        if (existsSync(testPath)) {
          foundExe = testPath;
          break;
        }
      }
      if (!foundExe) {
        foundExe = join(path, (systemExeNames[system] || system) + '.exe');
      }
      exePath = foundExe;
    }

    if (system === 'pinballfx' || system === 'pinballm') {
      if (existsSync(this.rom)) {
        try {
          const lines = readFileSync(this.rom, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            const tableId = parseInt(lines[0], 10);
            if (!isNaN(tableId)) {
              commandArgs.push('-Table', String(tableId));
            }
          }
        } catch (err) {
          Logger.error('PinballFXGenerator: Failed to read ROM table ID:', err);
        }
      }

      const gamemodeKey = `${system}_gamemode`;
      const gamemode = Config.getEmulatorSetting(system, gamemodeKey, 'auto');
      if (gamemode && gamemode !== 'auto') {
        commandArgs.push('-GameMode', gamemode);
      }
    } else if (system === 'pinballfx2') {
      const romName = basename(this.rom, extname(this.rom));
      if (core === 'steam') {
        commandArgs.push(romName);
      } else {
        commandArgs.push('/LoadTable', `"${romName}"`);
      }
    } else if (system === 'pinballfx3') {
      const offline = Config.getEmulatorSetting('pinballfx3', 'pinballfx3_offline', 'false') === 'true';
      if (offline) {
        commandArgs.push('-offline');
      }
      const classic = Config.getEmulatorSetting('pinballfx3', 'pinballfx3_classic', 'false') === 'true';
      if (classic) {
        commandArgs.push('-class');
      }
      const players = Config.getEmulatorSetting('pinballfx3', 'pinballfx3_players', '1');
      if (players && players !== '1' && players !== 'auto') {
        commandArgs.push(`-hotseat_${players}`);
      }
      const romName = basename(this.rom, extname(this.rom));
      commandArgs.push(`-table_${romName}`);
    }

    if (!existsSync(exePath)) {
      Logger.warn(`PinballFXGenerator: Executable not found at ${exePath}.`);
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }

  public cleanup(): void {
    const system = (this.system || '').toLowerCase();
    const killSteamOpt = Config.getEmulatorSetting(system, 'killsteam', 'false') === 'true';
    if (killSteamOpt) {
      try {
        const { execSync } = require('child_process');
        execSync('taskkill /f /im steam.exe', { stdio: 'ignore' });
        Logger.info('PinballFXGenerator: Steam process killed successfully.');
      } catch (err) {
        // Ignore error
      }
    }
  }
}
