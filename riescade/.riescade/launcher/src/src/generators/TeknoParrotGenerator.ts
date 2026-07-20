import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class TeknoParrotGenerator extends BaseGenerator {
  private profileName: string = '';
  private userProfilePath: string = '';



  public async configure(): Promise<void> {
    Logger.info(`TeknoParrotGenerator: Configuring TeknoParrot`);

    const emulatorsDir = getEmulatorsPath();
    const tpDir = join(emulatorsDir, 'teknoparrot');

    // 1. Determine profile name (e.g. "abcELF2" from "abcELF2.teknoparrot")
    const romName = basename(this.rom);
    this.profileName = romName.replace(/\.teknoparrot$/i, '');
    Logger.info(`TeknoParrotGenerator: Profile name determined as "${this.profileName}"`);

    const gameProfilePath = join(tpDir, 'GameProfiles', `${this.profileName}.xml`);
    this.userProfilePath = join(tpDir, 'UserProfiles', `${this.profileName}.xml`);

    if (!existsSync(gameProfilePath)) {
      throw new Error(`TeknoParrotGenerator: Game profile template not found at "${gameProfilePath}"`);
    }

    // 2. Create UserProfiles folder if it does not exist
    const userProfilesDir = dirname(this.userProfilePath);
    if (!existsSync(userProfilesDir)) {
      mkdirSync(userProfilesDir, { recursive: true });
    }

    // 3. Copy game profile to user profile if it doesn't exist
    if (!existsSync(this.userProfilePath)) {
      Logger.info(`TeknoParrotGenerator: Creating UserProfile by copying from template: ${gameProfilePath}`);
      copyFileSync(gameProfilePath, this.userProfilePath);
    }

    // 4. Load XML content
    let xml = readFileSync(this.userProfilePath, 'utf8');

    // 5. Parse ExecutableName and EmulatorType
    const execNameMatch = xml.match(/<ExecutableName>([^]*?)<\/ExecutableName>/i);
    const execName = execNameMatch ? execNameMatch[1].trim() : '';
    Logger.info(`TeknoParrotGenerator: ExecutableName from profile is "${execName}"`);

    // 6. Resolve GamePath
    let gamePath = '';
    
    // Check if the current GamePath in the XML can be mapped locally
    const existingPathMatch = xml.match(/<GamePath>([^]*?)<\/GamePath>/i);
    const existingPath = existingPathMatch ? existingPathMatch[1].trim() : '';
    if (existingPath) {
      const idx = existingPath.indexOf(romName);
      if (idx !== -1) {
        const relPath = existingPath.substring(idx + romName.length).replace(/^[\\/]+/, '');
        const localPath = join(this.rom, relPath);
        if (existsSync(localPath)) {
          gamePath = localPath;
          Logger.info(`TeknoParrotGenerator: Re-resolved existing GamePath locally to "${gamePath}"`);
        }
      }
    }

    // If not resolved, search recursively in the ROM directory
    if (!gamePath && execName) {
      gamePath = this.findFileRecursive(this.rom, execName) || '';
      if (gamePath) {
        Logger.info(`TeknoParrotGenerator: Found executable recursively at "${gamePath}"`);
      }
    }

    // Fallback: Check if the ROM name itself exists in executables mapping or try to find any file named execName
    if (!gamePath) {
      const fallbackPath = join(this.rom, execName);
      if (existsSync(fallbackPath)) {
        gamePath = fallbackPath;
        Logger.info(`TeknoParrotGenerator: Found executable at fallback path "${gamePath}"`);
      }
    }

    if (!gamePath) {
      Logger.warn(`TeknoParrotGenerator: Could not find game executable "${execName}" in ROM folder "${this.rom}"`);
      // Use the rom path itself as a last resort fallback
      gamePath = this.rom;
    }

    // Update GamePath in XML
    xml = xml.replace(/<GamePath(?:\s*\/|>[^]*?<\/GamePath>)/i, `<GamePath>${gamePath}</GamePath>`);

    // 7. Resolve GamePath2 if present
    const execName2Match = xml.match(/<ExecutableName2>([^]*?)<\/ExecutableName2>/i);
    const execName2 = execName2Match ? execName2Match[1].trim() : '';
    if (execName2) {
      let gamePath2 = '';
      const existingPath2Match = xml.match(/<GamePath2>([^]*?)<\/GamePath2>/i);
      const existingPath2 = existingPath2Match ? existingPath2Match[1].trim() : '';
      if (existingPath2) {
        const idx = existingPath2.indexOf(romName);
        if (idx !== -1) {
          const relPath = existingPath2.substring(idx + romName.length).replace(/^[\\/]+/, '');
          const localPath = join(this.rom, relPath);
          if (existsSync(localPath)) {
            gamePath2 = localPath;
          }
        }
      }
      if (!gamePath2) {
        gamePath2 = this.findFileRecursive(this.rom, execName2) || '';
      }
      if (gamePath2) {
        xml = xml.replace(/<GamePath2(?:\s*\/|>[^]*?<\/GamePath2>)/i, `<GamePath2>${gamePath2}</GamePath2>`);
        Logger.info(`TeknoParrotGenerator: Set GamePath2 to "${gamePath2}"`);
      }
    }

    // 8. Configure video and fullscreen options
    const forceFsSetting = Config.getEmulatorSetting('teknoparrot', 'teknoparrot_fullscreen') ?? Config.getEmulatorSetting('teknoparrot', 'forcefullscreen', null);
    const forceFs = forceFsSetting !== null ? (forceFsSetting === 'true' || forceFsSetting === true) : Config.getSetting('forcefullscreen', true);
    xml = this.setFieldValue(xml, 'Windowed', forceFs ? '0' : '1');
    xml = this.setFieldValue(xml, 'Borderless Fullscreen', '1');

    // Configure Controllers is disabled per user request to allow manual profile customization in TeknoParrot UI
    // xml = this.configureControllers(xml);

    // Save updated UserProfile XML
    writeFileSync(this.userProfilePath, xml, 'utf8');
    Logger.info(`TeknoParrotGenerator: Saved user profile to "${this.userProfilePath}"`);

    // 9. Configure ParrotData.xml
    const parrotDataPath = join(emulatorsDir, 'teknoparrot', 'ParrotData.xml');
    if (existsSync(parrotDataPath)) {
      try {
        let parrotXml = readFileSync(parrotDataPath, 'utf8');
        parrotXml = this.setXmlElementValue(parrotXml, 'SilentMode', 'true');
        parrotXml = this.setXmlElementValue(parrotXml, 'ConfirmExit', 'false');
        parrotXml = this.setXmlElementValue(parrotXml, 'HideVanguardWarning', 'true');
        parrotXml = this.setXmlElementValue(parrotXml, 'DisableAnalytics', 'true');
        parrotXml = this.setXmlElementValue(parrotXml, 'FirstTimeSetupComplete', 'true');
        parrotXml = this.setXmlElementValue(parrotXml, 'HideDolphinGUI', 'true');
        writeFileSync(parrotDataPath, parrotXml, 'utf8');
        Logger.info(`TeknoParrotGenerator: Setup ParrotData.xml successfully`);
      } catch (err) {
        Logger.error(`TeknoParrotGenerator: Failed to update ParrotData.xml`, err);
      }
    }
  }

  public getLaunchCommand(): { executable: string; args: string[] } {
    const emulatorsDir = getEmulatorsPath();
    const tpDir = join(emulatorsDir, 'teknoparrot');
    const exePath = join(tpDir, 'TeknoParrotUi.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`TeknoParrotGenerator: TeknoParrotUi.exe not found at "${exePath}"`);
    }

    const commandArgs: string[] = [
      `--profile=${this.profileName}.xml`
    ];

    const minimizeSetting = Config.getEmulatorSetting('teknoparrot', 'teknoparrot_minimize') ?? Config.getEmulatorSetting('teknoparrot', 'minimize', null);
    const minimize = minimizeSetting !== null ? (minimizeSetting === 'true' || minimizeSetting === true) : Config.getSetting('tp_minimize', true);
    if (minimize) {
      commandArgs.push('--startMinimized');
    }

    return {
      executable: exePath,
      args: commandArgs,
    };
  }

  private findFileRecursive(dir: string, fileName: string): string | null {
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const found = this.findFileRecursive(fullPath, fileName);
          if (found) return found;
        } else {
          const lowerName = file.toLowerCase();
          const targetLower = fileName.toLowerCase();
          if (lowerName === targetLower || 
              lowerName === `${targetLower}.exe` || 
              lowerName === `${targetLower}.elf`) {
            return fullPath;
          }
        }
      } catch (e) {
        // ignore stat errors
      }
    }
    return null;
  }

  private setFieldValue(xml: string, fieldName: string, newValue: string): string {
    const flexRegex = new RegExp(
      `(<FieldInformation>(?:(?!</FieldInformation>)[^])*?<FieldName>${fieldName}</FieldName>(?:(?!</FieldInformation>)[^])*?<FieldValue>)([^]*?)(</FieldValue>)`,
      'i'
    );
    if (flexRegex.test(xml)) {
      return xml.replace(flexRegex, `$1${newValue}$3`);
    }
    return xml;
  }

  private setXmlElementValue(xml: string, tagName: string, value: string): string {
    const regex = new RegExp(`<${tagName}(?:\\s*\\/|>[^]*?<\\/${tagName}>)`, 'i');
    if (regex.test(xml)) {
      return xml.replace(regex, `<${tagName}>${value}</${tagName}>`);
    }
    if (xml.includes('</ParrotData>')) {
      return xml.replace('</ParrotData>', `  <${tagName}>${value}</${tagName}>\n</ParrotData>`);
    }
    return xml;
  }

}

