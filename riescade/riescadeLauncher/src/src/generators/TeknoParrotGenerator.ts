import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';

export class TeknoParrotGenerator extends BaseGenerator {
  private profileName: string = '';
  private userProfilePath: string = '';

  private readonly mappingToKeyName: Record<string, string> = {
    'Test': 'select',
    'Service1': 'select',
    'JvsTwoService1': 'select',
    'Service2': 'select',
    'JvsTwoService2': 'select',
    'Coin1': 'select',
    'JvsTwoCoin1': 'select',
    'P1ButtonStart': 'start',
    'JvsTwoP1ButtonStart': 'start',
    'P1Button1': 'a',
    'JvsTwoP1Button1': 'a',
    'P1Button2': 'b',
    'JvsTwoP1Button2': 'b',
    'P1Button3': 'x',
    'JvsTwoP1Button3': 'x',
    'P1Button4': 'y',
    'JvsTwoP1Button4': 'y',
    'P1Button5': 'pageup',
    'JvsTwoP1Button5': 'pageup',
    'P1Button6': 'pagedown',
    'JvsTwoP1Button6': 'pagedown',
    'P1ButtonUp': 'up',
    'JvsTwoP1ButtonUp': 'up',
    'P1ButtonDown': 'down',
    'JvsTwoP1ButtonDown': 'down',
    'P1ButtonLeft': 'left',
    'JvsTwoP1ButtonLeft': 'left',
    'P1ButtonRight': 'right',
    'JvsTwoP1ButtonRight': 'right',
    'Coin2': 'select',
    'JvsTwoCoin2': 'select',
    'P2ButtonStart': 'start',
    'JvsTwoP2ButtonStart': 'start',
    'P2Button1': 'a',
    'JvsTwoP2Button1': 'a',
    'P2Button2': 'b',
    'JvsTwoP2Button2': 'b',
    'P2Button3': 'x',
    'JvsTwoP2Button3': 'x',
    'P2Button4': 'y',
    'JvsTwoP2Button4': 'y',
    'P2Button5': 'pageup',
    'JvsTwoP2Button5': 'pageup',
    'P2Button6': 'pagedown',
    'JvsTwoP2Button6': 'pagedown',
    'P2ButtonUp': 'up',
    'JvsTwoP2ButtonUp': 'up',
    'P2ButtonDown': 'down',
    'JvsTwoP2ButtonDown': 'down',
    'P2ButtonLeft': 'left',
    'JvsTwoP2ButtonLeft': 'left',
    'P2ButtonRight': 'right',
    'JvsTwoP2ButtonRight': 'right',
    'Coin3': 'select',
    'JvsTwoCoin3': 'select',
    'P3ButtonStart': 'start',
    'JvsTwoP3ButtonStart': 'start',
    'P3Button1': 'a',
    'JvsTwoP3Button1': 'a',
    'P3Button2': 'b',
    'JvsTwoP3Button2': 'b',
    'P3Button3': 'x',
    'JvsTwoP3Button3': 'x',
    'P3Button4': 'y',
    'JvsTwoP3Button4': 'y',
    'P3Button5': 'pageup',
    'JvsTwoP3Button5': 'pageup',
    'P3Button6': 'pagedown',
    'JvsTwoP3Button6': 'pagedown',
    'P3ButtonUp': 'up',
    'JvsTwoP3ButtonUp': 'up',
    'P3ButtonDown': 'down',
    'JvsTwoP3ButtonDown': 'down',
    'P3ButtonLeft': 'left',
    'JvsTwoP3ButtonLeft': 'left',
    'P3ButtonRight': 'right',
    'JvsTwoP3ButtonRight': 'right',
    'Coin4': 'select',
    'JvsTwoCoin4': 'select',
    'P4ButtonStart': 'start',
    'JvsTwoP4ButtonStart': 'start',
    'P4Button1': 'a',
    'JvsTwoP4Button1': 'a',
    'P4Button2': 'b',
    'JvsTwoP4Button2': 'b',
    'P4Button3': 'x',
    'JvsTwoP4Button3': 'x',
    'P4Button4': 'y',
    'JvsTwoP4Button4': 'y',
    'P4Button5': 'pageup',
    'JvsTwoP4Button5': 'pageup',
    'P4Button6': 'pagedown',
    'JvsTwoP4Button6': 'pagedown',
    'P4ButtonUp': 'up',
    'JvsTwoP4ButtonUp': 'up',
    'P4ButtonDown': 'down',
    'JvsTwoP4ButtonDown': 'down',
    'P4ButtonLeft': 'left',
    'JvsTwoP4ButtonLeft': 'left',
    'P4ButtonRight': 'right',
    'JvsTwoP4ButtonRight': 'right',
    'Analog0': 'joystick1left',
    'JvsTwoAnalog0': 'joystick1left',
    'Analog1': 'joystick1up',
    'JvsTwoAnalog1': 'joystick1up',
    'Analog2': 'r2',
    'JvsTwoAnalog2': 'r2',
    'Analog4': 'l2',
    'JvsTwoAnalog4': 'l2',
  };

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
    const forceFs = Config.getSetting('forcefullscreen', true);
    xml = this.setFieldValue(xml, 'Windowed', forceFs ? '0' : '1');
    xml = this.setFieldValue(xml, 'Borderless Fullscreen', '1');

    // Configure Controllers before saving
    xml = this.configureControllers(xml);

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

    const minimize = Config.getSetting('tp_minimize', true);
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

  private configureControllers(xml: string): string {
    Logger.info(`TeknoParrotGenerator: Configuring controller mapping...`);
    const inputJson = Config.getInputConfig();
    const configs = inputJson.inputConfigs || [];

    // 1. Determine active controllers for Players 1-4
    const players: Array<{
      guid?: string;
      name?: string;
      index?: number;
      isXInput: boolean;
      config?: any;
    }> = [];

    for (let player = 1; player <= 4; player++) {
      const guid = this.args.rawArgs[`-p${player}guid`]?.toLowerCase();
      const name = this.args.rawArgs[`-p${player}name`]?.toLowerCase();
      const indexStr = this.args.rawArgs[`-p${player}index`];
      const deviceIndex = indexStr !== undefined ? parseInt(indexStr, 10) : (player - 1);

      if (!guid && !indexStr) {
        players.push({ isXInput: false });
        continue;
      }

      let matchedConfig = configs.find(c => c.deviceGUID?.toString().toLowerCase() === guid);
      if (!matchedConfig && name) {
        matchedConfig = configs.find(c => c.deviceName?.toLowerCase() === name);
      }

      // Determine if it is XInput
      const isX = this.checkIfXInput(guid, name);
      players.push({
        guid,
        name,
        index: deviceIndex,
        isXInput: isX,
        config: matchedConfig
      });
    }

    // 2. Determine general Input API to use (based on Player 1)
    const p1 = players[0];
    let inputApiToUse = 'DirectInput';
    
    // Check what options are allowed in the XML
    const inputApiFieldRegex = /<FieldInformation>(?:(?!<\/FieldInformation>)[\s\S])*?<FieldName>Input API<\/FieldName>([\s\S]*?)<\/FieldInformation>/i;
    const inputApiFieldMatch = xml.match(inputApiFieldRegex);
    let allowedApis = ['DirectInput'];
    if (inputApiFieldMatch) {
      const optionsMatch = inputApiFieldMatch[1].match(/<string>([^<]+)<\/string>/gi);
      if (optionsMatch) {
        allowedApis = optionsMatch.map(opt => opt.replace(/<\/?string>/gi, '').trim());
      }
    }

    if (p1 && p1.config) {
      if (p1.isXInput && allowedApis.includes('XInput')) {
        inputApiToUse = 'XInput';
      } else if (allowedApis.includes('DirectInput')) {
        inputApiToUse = 'DirectInput';
      } else {
        inputApiToUse = allowedApis[0] || 'DirectInput';
      }
    } else {
      const currentApiMatch = xml.match(/<FieldName>Input API<\/FieldName>(?:(?!<\/FieldInformation>)[\s\S])*?<FieldValue>([^<]+)<\/FieldValue>/i);
      inputApiToUse = currentApiMatch ? currentApiMatch[1].trim() : (allowedApis[0] || 'DirectInput');
    }

    xml = this.setFieldValue(xml, 'Input API', inputApiToUse);
    Logger.info(`TeknoParrotGenerator: Set Input API to "${inputApiToUse}"`);

    // 3. Process JoystickButtons
    const wrapperStart = xml.indexOf('<JoystickButtons>');
    const wrapperEnd = xml.lastIndexOf('</JoystickButtons>');
    if (wrapperStart === -1 || wrapperEnd === -1 || wrapperStart >= wrapperEnd) {
      Logger.warn(`TeknoParrotGenerator: No <JoystickButtons> wrapper found in profile`);
      return xml;
    }

    const beforeWrapper = xml.substring(0, wrapperStart + '<JoystickButtons>'.length);
    const innerContent = xml.substring(wrapperStart + '<JoystickButtons>'.length, wrapperEnd);
    const afterWrapper = xml.substring(wrapperEnd);

    // Split inner blocks by </JoystickButtons> child close tags
    const childBlocks = innerContent.split('</JoystickButtons>');
    const processedBlocks: string[] = [];
    const mappedKeys = new Set<string>();

    for (let i = 0; i < childBlocks.length; i++) {
      let block = childBlocks[i];
      if (!block.trim() || !block.includes('<JoystickButtons>')) {
        processedBlocks.push(block);
        continue;
      }

      // Parse ButtonName and InputMapping
      const buttonNameMatch = block.match(/<ButtonName>([^<]*?)<\/ButtonName>/i);
      const buttonName = buttonNameMatch ? buttonNameMatch[1].trim() : '';

      const inputMappingMatch = block.match(/<InputMapping>([^<]*?)<\/InputMapping>/i);
      const inputMapping = inputMappingMatch ? inputMappingMatch[1].trim() : '';

      if (!buttonName || !inputMapping) {
        processedBlocks.push(block);
        continue;
      }

      // Parse HideWithXInput / HideWithDirectInput
      const hideX = block.match(/<HideWithXInput>([^<]*?)<\/HideWithXInput>/i)?.[1]?.trim().toLowerCase() === 'true';
      const hideDi = block.match(/<HideWithDirectInput>([^<]*?)<\/HideWithDirectInput>/i)?.[1]?.trim().toLowerCase() === 'true';

      // Determine player index
      const playerIdx = this.getPlayerIndexForButton(buttonName, inputMapping);
      const pConfig = players[playerIdx - 1];

      // Remove existing XInputButton / DirectInputButton blocks
      block = block.replace(/<XInputButton>[\s\S]*?<\/XInputButton>/i, '');
      block = block.replace(/<DirectInputButton>[\s\S]*?<\/DirectInputButton>/i, '');

      let xInputButtonXml = '';
      let directInputButtonXml = '';
      let bindNameXi = '';
      let bindNameDi = '';
      let bindName = '';

      const mapKey = `${playerIdx}_${inputMapping}`;
      const shouldMap = pConfig && pConfig.config && !mappedKeys.has(mapKey) &&
                        !(inputApiToUse === 'XInput' && hideX) &&
                        !(inputApiToUse === 'DirectInput' && hideDi);

      if (shouldMap) {
        const keyName = this.mappingToKeyName[inputMapping] || this.deduceKeyName(inputMapping);
        if (keyName) {
          const matchedInput = pConfig.config.inputs.find((inp: any) => inp.name === keyName);
          if (matchedInput) {
            const pIndex = pConfig.index !== undefined ? pConfig.index : (playerIdx - 1);
            
            // Mark as mapped
            mappedKeys.add(mapKey);

            // 1. Generate XInputButton config
            if (inputApiToUse === 'XInput') {
              const xInputConfig = this.getXInputButtonConfig(keyName, matchedInput, pIndex);
              xInputButtonXml = this.generateXInputButtonXml(xInputConfig);
              bindNameXi = `Input Device ${pIndex} ${this.getXInputFriendlyName(keyName, matchedInput)}`;
              bindName = bindNameXi;
            } 
            // 2. Generate DirectInputButton config
            else {
              const dInputGuid = this.sdlGuidToDInputGuid(pConfig.config.deviceGUID?.toString() || '');
              const dInputConfig = this.getDirectInputButtonConfig(keyName, matchedInput, dInputGuid);
              directInputButtonXml = this.generateDirectInputButtonXml(dInputConfig);
              bindNameDi = `Gamepad ${this.getDirectInputFriendlyName(keyName, matchedInput)}`;
              bindName = bindNameDi;
            }
          }
        }
      }

      // Re-insert XInputButton and DirectInputButton after ButtonName
      block = block.replace(/<ButtonName>([\s\S]*?)<\/ButtonName>/i, (match) => {
        let replacement = match;
        if (xInputButtonXml) replacement += '\n      ' + xInputButtonXml;
        if (directInputButtonXml) replacement += '\n      ' + directInputButtonXml;
        return replacement;
      });

      // Update Bindings friendly names
      block = this.updateXmlTagInBlock(block, 'BindNameXi', bindNameXi);
      block = this.updateXmlTagInBlock(block, 'BindNameDi', bindNameDi);
      block = this.updateXmlTagInBlock(block, 'BindName', bindName);

      processedBlocks.push(block);
    }

    return beforeWrapper + processedBlocks.join('</JoystickButtons>') + afterWrapper;
  }

  private checkIfXInput(guid?: string, name?: string): boolean {
    if (!guid && !name) return false;
    const lowerGuid = (guid || '').toLowerCase();
    const lowerName = (name || '').toLowerCase();
    
    // Check for common Xbox identifiers
    if (lowerGuid.endsWith('7200') || lowerGuid.includes('xinput')) {
      return true;
    }
    if (lowerName.includes('xbox') || lowerName.includes('xinput') || lowerName.includes('360') || lowerName.includes('microsoft') || lowerName.includes('x-box')) {
      return true;
    }
    return false;
  }

  private getPlayerIndexForButton(buttonName: string, inputMapping: string): number {
    const lowerName = buttonName.toLowerCase();
    const lowerMapping = inputMapping.toLowerCase();
    
    if (lowerName.includes('p4') || lowerName.includes('player 4') || lowerName.includes('coin 4') || lowerName.includes('coin chute 4') || lowerName.includes('coin4') || lowerMapping.includes('p4') || lowerMapping.includes('player4')) {
      return 4;
    }
    if (lowerName.includes('p3') || lowerName.includes('player 3') || lowerName.includes('coin 3') || lowerName.includes('coin chute 3') || lowerName.includes('coin3') || lowerMapping.includes('p3') || lowerMapping.includes('player3')) {
      return 3;
    }
    if (lowerName.includes('p2') || lowerName.includes('player 2') || lowerName.includes('coin 2') || lowerName.includes('coin chute 2') || lowerName.includes('coin2') || lowerName.includes('service 2') || lowerMapping.includes('p2') || lowerMapping.includes('player2')) {
      return 2;
    }
    if (lowerName.includes('p1') || lowerName.includes('player 1') || lowerName.includes('coin 1') || lowerName.includes('coin chute 1') || lowerName.includes('coin1') || lowerMapping.includes('p1') || lowerMapping.includes('player1')) {
      return 1;
    }
    return 1;
  }

  private deduceKeyName(inputMapping: string): string {
    const lowerMapping = inputMapping.toLowerCase();
    if (lowerMapping.includes('button1') || lowerMapping.includes('button_1')) return 'a';
    if (lowerMapping.includes('button2') || lowerMapping.includes('button_2')) return 'b';
    if (lowerMapping.includes('button3') || lowerMapping.includes('button_3')) return 'x';
    if (lowerMapping.includes('button4') || lowerMapping.includes('button_4')) return 'y';
    if (lowerMapping.includes('button5') || lowerMapping.includes('button_5')) return 'pageup';
    if (lowerMapping.includes('button6') || lowerMapping.includes('button_6')) return 'pagedown';
    if (lowerMapping.includes('start')) return 'start';
    if (lowerMapping.includes('coin')) return 'select';
    if (lowerMapping.includes('up')) return 'up';
    if (lowerMapping.includes('down')) return 'down';
    if (lowerMapping.includes('left')) return 'left';
    if (lowerMapping.includes('right')) return 'right';
    return '';
  }

  private sdlGuidToDInputGuid(sdlGuid: string): string {
    if (!sdlGuid || sdlGuid.length !== 32) {
      return '00000000-0000-0000-0000-000000000000';
    }
    const vidLow = sdlGuid.substring(8, 10);
    const vidHigh = sdlGuid.substring(10, 12);
    const pidLow = sdlGuid.substring(16, 18);
    const pidHigh = sdlGuid.substring(18, 20);
    
    const pid = pidHigh + pidLow;
    const vid = vidHigh + vidLow;
    
    return `${pid}${vid}-0000-0000-0000-504944564944`.toLowerCase();
  }

  private getXInputButtonConfig(keyName: string, matchedInput: any, xInputIndex: number) {
    const config = {
      isLeftThumbX: false,
      isRightThumbX: false,
      isLeftThumbY: false,
      isRightThumbY: false,
      isAxisMinus: false,
      isLeftTrigger: false,
      isRightTrigger: false,
      buttonCode: 0,
      isButton: false,
      buttonIndex: 0,
      xInputIndex: xInputIndex
    };

    if (matchedInput.type === 'button' || matchedInput.type === 'hat') {
      config.isButton = true;
      let flag = 0;
      switch (keyName) {
        case 'a': flag = 4096; break;
        case 'b': flag = 8192; break;
        case 'x': flag = 16384; break;
        case 'y': flag = 32768; break; // as short this is -32768
        case 'pageup': flag = 256; break;   // LB
        case 'pagedown': flag = 512; break; // RB
        case 'start': flag = 16; break;
        case 'select': flag = 32; break;
        case 'up': flag = 1; break;
        case 'down': flag = 2; break;
        case 'left': flag = 4; break;
        case 'right': flag = 8; break;
        case 'l3': flag = 64; break;
        case 'r3': flag = 128; break;
      }
      config.buttonCode = flag === 32768 ? -32768 : flag;
    } else if (matchedInput.type === 'axis') {
      config.isButton = false;
      if (keyName === 'joystick1left' || keyName === 'left') {
        config.isLeftThumbX = true;
        config.isAxisMinus = true;
      } else if (keyName === 'joystick1right' || keyName === 'right') {
        config.isLeftThumbX = true;
        config.isAxisMinus = false;
      } else if (keyName === 'joystick1up' || keyName === 'up') {
        config.isLeftThumbY = true;
        config.isAxisMinus = false;
      } else if (keyName === 'joystick1down' || keyName === 'down') {
        config.isLeftThumbY = true;
        config.isAxisMinus = true;
      } else if (keyName === 'joystick2left') {
        config.isRightThumbX = true;
        config.isAxisMinus = true;
      } else if (keyName === 'joystick2right') {
        config.isRightThumbX = true;
        config.isAxisMinus = false;
      } else if (keyName === 'joystick2up') {
        config.isRightThumbY = true;
        config.isAxisMinus = false;
      } else if (keyName === 'joystick2down') {
        config.isRightThumbY = true;
        config.isAxisMinus = true;
      } else if (keyName === 'l2') {
        config.isLeftTrigger = true;
      } else if (keyName === 'r2') {
        config.isRightTrigger = true;
      }
    }

    return config;
  }

  private generateXInputButtonXml(opt: any): string {
    return `<XInputButton>
        <IsLeftThumbX>${opt.isLeftThumbX}</IsLeftThumbX>
        <IsRightThumbX>${opt.isRightThumbX}</IsRightThumbX>
        <IsLeftThumbY>${opt.isLeftThumbY}</IsLeftThumbY>
        <IsRightThumbY>${opt.isRightThumbY}</IsRightThumbY>
        <IsAxisMinus>${opt.isAxisMinus}</IsAxisMinus>
        <IsLeftTrigger>${opt.isLeftTrigger}</IsLeftTrigger>
        <IsRightTrigger>${opt.isRightTrigger}</IsRightTrigger>
        <ButtonCode>${opt.buttonCode}</ButtonCode>
        <IsButton>${opt.isButton}</IsButton>
        <ButtonIndex>${opt.buttonIndex}</ButtonIndex>
        <XInputIndex>${opt.xInputIndex}</XInputIndex>
      </XInputButton>`;
  }

  private getDirectInputButtonConfig(keyName: string, matchedInput: any, joystickGuid: string) {
    const config = {
      button: 0,
      isAxis: false,
      isAxisMinus: false,
      isFullAxis: false,
      povDirection: 0,
      isReverseAxis: false,
      joystickGuid: joystickGuid
    };

    if (matchedInput.type === 'button') {
      config.button = matchedInput.id + 48;
    } else if (matchedInput.type === 'hat') {
      config.button = 32;
      if (matchedInput.value === 1 || keyName === 'up') config.povDirection = 0;
      else if (matchedInput.value === 4 || keyName === 'down') config.povDirection = 18000;
      else if (matchedInput.value === 8 || keyName === 'left') config.povDirection = 27000;
      else if (matchedInput.value === 2 || keyName === 'right') config.povDirection = 9000;
    } else if (matchedInput.type === 'axis') {
      config.button = matchedInput.id * 4;
      config.isAxis = true;
      if (['joystick1left', 'joystick1up', 'joystick2left', 'joystick2up', 'left', 'up'].includes(keyName)) {
        config.isAxisMinus = true;
      }
    }

    return config;
  }

  private generateDirectInputButtonXml(opt: any): string {
    return `<DirectInputButton>
        <Button>${opt.button}</Button>
        <IsAxis>${opt.isAxis}</IsAxis>
        <IsAxisMinus>${opt.isAxisMinus}</IsAxisMinus>
        <IsFullAxis>${opt.isFullAxis}</IsFullAxis>
        <PovDirection>${opt.povDirection}</PovDirection>
        <IsReverseAxis>${opt.isReverseAxis}</IsReverseAxis>
        <JoystickGuid>${opt.joystickGuid}</JoystickGuid>
      </DirectInputButton>`;
  }

  private getXInputFriendlyName(keyName: string, matchedInput: any): string {
    return keyName.toUpperCase();
  }

  private getDirectInputFriendlyName(keyName: string, matchedInput: any): string {
    if (matchedInput.type === 'button') {
      return `Buttons${matchedInput.id}`;
    } else if (matchedInput.type === 'hat') {
      return `PointOfViewControllers0 ${keyName.toUpperCase()}`;
    } else if (matchedInput.type === 'axis') {
      return `Axis${matchedInput.id}`;
    }
    return 'UNKNOWN';
  }

  private updateXmlTagInBlock(block: string, tag: string, value: string): string {
    const regex = new RegExp(`<${tag}(?:\\s*\\/|>[^<]*?<\\/${tag}>)`, 'i');
    if (regex.test(block)) {
      return block.replace(regex, `<${tag}>${value}</${tag}>`);
    }
    return block.trim() + `\n      <${tag}>${value}</${tag}>`;
  }
}

