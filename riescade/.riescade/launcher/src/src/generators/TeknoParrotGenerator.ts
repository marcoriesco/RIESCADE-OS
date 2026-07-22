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

    // 1. Load database & index GameProfiles
    this.loadControlsDb();
    this.buildGameProfilesIndex();

    // 2. Resolve profile name
    this.resolveProfileName();

    // 3. Check hash cache
    this.hashChanged = this.checkHashChanged();

    // 4. Execute configuration pipeline
    this.buildUserProfile();
    this.configureGamePath();
    this.configureConfigValues();
    this.configureControllers();
    this.configureParrotData();
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

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 4: Configure ConfigValues (Input API & DisplayMode)
  // Decoupled from controller button mapping!
  // ────────────────────────────────────────────────────────────────────────

  private configureConfigValues(): void {
    // 1. Force Input API to XInput whenever controllers are present or XInput is requested
    if (this.xml.includes('<FieldName>Input API</FieldName>')) {
      this.xml = this.setFieldValue(this.xml, 'Input API', 'XInput');
      Logger.info(`[TP] Input API set to XInput in ConfigValues`);
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
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pipeline Step 5: Configure Controllers (JoystickButtons)
  // ────────────────────────────────────────────────────────────────────────

  private configureControllers(): void {
    if (!this.hashChanged) {
      if (this.xml.includes('<XInputButton>')) {
        Logger.info(`[TP] Controller config for "${this.profileName}" is up to date (hash match). Skipping button update.`);
        return;
      }
    }

    const disableAuto = Config.getEmulatorSetting('teknoparrot', 'disableautocontrollers', null);
    if (disableAuto === 'true' || disableAuto === '1' || disableAuto === true) {
      Logger.info(`[TP] Auto controller configuration disabled via user setting.`);
      return;
    }

    if (this.controllers.length === 0) {
      Logger.warn(`[TP] No controllers provided. Skipped button mapping.`);
      return;
    }

    // Determine game category and custom mappings
    const buttonNames = this.extractButtonNames(this.xml);
    const normProfileName = TeknoParrotGenerator.normalizeName(this.profileName);

    // Look up profile entry in controls DB (case/punctuation insensitive)
    let explicitProfile: TeknoControlsDb['profiles'][string] | null = null;
    for (const [key, value] of Object.entries(this.controlsDb.profiles || {})) {
      if (TeknoParrotGenerator.normalizeName(key) === normProfileName) {
        explicitProfile = value;
        break;
      }
    }

    const category = explicitProfile?.category || this.classifyByScore(buttonNames);
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
    const raw = `${this.profileName}_${this.controllers.length}_${controllerSig}_v6`;
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
    // 1. Direct match in custom mappings
    if (customMappings[inputMapping]) return customMappings[inputMapping];
    if (customMappings[btnName]) return customMappings[btnName];

    // 2. Try normalized P1 key match for P2/P3/P4 buttons in custom mappings
    const p1EquivalentBtn = btnName.replace(/p[2-4]/gi, 'P1').replace(/player\s*[2-4]/gi, 'Player 1');
    const p1EquivalentMapping = inputMapping.replace(/p[2-4]/gi, 'P1').replace(/player\s*[2-4]/gi, 'Player 1');
    if (customMappings[p1EquivalentMapping]) return customMappings[p1EquivalentMapping];
    if (customMappings[p1EquivalentBtn]) return customMappings[p1EquivalentBtn];

    // 3. Fallback heuristic matching
    const lower = (inputMapping + ' ' + btnName).toLowerCase();

    // System / Coin / Start
    if (lower.includes('coin')) return 'COIN';
    if (lower.includes('start')) return 'START';
    if (lower.includes('test')) return 'L3';
    if (lower.includes('service')) return 'R3';

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
    } else if (category === 'lightgun') {
      if (lower.includes('trigger')) return 'ACCELERATE';
      if (lower.includes('reload') || lower.includes('offscreen')) return 'BRAKE';
      if (lower.includes('special') || lower.includes('bomb')) return 'ACTION_WEST';
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

      // Only assign XInput controls if a physical controller is connected for this player index!
      let actionToMap: string | null = null;
      if (playerIndex < this.controllers.length) {
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
