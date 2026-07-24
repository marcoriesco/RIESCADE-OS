import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { createHash } from 'crypto';
import { BaseGenerator } from './BaseGenerator.js';
import { getEmulatorsPath, getConfigsPath, getRiescadePath } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';
import { Config } from '../config.js';
import { ControllerInfo } from '../types.js';

interface TeknoControlsDb {
  aliases: Record<string, string>;
  profiles: Record<string, {
    category: 'racing' | 'fighter' | 'lightgun' | 'other';
    inputMode?: 'lightgun' | 'mouse' | 'touchscreen' | 'gamepad';
    deviceFields?: {
      p1?: string;
      p2?: string;
      mouse?: string;
      touch?: string;
    };
    buttons: Record<string, string>;
  }>;
}

/**
 * TeknoParrotGenerator — sole owner of UserProfile.xml configuration.
 *
 * Pipeline:
 *   configure()
 *     ├─ loadControlsDb()        → Load teknoparrot-controls.json & normalize aliases
 *     ├─ buildGameProfilesIndex()→ Build O(1) case-insensitive map of GameProfiles/
 *     ├─ resolveProfileName()    → Resolve alias & real XML filename
 *     ├─ checkHashChanged()      → Check hash cache
 *     ├─ buildUserProfile()      → Create/load UserProfile XML from GameProfile template
 *     ├─ configureGamePath()     → Resolve and set game executable path
 *     ├─ configureConfigValues() → Decoupled setup for Input API (XInput) and DisplayMode
 *     ├─ configureControllers()  → XInput button mappings from controls DB & heuristics
 *     ├─ configureParrotData()   → ParrotData.xml global settings
 *     └─ save()                  → Save UserProfile.xml & update hash cache
 */
export class TeknoParrotGenerator extends BaseGenerator {
  private profileName: string = '';
  private userProfilePath: string = '';
  private xml: string = '';
  private tpDir: string = '';
  private controlsDb: TeknoControlsDb = { aliases: {}, profiles: {} };
  private normalizedAliases: Map<string, string> = new Map();
  private gameProfilesIndex: Map<string, string> = new Map(); // normalizedName -> realFilename
  private controllers: ControllerInfo[] = [];
  private hashChanged: boolean = true;
  private pointingDevicePaths: string[] = ['', ''];
  private keyboardDevicePath: string = '';
  private keyboardDeviceLabel: string = 'Keyboard';

  /**
   * Helper: Normalizes a string (lowercase, alphanumeric only) for robust matching.
   * e.g. "Mario Kart Arcade GP DX" -> "mariokartarcadegpdx", "BBCP.teknoparrot" -> "bbcp"
   */
  private static normalizeName(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Entry Point
  // ────────────────────────────────────────────────────────────────────────

  public async configure(): Promise<void> {
    Logger.info(`[TP] TeknoParrotGenerator: Configuring TeknoParrot launch pipeline`);

    this.tpDir = join(getEmulatorsPath(), 'teknoparrot');
    this.controllers = this.args.controllers || [];
    Logger.info(`[TP] Controllers received: ${this.controllers.length}`);
    this.controllers.forEach((c, idx) => {
      Logger.info(`[TP] Controller ${idx + 1}: ${c.name} (Type: ${c.type}, GUID: ${c.guid})`);
    });

    // 1. Configure global ParrotData.xml settings
    this.configureParrotData();

    // 2. If no ROM provided (e.g. live -configure-only mode triggered from Settings UI), stop after global config
    if (!this.rom) {
      Logger.info(`[TP] No ROM provided (-configure-only mode). Global ParrotData configuration complete.`);
      return;
    }

    // 3. Load database & index GameProfiles
    this.loadControlsDb();
    this.buildGameProfilesIndex();

    // 4. Resolve profile name
    this.resolveProfileName();

    // 5. Check hash cache
    this.hashChanged = this.checkHashChanged();

    // 6. Execute game profile configuration pipeline
    this.buildUserProfile();
    this.configureGamePath();

    const category = this.getProfileCategory();

    this.configureConfigValues(category);
    this.configureControllers(category);
    this.save();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 1: Database & GameProfiles Indexing
  // ────────────────────────────────────────────────────────────────────────

  private loadControlsDb(): void {
    const candidatePaths = [
      join(getRiescadePath(), 'launcher', 'configs', 'teknoparrot-controls.json'),
      join(dirname(process.execPath), 'configs', 'teknoparrot-controls.json'),
      join(getConfigsPath(), 'emulator-controllers', 'teknoparrot-controls.json'),
    ];

    const dbPath = candidatePaths.find(p => existsSync(p));

    if (dbPath && existsSync(dbPath)) {
      try {
        this.controlsDb = JSON.parse(readFileSync(dbPath, 'utf-8'));
        this.normalizedAliases.clear();
        for (const [alias, target] of Object.entries(this.controlsDb.aliases || {})) {
          this.normalizedAliases.set(TeknoParrotGenerator.normalizeName(alias), target);
        }
        Logger.info(`[TP] Loaded controls DB from "${dbPath}" (${Object.keys(this.controlsDb.profiles || {}).length} profiles, ${this.normalizedAliases.size} aliases)`);
      } catch (e) {
        Logger.error(`[TP] Failed to parse teknoparrot-controls.json:`, e);
      }
    } else {
      Logger.warn(`[TP] teknoparrot-controls.json not found in candidate paths`);
    }
  }

  private buildGameProfilesIndex(): void {
    const gameProfilesDir = join(this.tpDir, 'GameProfiles');
    this.gameProfilesIndex.clear();

    if (existsSync(gameProfilesDir)) {
      try {
        const files = readdirSync(gameProfilesDir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.xml')) {
            const rawBase = basename(file, '.xml');
            const norm = TeknoParrotGenerator.normalizeName(rawBase);
            this.gameProfilesIndex.set(norm, file);
          }
        }
        Logger.info(`[TP] Indexed ${this.gameProfilesIndex.size} GameProfiles in "${gameProfilesDir}"`);
      } catch (e) {
        Logger.error(`[TP] Error indexing GameProfiles directory:`, e);
      }
    } else {
      Logger.warn(`[TP] GameProfiles directory not found at "${gameProfilesDir}"`);
    }
  }

  private resolveProfileName(): void {
    const romBase = basename(this.rom).replace(/\.teknoparrot$/i, '');
    const normRom = TeknoParrotGenerator.normalizeName(romBase);

    // 1. Check alias lookup
    let targetName = romBase;
    const aliasMatch = this.normalizedAliases.get(normRom);
    if (aliasMatch) {
      targetName = aliasMatch;
      Logger.info(`[TP] Alias matched: "${romBase}" -> "${targetName}"`);
    }

    // 2. Look up case-insensitive real XML filename in GameProfiles index
    const normTarget = TeknoParrotGenerator.normalizeName(targetName);
    const realXmlFile = this.gameProfilesIndex.get(normTarget) || `${targetName}.xml`;
    this.profileName = basename(realXmlFile, '.xml');

    Logger.info(`[TP] Profile resolved: "${this.profileName}" (from ROM "${romBase}")`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 2: Build User Profile XML
  // ────────────────────────────────────────────────────────────────────────

  private buildUserProfile(): void {
    const gameProfilePath = join(this.tpDir, 'GameProfiles', `${this.profileName}.xml`);
    const userProfilesDir = join(this.tpDir, 'UserProfiles');
    this.userProfilePath = join(userProfilesDir, `${this.profileName}.xml`);

    if (!existsSync(gameProfilePath)) {
      throw new Error(`[TP] GameProfile template not found at "${gameProfilePath}"`);
    }

    if (!existsSync(userProfilesDir)) {
      mkdirSync(userProfilesDir, { recursive: true });
    }

    if (!existsSync(this.userProfilePath)) {
      Logger.info(`[TP] Creating UserProfile by copying from template: "${gameProfilePath}"`);
      copyFileSync(gameProfilePath, this.userProfilePath);
    }

    this.xml = readFileSync(this.userProfilePath, 'utf8');
    this.ensureProfileName();
    Logger.info(`[TP] Loaded UserProfile XML (${this.xml.length} bytes) at "${this.userProfilePath}"`);
  }

  private ensureProfileName(): void {
    if (this.xml.includes('<ProfileName>')) {
      this.xml = this.xml.replace(/<ProfileName>.*?<\/ProfileName>/i, `<ProfileName>${this.profileName}</ProfileName>`);
    } else {
      this.xml = this.xml.replace(
        /(<GameProfile[^>]*>)/i,
        `$1\n  <ProfileName>${this.profileName}</ProfileName>`
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 3: Configure Game Path
  // ────────────────────────────────────────────────────────────────────────

  private configureGamePath(): void {
    const execNameMatch = this.xml.match(/<ExecutableName>([^]*?)<\/ExecutableName>/i);
    const execName = execNameMatch ? execNameMatch[1].trim() : '';

    const romName = basename(this.rom);
    let gamePath = '';

    // Re-resolve existing GamePath locally if present
    const existingPathMatch = this.xml.match(/<GamePath>([^]*?)<\/GamePath>/i);
    const existingPath = existingPathMatch ? existingPathMatch[1].trim() : '';
    if (existingPath) {
      const idx = existingPath.indexOf(romName);
      if (idx !== -1) {
        const relPath = existingPath.substring(idx + romName.length).replace(/^[\\/]+/, '');
        const localPath = join(this.rom, relPath);
        if (existsSync(localPath)) {
          gamePath = localPath;
          Logger.info(`[TP] Re-resolved existing GamePath locally: "${gamePath}"`);
        }
      }
    }

    // Recursive search for executable
    if (!gamePath && execName) {
      gamePath = this.findFileRecursive(this.rom, execName) || '';
      if (gamePath) {
        Logger.info(`[TP] Found game executable recursively: "${gamePath}"`);
      }
    }

    // Fallback to direct path
    if (!gamePath && execName) {
      const fallbackPath = join(this.rom, execName);
      if (existsSync(fallbackPath)) {
        gamePath = fallbackPath;
        Logger.info(`[TP] Found game executable at fallback path: "${gamePath}"`);
      }
    }

    if (!gamePath && existsSync(this.rom)) {
      try {
        const stat = statSync(this.rom);
        if (stat.isFile() && this.rom.toLowerCase().endsWith('.exe')) {
          gamePath = this.rom;
        } else if (stat.isDirectory()) {
          const commonExes = ['game.exe', 'Game.exe', 'sgame.exe', 'Budgiedev.exe', 'main.exe', 'app.exe', 'Game_Nesica.exe'];
          for (const exeName of commonExes) {
            const exePath = join(this.rom, exeName);
            if (existsSync(exePath)) {
              gamePath = exePath;
              break;
            }
          }
          if (!gamePath) {
            const files = readdirSync(this.rom);
            const foundExe = files.find(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('config') && !f.toLowerCase().includes('loader'));
            if (foundExe) gamePath = join(this.rom, foundExe);
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (!gamePath) {
      Logger.warn(`[TP] Could not find game executable "${execName}" in ROM folder "${this.rom}". Using ROM path as fallback.`);
      gamePath = this.rom;
    }

    this.xml = this.xml.replace(/<GamePath(?:\s*\/|>[^]*?<\/GamePath>)/i, `<GamePath>${gamePath}</GamePath>`);
    Logger.info(`[TP] GamePath set to: "${gamePath}"`);

    // Handle GamePath2 if present in profile
    const execName2Match = this.xml.match(/<ExecutableName2>([^]*?)<\/ExecutableName2>/i);
    const execName2 = execName2Match ? execName2Match[1].trim() : '';
    if (execName2) {
      let gamePath2 = this.findFileRecursive(this.rom, execName2) || '';
      if (gamePath2) {
        this.xml = this.xml.replace(/<GamePath2(?:\s*\/|>[^]*?<\/GamePath2>)/i, `<GamePath2>${gamePath2}</GamePath2>`);
        Logger.info(`[TP] GamePath2 set to: "${gamePath2}"`);
      }
    }
  }

  private getProfileCategory(): 'racing' | 'fighter' | 'lightgun' | 'other' {
    const buttonNames = this.extractButtonNames(this.xml);
    const normProfileName = TeknoParrotGenerator.normalizeName(this.profileName);

    let explicitProfile: TeknoControlsDb['profiles'][string] | null = null;
    for (const [key, value] of Object.entries(this.controlsDb.profiles || {})) {
      if (TeknoParrotGenerator.normalizeName(key) === normProfileName) {
        explicitProfile = value;
        break;
      }
    }

    return explicitProfile?.category || this.classifyByScore(buttonNames);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 4: Configure ConfigValues (Input API & DisplayMode)
  // Decoupled from controller button mapping!
  // ────────────────────────────────────────────────────────────────────────

  private configureConfigValues(category: 'racing' | 'fighter' | 'lightgun' | 'other'): void {
    // 1. Input API selection: User setting override or category-based default (Lightgun -> RawInput, Racing/Fighter -> XInput)
    const userApiSetting = Config.getEmulatorSetting('teknoparrot', 'input_api', null)
                         ?? Config.getEmulatorSetting('teknoparrot', 'inputapi', null);

    let targetInputApi = 'XInput';
    if (userApiSetting) {
      targetInputApi = String(userApiSetting);
    } else if (category === 'lightgun') {
      targetInputApi = 'RawInput';
    }

    if (this.xml.includes('<FieldName>Input API</FieldName>')) {
      this.xml = this.setFieldValue(this.xml, 'Input API', targetInputApi);
      Logger.info(`[TP] Input API set to "${targetInputApi}" in ConfigValues (Category: ${category})`);
    }

    // 2. Configure DisplayMode (Fullscreen / Windowed)
    const forceFsSetting = Config.getEmulatorSetting('teknoparrot', 'fullscreen', null);
    const forceFs = forceFsSetting !== null
      ? (forceFsSetting === 'true' || forceFsSetting === true)
      : Config.getSetting('fullscreen', true);

    if (this.xml.includes('<FieldName>DisplayMode</FieldName>')) {
      const modeStr = forceFs ? 'Fullscreen' : 'Windowed';
      this.xml = this.setFieldValue(this.xml, 'DisplayMode', modeStr);
      Logger.info(`[TP] DisplayMode set to ${modeStr} in ConfigValues`);
    } else {
      this.xml = this.setFieldValue(this.xml, 'Windowed', forceFs ? '0' : '1');
      this.xml = this.setFieldValue(this.xml, 'Borderless Fullscreen', '1');
      Logger.info(`[TP] Display options set (Windowed=${forceFs ? '0' : '1'}, Borderless Fullscreen=1)`);
    }

    // 3. Configure Mouse / Lightgun / Touch Pointing Devices
    this.configurePointingAndLightgunDevices(category);
  }

  private configurePointingAndLightgunDevices(category: 'racing' | 'fighter' | 'lightgun' | 'other'): void {
    const normProfileName = TeknoParrotGenerator.normalizeName(this.profileName);

    let explicitProfile: TeknoControlsDb['profiles'][string] | null = null;
    for (const [key, value] of Object.entries(this.controlsDb.profiles || {})) {
      if (TeknoParrotGenerator.normalizeName(key) === normProfileName) {
        explicitProfile = value;
        break;
      }
    }

    const inputMode = explicitProfile?.inputMode || (category === 'lightgun' ? 'lightgun' : 'gamepad');

    // Read user settings or defaults
    const userMouseSetting = String(Config.getSetting('RIESCADE.TPMouseDevice', 'auto'));
    const userLightgun1Setting = String(Config.getSetting('RIESCADE.TPLightgun1Device', 'auto'));
    const userLightgun2Setting = String(Config.getSetting('RIESCADE.TPLightgun2Device', 'auto'));

    Logger.info(`[TP_DEVICE] Game: "${this.profileName}" | Category: ${category} | InputMode: ${inputMode}`);
    Logger.info(`[TP_DEVICE] User Settings -> Mouse: "${userMouseSetting}", Lightgun1: "${userLightgun1Setting}", Lightgun2: "${userLightgun2Setting}"`);

    const resolveDevice = (userSetting: string): { label: string; path: string } => {
      if (userSetting && userSetting !== 'auto') {
        if (userSetting === 'windows_mouse_cursor') {
          return { label: 'Windows Mouse Cursor', path: '' };
        }
        if (userSetting.startsWith('rawinput:')) {
          try {
            const path = decodeURIComponent(userSetting.substring('rawinput:'.length));
            return { label: this.rawInputDeviceLabel(path), path };
          } catch {
            Logger.warn(`[TP_DEVICE] Invalid encoded Raw Input device setting: "${userSetting}"`);
          }
        }
        return { label: userSetting, path: '' };
      }
      return { label: 'Windows Mouse Cursor', path: '' };
    };

    // A lightgun game may be played with an ordinary mouse. If no dedicated P1
    // gun was chosen, reuse the configured primary mouse.
    const p1Setting = inputMode === 'mouse'
      ? userMouseSetting
      : (userLightgun1Setting !== 'auto' ? userLightgun1Setting : userMouseSetting);
    const resolvedP1 = resolveDevice(p1Setting);
    const hasExplicitP2 = userLightgun2Setting !== 'auto' && userLightgun2Setting !== 'windows_mouse_cursor';
    const resolvedP2 = hasExplicitP2
      ? resolveDevice(userLightgun2Setting)
      : { label: 'Not configured', path: '' };
    this.pointingDevicePaths = [resolvedP1.path, resolvedP2.path];
    this.resolveKeyboardDevice();

    Logger.info(`[TP_DEVICE] Resolved Devices -> P1/Mouse: "${resolvedP1.label}" (${resolvedP1.path || 'system cursor'}), P2: "${resolvedP2.label}" (${resolvedP2.path || 'system cursor'})`);
    Logger.info(`[TP_DEVICE] Keyboard -> "${this.keyboardDeviceLabel}" (${this.keyboardDevicePath || 'not found'})`);

    const deviceFields = explicitProfile?.deviceFields || {};

    const possibleP1Fields = deviceFields.p1
      ? [deviceFields.p1]
      : ['P1 Light Gun', 'Player 1 Light Gun', 'P1 LightGun', 'P1 Light Gun Device', 'Lightgun Device', 'P1 Mouse', 'P1 Mouse Device', 'Mouse Device', 'Cursor Device', 'Touch Device'];

    const possibleP2Fields = deviceFields.p2
      ? [deviceFields.p2]
      : ['P2 Light Gun', 'Player 2 Light Gun', 'P2 LightGun', 'P2 Light Gun Device', 'P2 Mouse', 'P2 Mouse Device'];

    // Update <JoystickButtons> nodes for Lightgun pointing devices
    this.xml = this.updateJoystickLightgunNode(this.xml, possibleP1Fields, resolvedP1);
    if ((category === 'lightgun' || deviceFields.p2) && resolvedP2.path) {
      this.xml = this.updateJoystickLightgunNode(this.xml, possibleP2Fields, resolvedP2);
    } else if (category === 'lightgun' || deviceFields.p2) {
      this.xml = this.clearJoystickLightgunNodes(this.xml, possibleP2Fields);
      Logger.info(`[TP_DEVICE] P2 has no physical Raw Input device; leaving P2 lightgun unbound.`);
    }
  }

  private resolveKeyboardDevice(): void {
    const configured = String(Config.getSetting('RIESCADE.TPKeyboardDevice', 'auto'));

    if (configured.startsWith('rawinput:')) {
      try {
        this.keyboardDevicePath = decodeURIComponent(configured.substring('rawinput:'.length));
        this.keyboardDeviceLabel = this.rawInputDeviceLabel(this.keyboardDevicePath);
        return;
      } catch {
        Logger.warn(`[TP_DEVICE] Invalid encoded keyboard device setting.`);
      }
    }

    // Prefer the inventory refreshed automatically by the frontend.
    const inventoryPath = join(getConfigsPath(), 'input-devices.json');
    if (existsSync(inventoryPath)) {
      try {
        const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
        const keyboards = (inventory.devices || [])
          .filter((device: any) =>
            device.type === 'keyboard' && typeof device.devicePath === 'string' && device.devicePath
          )
          .sort((a: any, b: any) =>
            this.scoreKeyboardDevice(b.devicePath) - this.scoreKeyboardDevice(a.devicePath)
          );
        const keyboard = keyboards[0];
        if (keyboard) {
          this.keyboardDevicePath = keyboard.devicePath;
          this.keyboardDeviceLabel = this.keyboardDisplayLabel(keyboard.name, keyboard.devicePath);
          Logger.info(`[TP_DEVICE] Auto-selected keyboard with score ${this.scoreKeyboardDevice(keyboard.devicePath)}.`);
          return;
        }
      } catch (e) {
        Logger.warn(`[TP_DEVICE] Could not read Raw Input inventory: ${e}`);
      }
    }

    // Migration fallback: retain a keyboard path manually configured in an
    // existing TeknoParrot profile, as in older RIESCADE installations.
    const keyboardBlock = this.xml.match(
      /<RawInputButton>\s*<DevicePath>([^<]+)<\/DevicePath>\s*<DeviceType>Keyboard<\/DeviceType>[\s\S]*?<\/RawInputButton>/i
    );
    if (keyboardBlock?.[1]) {
      this.keyboardDevicePath = keyboardBlock[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      this.keyboardDeviceLabel = this.rawInputDeviceLabel(this.keyboardDevicePath);
      Logger.info(`[TP_DEVICE] Reused keyboard path from existing UserProfile.`);
    }
  }

  private extractVidPid(path: string): string {
    return path.match(/VID_[0-9A-F]{4}&PID_[0-9A-F]{4}/i)?.[0]?.toUpperCase() || '';
  }

  private scoreKeyboardDevice(path: string): number {
    const upper = path.toUpperCase();
    const keyboardVidPid = this.extractVidPid(path);
    const pointingVidPids = this.pointingDevicePaths
      .map(devicePath => this.extractVidPid(devicePath))
      .filter(Boolean);

    let score = 0;
    // Composite lightguns commonly expose a keyboard collection for their
    // buttons. It is not the user's typing keyboard and must not win Auto.
    if (keyboardVidPid && pointingVidPids.includes(keyboardVidPid)) score -= 1000;
    if (upper.includes('&MI_00')) score += 200;
    if (!upper.includes('&COL')) score += 100;
    if (upper.includes('&MI_01')) score += 20;
    return score;
  }

  private keyboardDisplayLabel(name: string, path: string): string {
    const generic = !name || /dispositivo de teclado hid|hid keyboard device/i.test(name);
    if (!generic) return name;
    const vidPid = this.extractVidPid(path).replace('&', ' ');
    const interfaceId = path.match(/&MI_[0-9A-F]{2}/i)?.[0]?.substring(1).toUpperCase() || '';
    return ['Keyboard', vidPid, interfaceId].filter(Boolean).join(' ');
  }

  private clearJoystickLightgunNodes(fullXml: string, possibleNames: string[]): string {
    let updated = fullXml;
    for (const btnName of possibleNames) {
      const escapedName = btnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nodeRegex = new RegExp(
        `(<JoystickButtons>(?:(?!</JoystickButtons>)[^])*?<ButtonName>\\s*${escapedName}\\s*</ButtonName>(?:(?!</JoystickButtons>)[^])*?</JoystickButtons>)`,
        'gi'
      );
      updated = updated.replace(nodeRegex, block => this.stripRawInputBinding(block));
    }
    return updated;
  }

  private updateJoystickLightgunNode(fullXml: string, possibleNames: string[], resolvedDevice: { label: string; path: string }): string {
    let updated = fullXml;
    let found = false;

    for (const btnName of possibleNames) {
      const escapedName = btnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nodeRegex = new RegExp(
        `(<JoystickButtons>(?:(?!</JoystickButtons>)[^])*?<ButtonName>\\s*${escapedName}\\s*</ButtonName>(?:(?!</JoystickButtons>)[^])*?</JoystickButtons>)`,
        'gi'
      );

      if (nodeRegex.test(updated)) {
        found = true;
        updated = updated.replace(nodeRegex, (block) => {
          let newBlock = block;
          newBlock = this.stripRawInputBinding(newBlock);
          const binding = this.renderMouseRawInputButton(resolvedDevice.path, 'None', resolvedDevice.label);
          newBlock = newBlock.replace(/<\/JoystickButtons>\s*$/i, binding + '\n\t\t</JoystickButtons>');
          return newBlock;
        });
        Logger.info(`[TP_DEVICE] Injected pointing device "${resolvedDevice.label}" into <JoystickButtons> <ButtonName>${btnName}</ButtonName>`);
      }
    }

    // If no existing button node was found for P1 lightgun, append it to <JoystickButtons>
    if (!found && possibleNames.includes('P1 Light Gun') && updated.includes('</JoystickButtons>')) {
      const binding = this.renderMouseRawInputButton(resolvedDevice.path, 'None', resolvedDevice.label);
      const newNode = `\t\t<JoystickButtons>\n\t\t\t<ButtonName>P1 Light Gun</ButtonName>\n\t\t\t<InputMapping>P1LightGun</InputMapping>\n${binding}\n\t\t\t<HideWithDirectInput>true</HideWithDirectInput>\n\t\t\t<HideWithXInput>true</HideWithXInput>\n\t\t</JoystickButtons>\n`;

      const lastIndex = updated.lastIndexOf('</JoystickButtons>');
      if (lastIndex !== -1) {
        updated = updated.slice(0, lastIndex + 18) + '\n' + newNode + updated.slice(lastIndex + 18);
        Logger.info(`[TP_DEVICE] Appended new P1 Light Gun node with "${resolvedDevice.label}" into <JoystickButtons>`);
      }
    }

    return updated;
  }

  private rawInputDeviceLabel(path: string): string {
    const parts = path.replace(/^\\\\\?\\/, '').split('#');
    return parts.slice(0, 2).join(' ') || 'Raw Input Mouse';
  }

  private xmlEscape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private stripRawInputBinding(node: string): string {
    return node
      .replace(/<RawInputButton>[\s\S]*?<\/RawInputButton>\s*/gi, '')
      .replace(/<RawInputName>[\s\S]*?<\/RawInputName>\s*/gi, '')
      .replace(/<BindNameRi>[\s\S]*?<\/BindNameRi>\s*/gi, '')
      .replace(/<BindName>[\s\S]*?<\/BindName>\s*/gi, '');
  }

  private renderMouseRawInputButton(path: string, button: string, label: string): string {
    const safePath = this.xmlEscape(path);
    const safeLabel = this.xmlEscape(label);
    return `\t\t\t<RawInputButton>\n\t\t\t\t<DevicePath>${safePath}</DevicePath>\n\t\t\t\t<DeviceType>Mouse</DeviceType>\n\t\t\t\t<MouseButton>${button}</MouseButton>\n\t\t\t\t<KeyboardKey>None</KeyboardKey>\n\t\t\t</RawInputButton>\n\t\t\t<BindNameRi>${safeLabel}${button !== 'None' ? ` ${button}` : ''}</BindNameRi>\n\t\t\t<BindName>${safeLabel}${button !== 'None' ? ` ${button}` : ''}</BindName>`;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 5: Configure Controllers (JoystickButtons)
  // ────────────────────────────────────────────────────────────────────────

  private configureControllers(category: 'racing' | 'fighter' | 'lightgun' | 'other'): void {
    if (!this.hashChanged) {
      if (this.xml.includes('<XInputButton>') || category === 'lightgun') {
        Logger.info(`[TP] Controller config for "${this.profileName}" is up to date (hash match). Skipping button update.`);
        return;
      }
    }

    const autoSetting = Config.getEmulatorSetting('teknoparrot', 'tp_autocontrollers', null)
                     ?? Config.getEmulatorSetting('teknoparrot', 'autocontrollers', null);
    const disableAuto = Config.getEmulatorSetting('teknoparrot', 'disableautocontrollers', null);
    if (
      (autoSetting !== null && (autoSetting === 'false' || autoSetting === '0' || autoSetting === false)) ||
      (disableAuto !== null && (disableAuto === 'true' || disableAuto === '1' || disableAuto === true))
    ) {
      Logger.info(`[TP] Auto controller configuration disabled via user setting.`);
      return;
    }

    if (category !== 'lightgun' && this.controllers.length === 0) {
      Logger.warn(`[TP] No gamepads connected and profile is not lightgun. Skipped button mapping.`);
      return;
    }

    // Determine custom mappings
    const normProfileName = TeknoParrotGenerator.normalizeName(this.profileName);

    let explicitProfile: TeknoControlsDb['profiles'][string] | null = null;
    for (const [key, value] of Object.entries(this.controlsDb.profiles || {})) {
      if (TeknoParrotGenerator.normalizeName(key) === normProfileName) {
        explicitProfile = value;
        break;
      }
    }

    const customMappings = explicitProfile?.buttons || {};

    Logger.info(`[TP] Mapping controls for "${this.profileName}" (Category: ${category}, ${this.controllers.length} controller(s))`);

    // Update JoystickButtons XML blocks
    const { xml: updatedXml, count: mappedCount } = this.updateJoystickButtonsXml(this.xml, category, customMappings);
    this.xml = updatedXml;

    Logger.info(`[TP] Buttons mapped: ${mappedCount} for "${this.profileName}"`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 6: Configure ParrotData.xml
  // ────────────────────────────────────────────────────────────────────────

  private configureParrotData(): void {
    const parrotDataPath = join(this.tpDir, 'ParrotData.xml');
    if (!existsSync(parrotDataPath)) return;

    try {
      let parrotXml = readFileSync(parrotDataPath, 'utf8');
      parrotXml = this.setXmlElementValue(parrotXml, 'SilentMode', 'true');
      parrotXml = this.setXmlElementValue(parrotXml, 'ConfirmExit', 'false');
      parrotXml = this.setXmlElementValue(parrotXml, 'HideVanguardWarning', 'true');
      parrotXml = this.setXmlElementValue(parrotXml, 'DisableAnalytics', 'true');
      parrotXml = this.setXmlElementValue(parrotXml, 'FirstTimeSetupComplete', 'true');
      parrotXml = this.setXmlElementValue(parrotXml, 'HideDolphinGUI', 'true');

      // Ensure DatXmlLocation points to a valid local .dat file
      const match = parrotXml.match(/<DatXmlLocation>(.*?)<\/DatXmlLocation>/i);
      const currentLoc = match ? match[1].trim() : '';
      if (!currentLoc || !existsSync(currentLoc)) {
        const files = readdirSync(this.tpDir);
        const datFile = files.find(f => f.toLowerCase().endsWith('.dat'));
        if (datFile) {
          const newPath = join(this.tpDir, datFile);
          parrotXml = this.setXmlElementValue(parrotXml, 'DatXmlLocation', newPath);
          Logger.info(`[TP] DatXmlLocation set to "${newPath}"`);
        }
      }

      writeFileSync(parrotDataPath, parrotXml, 'utf8');
      Logger.info(`[TP] Setup ParrotData.xml successfully`);
    } catch (err) {
      Logger.error(`[TP] Failed to update ParrotData.xml:`, err);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 7: Save
  // ────────────────────────────────────────────────────────────────────────

  private save(): void {
    writeFileSync(this.userProfilePath, this.xml, 'utf8');
    Logger.info(`[TP] Saved UserProfile to "${this.userProfilePath}"`);
    this.saveHash();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Launch Command
  // ────────────────────────────────────────────────────────────────────────

  public getLaunchCommand(): { executable: string; args: string[] } {
    const exePath = join(this.tpDir, 'TeknoParrotUi.exe');

    if (!existsSync(exePath)) {
      Logger.warn(`[TP] TeknoParrotUi.exe not found at "${exePath}"`);
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

  // ────────────────────────────────────────────────────────────────────────
  // Hash / Cache
  // ────────────────────────────────────────────────────────────────────────

  private getHashFilePath(): string {
    const launcherConfigsDir = join(getRiescadePath(), 'launcher', 'configs');
    if (!existsSync(launcherConfigsDir)) {
      mkdirSync(launcherConfigsDir, { recursive: true });
    }
    return join(launcherConfigsDir, 'teknoparrot-generated-hash.json');
  }

  private computeHash(): string {
    const controllerSig = this.controllers.map(c => `${c.guid}_${c.index}_${c.vendorId || ''}_${c.productId || ''}`).join('|');
    const pointingSig = [
      Config.getSetting('RIESCADE.TPMouseDevice', 'auto'),
      Config.getSetting('RIESCADE.TPLightgun1Device', 'auto'),
      Config.getSetting('RIESCADE.TPLightgun2Device', 'auto'),
      Config.getSetting('RIESCADE.TPKeyboardDevice', 'auto')
    ].join('|');
    const normalizedProfile = TeknoParrotGenerator.normalizeName(this.profileName);
    const controlsProfile = Object.entries(this.controlsDb.profiles || {})
      .find(([key]) => TeknoParrotGenerator.normalizeName(key) === normalizedProfile)?.[1] || null;
    const controlsSig = JSON.stringify(controlsProfile);
    const raw = `${this.profileName}_${this.controllers.length}_${controllerSig}_${pointingSig}_${controlsSig}_v11`;
    return createHash('md5').update(raw).digest('hex');
  }

  private checkHashChanged(): boolean {
    const hashFilePath = this.getHashFilePath();
    const currentHash = this.computeHash();

    if (existsSync(hashFilePath)) {
      try {
        const data: Record<string, string> = JSON.parse(readFileSync(hashFilePath, 'utf-8'));
        if (data[this.profileName] === currentHash) {
          Logger.info(`[TP] Cache hit for "${this.profileName}" (hash matches)`);
          return false;
        }
      } catch (e) { /* ignore parse errors */ }
    }
    Logger.info(`[TP] Cache miss for "${this.profileName}" (hash changed or new profile)`);
    return true;
  }

  private saveHash(): void {
    const hashFilePath = this.getHashFilePath();
    let data: Record<string, string> = {};
    if (existsSync(hashFilePath)) {
      try {
        data = JSON.parse(readFileSync(hashFilePath, 'utf-8'));
      } catch (e) { /* ignore */ }
    }
    data[this.profileName] = this.computeHash();

    const dir = dirname(hashFilePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(hashFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ────────────────────────────────────────────────────────────────────────
  // Complete Full-Schema JoystickButtons Node Generator
  // Matches working TeknoParrot XML deserializer specification 100%
  // ────────────────────────────────────────────────────────────────────────

  private determinePlayerIndex(btnName: string, inputMapping: string): number {
    const lower = (inputMapping + ' ' + btnName).toLowerCase();
    if (lower.includes('player 4') || lower.includes('p4') || lower.includes('coin 4') || lower.includes('gun 4')) return 3;
    if (lower.includes('player 3') || lower.includes('p3') || lower.includes('coin 3') || lower.includes('gun 3')) return 2;
    if (lower.includes('player 2') || lower.includes('p2') || lower.includes('coin 2') || lower.includes('gun 2') || lower.includes('jvs two') || lower.includes('jvstwo')) return 1;
    return 0; // Player 1 default
  }

  private resolveActionForNode(
    btnName: string,
    inputMapping: string,
    category: 'racing' | 'fighter' | 'lightgun' | 'other',
    customMappings: Record<string, string>
  ): string | null {
    // 0. For lightgun games: skip axis, relative, and lightgun-device nodes entirely.
    //    These nodes must preserve their original template structure (Hide* flags, AnalogType, etc.)
    //    The lightgun device is configured separately by configurePointingAndLightgunDevices.
    if (category === 'lightgun') {
      const lowerMapping = inputMapping.toLowerCase();
      if (lowerMapping.startsWith('analog') || lowerMapping.includes('relative') || lowerMapping.includes('lightgun')) {
        Logger.info(`[TP] Lightgun skip: preserving original node for "${btnName}" (${inputMapping})`);
        return null;
      }
    }

    // 1. Direct match in custom mappings
    if (customMappings[inputMapping]) return customMappings[inputMapping];
    if (customMappings[btnName]) return customMappings[btnName];
    const normalizedInput = TeknoParrotGenerator.normalizeName(inputMapping);
    const normalizedButton = TeknoParrotGenerator.normalizeName(btnName);
    for (const [mappingKey, action] of Object.entries(customMappings)) {
      const normalizedKey = TeknoParrotGenerator.normalizeName(mappingKey);
      if (normalizedKey === normalizedInput || normalizedKey === normalizedButton) {
        return action;
      }
    }

    // 2. Try normalized P1 key match for P2/P3/P4 buttons in custom mappings
    const p1EquivalentBtn = btnName.replace(/p[2-4]/gi, 'P1').replace(/player\s*[2-4]/gi, 'Player 1');
    const p1EquivalentMapping = inputMapping.replace(/p[2-4]/gi, 'P1').replace(/player\s*[2-4]/gi, 'Player 1');
    if (customMappings[p1EquivalentMapping]) return customMappings[p1EquivalentMapping];
    if (customMappings[p1EquivalentBtn]) return customMappings[p1EquivalentBtn];

    // 3. Fallback heuristic matching
    const lower = (inputMapping + ' ' + btnName).toLowerCase();

    // System / Coin / Start
    const assignKbCoinStart = Config.getSetting('RIESCADE.TPAssignKeyboardCoinStart', true);

    if (lower.includes('coin')) {
      if (category === 'lightgun' || assignKbCoinStart) return 'KB_5';
      return 'COIN';
    }
    if (lower.includes('start')) {
      if (category === 'lightgun' || assignKbCoinStart) return 'KB_1';
      return 'START';
    }
    if (lower.includes('test')) {
      if (category === 'lightgun') return 'KB_0';
      return 'L3';
    }
    if (lower.includes('service')) {
      if (category === 'lightgun') return 'KB_9';
      return 'R3';
    }

    // For lightgun games: if no custom mapping matched and it's not a system button,
    // do NOT apply gamepad heuristics (D-Pad, face buttons, etc.)
    // These would incorrectly map buttons like "Volume Up" -> DPAD_UP
    if (category === 'lightgun') {
      Logger.info(`[TP] Lightgun: no custom mapping for "${btnName}" (${inputMapping}), skipping heuristic`);
      return null;
    }

    // D-Pad / Directional
    if (lower.includes('up')) return 'DPAD_UP';
    if (lower.includes('down')) return 'DPAD_DOWN';
    if (lower.includes('left') && !lower.includes('shoulder') && !lower.includes('trigger') && !lower.includes('analog')) return 'DPAD_LEFT';
    if (lower.includes('right') && !lower.includes('shoulder') && !lower.includes('trigger') && !lower.includes('analog')) return 'DPAD_RIGHT';

    // Face / Action buttons
    if (lower.includes('button 1') || lower.includes('button1') || lower.includes('sw1') || lower.includes('punch 1') || lower.includes('light punch')) return 'ACTION_SOUTH';
    if (lower.includes('button 2') || lower.includes('button2') || lower.includes('sw2') || lower.includes('kick 1') || lower.includes('light kick')) return 'ACTION_EAST';
    if (lower.includes('button 3') || lower.includes('button3') || lower.includes('sw3') || lower.includes('punch 2') || lower.includes('medium punch')) return 'ACTION_WEST';
    if (lower.includes('button 4') || lower.includes('button4') || lower.includes('sw4') || lower.includes('kick 2') || lower.includes('medium kick')) return 'ACTION_NORTH';
    if (lower.includes('button 5') || lower.includes('button5') || lower.includes('sw5') || lower.includes('punch 3') || lower.includes('heavy punch')) return 'LB';
    if (lower.includes('button 6') || lower.includes('button6') || lower.includes('sw6') || lower.includes('kick 3') || lower.includes('heavy kick')) return 'RB';

    // Category specific
    if (category === 'racing') {
      if (lower.includes('wheel') || lower.includes('steering') || lower.includes('steer')) return 'STEER_AXIS';
      if (lower.includes('gas') || lower.includes('accelerate')) return 'ACCELERATE';
      if (lower.includes('brake')) return 'BRAKE';
      if (lower.includes('shift up') || lower.includes('gear up')) return 'GEAR_UP';
      if (lower.includes('shift down') || lower.includes('gear down')) return 'GEAR_DOWN';
      if (lower.includes('item')) return 'ACTION_SOUTH';
      if (lower.includes('view')) return 'ACTION_NORTH';
    }

    return null;
  }

  private renderFullJoystickButtonNode(
    btnName: string,
    inputMapping: string,
    action: string | null,
    playerIndex: number,
    existingAnalogType: string = 'None'
  ): string {
    let analogType = existingAnalogType || 'None';
    if (action === 'STEER_AXIS') analogType = 'Wheel';
    else if (action === 'ACCELERATE') analogType = 'Gas';
    else if (action === 'BRAKE') analogType = 'Brake';

    let xinputBlock = '';
    let bindNameXiBlock = '';
    let bindNameBlock = '';

    if (action) {
      const { xinputXml, bindNameXiXml, bindNameXml } = this.renderXInputButtonParts(action, playerIndex);
      xinputBlock = xinputXml;
      bindNameXiBlock = bindNameXiXml;
      bindNameBlock = bindNameXml;
    }

    return `    <JoystickButtons>
      <ButtonName>${btnName}</ButtonName>${xinputBlock ? '\n      ' + xinputBlock : ''}
      <InputMapping>${inputMapping}</InputMapping>
      <AnalogType>${analogType}</AnalogType>${bindNameXiBlock ? '\n      ' + bindNameXiBlock : ''}${bindNameBlock ? '\n      ' + bindNameBlock : ''}
      <HideWithDirectInput>false</HideWithDirectInput>
      <HideWithXInput>false</HideWithXInput>
      <HideWithRawInput>false</HideWithRawInput>
      <HideWithKeyboardForAxis>false</HideWithKeyboardForAxis>
      <HideWithoutKeyboardForAxis>false</HideWithoutKeyboardForAxis>
      <HideWithRelativeAxis>false</HideWithRelativeAxis>
      <HideWithoutRelativeAxis>false</HideWithoutRelativeAxis>
      <HideWithUseDPadForGUN1Stick>false</HideWithUseDPadForGUN1Stick>
      <HideWithoutUseDPadForGUN1Stick>false</HideWithoutUseDPadForGUN1Stick>
      <HideWithUseDPadForGUN2Stick>false</HideWithUseDPadForGUN2Stick>
      <HideWithoutUseDPadForGUN2Stick>false</HideWithoutUseDPadForGUN2Stick>
      <HideWithUseAnalogAxisToAimGUN1>false</HideWithUseAnalogAxisToAimGUN1>
      <HideWithoutUseAnalogAxisToAimGUN1>false</HideWithoutUseAnalogAxisToAimGUN1>
      <HideWithUseAnalogAxisToAimGUN2>false</HideWithUseAnalogAxisToAimGUN2>
      <HideWithoutUseAnalogAxisToAimGUN2>false</HideWithoutUseAnalogAxisToAimGUN2>
      <HideWithoutProMode>false</HideWithoutProMode>
      <HideWithProMode>false</HideWithProMode>
    </JoystickButtons>`;
  }

  private renderXInputButtonParts(action: string, playerIndex: number): { xinputXml: string; bindNameXiXml: string; bindNameXml: string } {
    if (action.startsWith('KB_')) {
      const keyStr = action.replace('KB_', '');
      const bindNameXml = `<BindName>${keyStr}</BindName>`;
      return { xinputXml: '', bindNameXiXml: '', bindNameXml };
    }

    if (action.startsWith('mouseleft') || action === 'LeftClick') {
      const bindNameXml = `<BindName>LeftClick</BindName>`;
      return { xinputXml: '', bindNameXiXml: '', bindNameXml };
    }

    if (action.startsWith('mouseright') || action === 'RightClick') {
      const bindNameXml = `<BindName>RightClick</BindName>`;
      return { xinputXml: '', bindNameXiXml: '', bindNameXml };
    }

    if (action.startsWith('mousemiddle') || action === 'MiddleClick') {
      const bindNameXml = `<BindName>MiddleClick</BindName>`;
      return { xinputXml: '', bindNameXiXml: '', bindNameXml };
    }

    let code = 0;
    let isBtn = true;
    let isLt = false;
    let isRt = false;
    let isLeftThumbX = false;
    let isLeftThumbY = false;
    let isRightThumbX = false;
    let isRightThumbY = false;
    let isAxisMinus = false;
    let bindName = 'Input Device ' + playerIndex + ' ';

    switch (action) {
      case 'START': case 'START_1': case 'START_2':
        code = 16; bindName += 'Start'; break;
      case 'COIN': case 'COIN_1': case 'COIN_2':
        code = 32; bindName += 'Back'; break;
      case 'DPAD_UP':
        code = 1; bindName += 'DPadUp'; break;
      case 'DPAD_DOWN':
        code = 2; bindName += 'DPadDown'; break;
      case 'DPAD_LEFT':
        code = 4; bindName += 'DPadLeft'; break;
      case 'DPAD_RIGHT':
        code = 8; bindName += 'DPadRight'; break;
      case 'ACTION_SOUTH':
        code = 4096; bindName += 'A'; break;
      case 'ACTION_EAST':
        code = 8192; bindName += 'B'; break;
      case 'ACTION_WEST':
        code = 16384; bindName += 'X'; break;
      case 'ACTION_NORTH':
        code = -32768; bindName += 'Y'; break;
      case 'LB': case 'GEAR_DOWN':
        code = 256; bindName += 'LeftShoulder'; break;
      case 'RB': case 'GEAR_UP':
        code = 512; bindName += 'RightShoulder'; break;
      case 'L3':
        code = 64; bindName += 'LeftThumb'; break;
      case 'R3':
        code = 128; bindName += 'RightThumb'; break;
      case 'LT': case 'BRAKE':
        isLt = true; isBtn = false; bindName += 'LEFTTRIGGER'; break;
      case 'RT': case 'ACCELERATE':
        isRt = true; isBtn = false; bindName += 'RIGHTTRIGGER'; break;
      case 'STEER_AXIS':
        isLeftThumbX = true; isAxisMinus = true; isBtn = false; bindName += 'LEFTANALOG_LEFT'; break;
      case 'rightstickleft':
        isRightThumbX = true; isAxisMinus = true; isBtn = false; bindName += 'RIGHTANALOG_LEFT'; break;
      case 'rightstickright':
        isRightThumbX = true; isBtn = false; bindName += 'RIGHTANALOG_RIGHT'; break;
      case 'rightstickup':
        isRightThumbY = true; isBtn = false; bindName += 'RIGHTANALOG_UP'; break;
      case 'rightstickdown':
        isRightThumbY = true; isAxisMinus = true; isBtn = false; bindName += 'RIGHTANALOG_DOWN'; break;
      default:
        return { xinputXml: '', bindNameXiXml: '', bindNameXml: '' };
    }

    const xinputXml = `<XInputButton>
        <IsLeftThumbX>${isLeftThumbX}</IsLeftThumbX>
        <IsRightThumbX>${isRightThumbX}</IsRightThumbX>
        <IsLeftThumbY>${isLeftThumbY}</IsLeftThumbY>
        <IsRightThumbY>${isRightThumbY}</IsRightThumbY>
        <IsAxisMinus>${isAxisMinus}</IsAxisMinus>
        <IsLeftTrigger>${isLt}</IsLeftTrigger>
        <IsRightTrigger>${isRt}</IsRightTrigger>
        <ButtonCode>${code}</ButtonCode>
        <IsButton>${isBtn}</IsButton>
        <ButtonIndex>0</ButtonIndex>
        <XInputIndex>${playerIndex}</XInputIndex>
      </XInputButton>`;

    const bindNameXiXml = `<BindNameXi>${bindName}</BindNameXi>`;
    const bindNameXml = `<BindName>${bindName}</BindName>`;

    return { xinputXml, bindNameXiXml, bindNameXml };
  }

  /**
   * Injects a binding into an existing JoystickButtons node WITHOUT rebuilding it.
   * Preserves the original node structure (Hide* flags, AnalogType, etc.)
   * For lightgun games in RawInput mode, generates proper <RawInputButton> XML
   * that TeknoParrot can actually deserialize.
   */
  private injectBindingIntoExistingNode(existingNode: string, action: string, _playerIndex: number): string {
    let node = existingNode;

    // Strip any existing binding/input tags to avoid duplicates
    node = node.replace(/<XInputButton>[\s\S]*?<\/XInputButton>\s*/gi, '');
    node = node.replace(/<BindName>[\s\S]*?<\/BindName>\s*/gi, '');
    node = node.replace(/<BindNameXi>[\s\S]*?<\/BindNameXi>\s*/gi, '');
    node = node.replace(/<BindNameRi>[\s\S]*?<\/BindNameRi>\s*/gi, '');
    node = node.replace(/<RawInputButton>[\s\S]*?<\/RawInputButton>\s*/gi, '');
    node = node.replace(/<RawInputName>[\s\S]*?<\/RawInputName>\s*/gi, '');

    // Generate the proper RawInput binding for lightgun games
    const binding = this.renderRawInputBinding(action, _playerIndex);

    if (binding) {
      // Insert before closing </JoystickButtons>
      node = node.replace(/<\/JoystickButtons>\s*$/i, binding + '\n\t\t</JoystickButtons>');
    }

    return node;
  }

  /**
   * Renders a RawInput binding block for keyboard keys and mouse buttons.
   * This produces the exact XML format that TeknoParrot's RawInput mode expects.
   *
   * For keyboard: <RawInputButton> with DeviceType=Keyboard, KeyboardKey=D0-D9
   * For mouse:    <RawInputButton> with DeviceType=Mouse, MouseButton=LeftButton/RightButton/MiddleButton
   */
  private renderRawInputBinding(action: string, playerIndex: number): string | null {
    // Keyboard key mapping (KB_0 -> D0, KB_1 -> D1, KB_5 -> D5, KB_9 -> D9, etc.)
    if (action.startsWith('KB_')) {
      if (!this.keyboardDevicePath) {
        Logger.warn(`[TP] Skipping keyboard binding "${action}" because no Raw Input keyboard DevicePath is configured.`);
        return null;
      }
      const keyStr = action.replace('KB_', '').toUpperCase();
      const namedKeys: Record<string, string> = {
        UP: 'Up',
        DOWN: 'Down',
        LEFT: 'Left',
        RIGHT: 'Right',
        ENTER: 'Enter',
        RETURN: 'Enter'
      };
      const keyboardKey = /^\d$/.test(keyStr)
        ? `D${keyStr}`
        : (namedKeys[keyStr] || (keyStr.length === 1 ? keyStr : keyStr));
      const bindLabel = `${this.keyboardDeviceLabel} ${keyboardKey}`;
      return `\t\t\t<RawInputButton>\n\t\t\t\t<DevicePath>${this.xmlEscape(this.keyboardDevicePath)}</DevicePath>\n\t\t\t\t<DeviceType>Keyboard</DeviceType>\n\t\t\t\t<MouseButton>None</MouseButton>\n\t\t\t\t<KeyboardKey>${keyboardKey}</KeyboardKey>\n\t\t\t</RawInputButton>\n\t\t\t<BindNameRi>${this.xmlEscape(bindLabel)}</BindNameRi>\n\t\t\t<BindName>${this.xmlEscape(bindLabel)}</BindName>`;
    }

    // Mouse left click
    if (action.startsWith('mouseleft') || action === 'LeftClick') {
      if (!this.pointingDevicePaths[playerIndex]) return null;
      return this.renderMouseRawInputButton(this.pointingDevicePaths[playerIndex] || '', 'LeftButton', `P${playerIndex + 1} Mouse`);
    }

    // Mouse right click
    if (action.startsWith('mouseright') || action === 'RightClick') {
      if (!this.pointingDevicePaths[playerIndex]) return null;
      return this.renderMouseRawInputButton(this.pointingDevicePaths[playerIndex] || '', 'RightButton', `P${playerIndex + 1} Mouse`);
    }

    // Mouse middle click
    if (action.startsWith('mousemiddle') || action === 'MiddleClick') {
      if (!this.pointingDevicePaths[playerIndex]) return null;
      return this.renderMouseRawInputButton(this.pointingDevicePaths[playerIndex] || '', 'MiddleButton', `P${playerIndex + 1} Mouse`);
    }

    // For XInput actions (COIN_1, START_1, DPAD_*, etc.) - use the XInput path as fallback
    const { xinputXml, bindNameXiXml, bindNameXml } = this.renderXInputButtonParts(action, playerIndex);
    if (xinputXml || bindNameXml) {
      const parts: string[] = [];
      if (xinputXml) parts.push(xinputXml);
      if (bindNameXiXml) parts.push(bindNameXiXml);
      if (bindNameXml) parts.push(bindNameXml);
      return parts.map(p => '\t\t\t' + p).join('\n');
    }

    return null;
  }

  private classifyByScore(buttons: string[]): 'racing' | 'fighter' | 'lightgun' | 'other' {
    let racingScore = 0;
    let fighterScore = 0;
    let lightgunScore = 0;

    for (const b of buttons) {
      const lower = b.toLowerCase();
      if (lower.includes('gas') || lower.includes('brake') || lower.includes('wheel') || lower.includes('steer') || lower.includes('pedal') || lower.includes('gear') || lower.includes('shift')) {
        racingScore += 15;
      }
      if (lower.includes('button 1') || lower.includes('button 2') || lower.includes('button 3') || lower.includes('button 4') || lower.includes('punch') || lower.includes('kick') || lower.includes('sw1')) {
        fighterScore += 10;
      }
      if (lower.includes('trigger') || lower.includes('reload') || lower.includes('offscreen') || lower.includes('gun 1') || lower.includes('sight')) {
        lightgunScore += 15;
      }
    }

    if (racingScore > fighterScore && racingScore > lightgunScore) return 'racing';
    if (lightgunScore > fighterScore && lightgunScore > racingScore) return 'lightgun';
    if (fighterScore > 0) return 'fighter';
    return 'other';
  }

  private extractButtonNames(xml: string): string[] {
    const matches = xml.match(/<ButtonName>(.*?)<\/ButtonName>/g) || [];
    return matches.map(m => m.replace(/<\/?ButtonName>/g, '').trim());
  }

  private updateJoystickButtonsXml(
    fullXml: string,
    category: 'racing' | 'fighter' | 'lightgun' | 'other',
    customMappings: Record<string, string>
  ): { xml: string; count: number } {
    let count = 0;

    const childNodeRegex = /<JoystickButtons>\s*<(?:ButtonName|InputMapping)[\s\S]*?<\/JoystickButtons>/gi;

    const newXml = fullXml.replace(childNodeRegex, (fullMatch) => {
      const matchName = fullMatch.match(/<ButtonName>(.*?)<\/ButtonName>/i);
      const matchMapping = fullMatch.match(/<InputMapping>(.*?)<\/InputMapping>/i);
      const matchAnalog = fullMatch.match(/<AnalogType>(.*?)<\/AnalogType>/i);

      const btnName = matchName ? matchName[1].trim() : '';
      const inputMapping = matchMapping ? matchMapping[1].trim() : '';
      const existingAnalogType = matchAnalog ? matchAnalog[1].trim() : 'None';

      if (!btnName && !inputMapping) return fullMatch;

      const playerIndex = this.determinePlayerIndex(btnName, inputMapping);
      const action = this.resolveActionForNode(btnName, inputMapping, category, customMappings);

      // For lightgun games: preserve original node structure and only inject bindings.
      // This keeps critical Hide* flags (HideWithRawInput, HideWithRelativeAxis, etc.)
      // and AnalogType values (AnalogJoystick, AnalogJoystickReverse) intact.
      if (category === 'lightgun') {
        const lowerMapping = inputMapping.toLowerCase();
        // Axis, relative, and lightgun-device nodes: leave completely untouched
        if (lowerMapping.startsWith('analog') || lowerMapping.includes('relative') || lowerMapping.includes('lightgun')) {
          Logger.info(`[TP] Lightgun preserve: keeping original node for "${btnName}" (${inputMapping})`);
          return fullMatch;
        }
        // Button nodes: inject binding into existing node structure
        if (action) {
          count++;
          Logger.info(`[TP] Lightgun inject: binding "${action}" into existing node for "${btnName}" (${inputMapping})`);
          return this.injectBindingIntoExistingNode(fullMatch, action, playerIndex);
        }
        // No action resolved: preserve original node as-is
        return fullMatch;
      }

      // Non-lightgun games: use full node rebuild (existing behavior)
      // Assign controls if physical gamepad is connected for this player index OR if mouse / keyboard action
      const isMouseOrKb = action ? (action.toLowerCase().startsWith('mouse') || action.toLowerCase().startsWith('kb_') || action.toLowerCase().startsWith('p1button') || action.toLowerCase().startsWith('p2button')) : false;

      let actionToMap: string | null = null;
      if (isMouseOrKb || playerIndex < this.controllers.length) {
        actionToMap = action;
      } else {
        Logger.info(`[TP] Skipped P${playerIndex + 1} button "${btnName}" (${inputMapping}) because only ${this.controllers.length} controller(s) are connected.`);
      }

      if (actionToMap) count++;

      return this.renderFullJoystickButtonNode(btnName, inputMapping, actionToMap, playerIndex, existingAnalogType);
    });

    return { xml: newXml, count };
  }

  // ────────────────────────────────────────────────────────────────────────
  // XML Utilities
  // ────────────────────────────────────────────────────────────────────────

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
    const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match any <FieldInformation> block that contains <FieldName>fieldName</FieldName>
    const fieldBlockRegex = new RegExp(
      `(<FieldInformation>(?:(?!</FieldInformation>)[^])*?<FieldName>\\s*${escapedName}\\s*</FieldName>(?:(?!</FieldInformation>)[^])*?</FieldInformation>)`,
      'gi'
    );

    if (fieldBlockRegex.test(xml)) {
      return xml.replace(fieldBlockRegex, (block) => {
        if (/<FieldValue>(.*?)<\/FieldValue>/i.test(block)) {
          return block.replace(/<FieldValue>([^]*?)<\/FieldValue>/i, `<FieldValue>${newValue}</FieldValue>`);
        } else {
          return block.replace('</FieldInformation>', `  <FieldValue>${newValue}</FieldValue>\n    </FieldInformation>`);
        }
      });
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
