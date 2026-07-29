import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getConfigsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { updateIniSetting } from '../utils/ini.js';

export class OpenBorGenerator extends BaseGenerator {
  private stagedPakPath: string | null = null;

  public configure(): void {
    Logger.info(`OpenBorGenerator: Configuring openbor`);
    
    const emulatorsDir = getEmulatorsPath();
    const configPath = join(emulatorsDir, 'openbor', 'config.ini');

    try {
      const schemaPath = join(getConfigsPath(), 'emulators', 'schemas', 'openbor.schema.json');
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        for (const group of (schema.groups || [])) {
          for (const opt of (group.options || [])) {
            if (opt.realKey) {
              const val = Config.getEmulatorSetting('openbor', opt.configKey || opt.id, opt.default || 'auto');
              const section = opt.realSection || 'Settings';
              updateIniSetting(configPath, section, opt.realKey, val);
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`OpenBorGenerator: Failed to configure config.ini`, err);
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    let exePath = join(emulatorsDir, 'openbor', 'OpenBOR.exe');

    if (this.core === 'openbor-specific-version') {
      const version = basename(this.rom).match(/\[(\d{1,4})\](?=\.[^.]+$)/)?.[1];
      if (version) {
        const versionDirectory = join(emulatorsDir, 'openbor', version);
        const preferredExecutable = join(versionDirectory, 'OpenBOR.exe');
        if (existsSync(preferredExecutable)) {
          exePath = preferredExecutable;
        } else if (existsSync(versionDirectory)) {
          const executable = readdirSync(versionDirectory)
            .find(file => file.toLowerCase().endsWith('.exe'));
          if (executable) exePath = join(versionDirectory, executable);
        }
      } else {
        Logger.warn(
          `OpenBorGenerator: The ROM name must end with [version] to use openbor-specific-version: ${this.rom}`
        );
      }
    }

    if (extname(this.rom).toLowerCase() === '.exe') {
      exePath = this.rom;
    }

    if (!existsSync(exePath)) {
      throw new Error(`OpenBorGenerator: Executável não encontrado em ${exePath}.`);
    }

    const executableHeader = readFileSync(exePath).subarray(0, 2);
    if (executableHeader[0] !== 0x4d || executableHeader[1] !== 0x5a) {
      throw new Error(
        `OpenBorGenerator: O arquivo ${exePath} está corrompido ou não é um executável Windows válido.`
      );
    }

    if (extname(this.rom).toLowerCase() === '.pak') {
      const paksDirectory = join(dirname(exePath), 'Paks');
      mkdirSync(paksDirectory, { recursive: true });

      for (const file of readdirSync(paksDirectory, { withFileTypes: true })) {
        if (file.isFile() && file.name.toLowerCase().endsWith('.pak')) {
          unlinkSync(join(paksDirectory, file.name));
        }
      }

      this.stagedPakPath = join(paksDirectory, basename(this.rom));
      copyFileSync(this.rom, this.stagedPakPath);
      Logger.info(`OpenBorGenerator: Staged PAK at ${this.stagedPakPath}.`);
    }

    return {
      executable: exePath,
      args: [],
    };
  }

  public cleanup(): void {
    if (!this.stagedPakPath) return;
    try {
      if (existsSync(this.stagedPakPath)) {
        unlinkSync(this.stagedPakPath);
        Logger.info(`OpenBorGenerator: Removed staged PAK ${this.stagedPakPath}.`);
      }
    } catch (error) {
      Logger.error(`OpenBorGenerator: Failed to remove staged PAK ${this.stagedPakPath}.`, error);
    } finally {
      this.stagedPakPath = null;
    }
  }
}
