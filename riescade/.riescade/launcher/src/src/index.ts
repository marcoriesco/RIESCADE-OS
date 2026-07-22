import { spawn } from 'child_process';
import { dirname, parse, join } from 'path';
import { Logger } from './utils/logger.js';
import { Config } from './config.js';
import { LaunchArgs, ControllerInfo } from './types.js';
import { BaseGenerator } from './generators/BaseGenerator.js';
import { LibRetroGenerator } from './generators/LibRetroGenerator.js';
import { Pcsx2Generator } from './generators/Pcsx2Generator.js';
import { Pcsx2x6Generator } from './generators/Pcsx2x6Generator.js';
import { DolphinGenerator } from './generators/DolphinGenerator.js';
import { TeknoParrotGenerator } from './generators/TeknoParrotGenerator.js';
import { GenericGenerator } from './generators/GenericGenerator.js';
import { AresGenerator } from './generators/AresGenerator.js';
import { Mame64Generator } from './generators/Mame64Generator.js';
import { XeniaGenerator } from './generators/XeniaGenerator.js';
import { DuckstationGenerator } from './generators/DuckstationGenerator.js';
import { RyujinxGenerator } from './generators/RyujinxGenerator.js';
import { EdenGenerator } from './generators/EdenGenerator.js';
import { CitronGenerator } from './generators/CitronGenerator.js';
import { Rpcs3Generator } from './generators/Rpcs3Generator.js';
import { CemuGenerator } from './generators/CemuGenerator.js';
import { PpssppGenerator } from './generators/PpssppGenerator.js';
import { FlycastGenerator } from './generators/FlycastGenerator.js';
import { XemuGenerator } from './generators/XemuGenerator.js';
import { BigPemuGenerator } from './generators/BigPemuGenerator.js';
import { Model2Generator } from './generators/Model2Generator.js';
import { Model3Generator } from './generators/Model3Generator.js';
import { RedreamGenerator } from './generators/RedreamGenerator.js';
import { Shadps4Generator } from './generators/Shadps4Generator.js';
import { Vita3kGenerator } from './generators/Vita3kGenerator.js';
import { WindowsGenerator } from './generators/WindowsGenerator.js';
import { findFreeDriveLetter, mountSquashfs, unmountSquashfs, resolveRomInDrive } from './utils/squashfs.js';
import { getRetroBatPath } from './utils/paths.js';
import { AltirraGenerator } from './generators/AltirraGenerator.js';
import { ExeLauncherGenerator } from './generators/ExeLauncherGenerator.js';
import { AmigaForeverGenerator } from './generators/AmigaForeverGenerator.js';
import { AppleWinGenerator } from './generators/AppleWinGenerator.js';
import { ArcadeFlashWebGenerator } from './generators/ArcadeFlashWebGenerator.js';
import { AzaharGenerator } from './generators/AzaharGenerator.js';
import { BizhawkGenerator } from './generators/BizhawkGenerator.js';
import { CapriceForeverGenerator } from './generators/CapriceForeverGenerator.js';
import { CitraGenerator } from './generators/CitraGenerator.js';
import { CxbxGenerator } from './generators/CxbxGenerator.js';
import { DaphneGenerator } from './generators/DaphneGenerator.js';
import { DemulGenerator } from './generators/DemulGenerator.js';
import { DesmumeGenerator } from './generators/DesmumeGenerator.js';
import { DevilutionXGenerator } from './generators/DevilutionXGenerator.js';
import { DosBoxGenerator } from './generators/DosBoxGenerator.js';
import { DosBoxPureGenerator } from './generators/DosBoxPureGenerator.js';
import { DosBoxStagingGenerator } from './generators/DosBoxStagingGenerator.js';
import { EasyRpgGenerator } from './generators/EasyRpgGenerator.js';
import { EDukeGenerator } from './generators/EDukeGenerator.js';
import { Eka2l1Generator } from './generators/Eka2l1Generator.js';
import { ExeLauncherGenerator } from './generators/ExeLauncherGenerator.js';
import { ExeLauncherGenerator } from './generators/ExeLauncherGenerator.js';
import { exoDOSGenerator } from './generators/exoDOSGenerator.js';
import { FbneoGenerator } from './generators/FbneoGenerator.js';
import { ForceEngineGenerator } from './generators/ForceEngineGenerator.js';
import { FpinballGenerator } from './generators/FpinballGenerator.js';
import { GemRBGenerator } from './generators/GemRBGenerator.js';
import { ExeLauncherGenerator } from './generators/ExeLauncherGenerator.js';
import { Gopher64Generator } from './generators/Gopher64Generator.js';
import { GsPlusGenerator } from './generators/GsPlusGenerator.js';
import { GZDoomGenerator } from './generators/GZDoomGenerator.js';
import { HatariGenerator } from './generators/HatariGenerator.js';
import { JgenesisGenerator } from './generators/JgenesisGenerator.js';
import { JynxGenerator } from './generators/JynxGenerator.js';
import { JZintvGenerator } from './generators/JZintvGenerator.js';
import { KegaFusionGenerator } from './generators/KegaFusionGenerator.js';
import { KronosGenerator } from './generators/KronosGenerator.js';
import { Lime3dsGenerator } from './generators/Lime3dsGenerator.js';
import { LinuxloaderGenerator } from './generators/LinuxloaderGenerator.js';
import { LoveGenerator } from './generators/LoveGenerator.js';
import { MagicEngineGenerator } from './generators/MagicEngineGenerator.js';
import { MandarineGenerator } from './generators/MandarineGenerator.js';
import { MednafenGenerator } from './generators/MednafenGenerator.js';
import { MelonDSGenerator } from './generators/MelonDSGenerator.js';
import { MesenGenerator } from './generators/MesenGenerator.js';
import { MGBAGenerator } from './generators/MGBAGenerator.js';
import { Mupen64Generator } from './generators/Mupen64Generator.js';
import { N64RecompGenerator } from './generators/N64RecompGenerator.js';
import { Nes3dGenerator } from './generators/Nes3dGenerator.js';
import { NosGbaGenerator } from './generators/NosGbaGenerator.js';
import { OpenBorGenerator } from './generators/OpenBorGenerator.js';
import { OpenMSXGenerator } from './generators/OpenMSXGenerator.js';
import { OricutronGenerator } from './generators/OricutronGenerator.js';
import { PhoenixGenerator } from './generators/PhoenixGenerator.js';
import { Pico8Generator } from './generators/Pico8Generator.js';
import { PinballFXGenerator } from './generators/PinballFXGenerator.js';
import { PlayGenerator } from './generators/PlayGenerator.js';
import { PortsLauncherGenerator } from './generators/PortsLauncherGenerator.js';
import { Project64Generator } from './generators/Project64Generator.js';
import { PSXMameGenerator } from './generators/PSXMameGenerator.js';
import { RaineGenerator } from './generators/RaineGenerator.js';
import { RazeGenerator } from './generators/RazeGenerator.js';
import { RetrobatLauncherGenerator } from './generators/RetrobatLauncherGenerator.js';
import { RuffleGenerator } from './generators/RuffleGenerator.js';
import { ScummVmGenerator } from './generators/ScummVmGenerator.js';
import { SimCoupeGenerator } from './generators/SimCoupeGenerator.js';
import { Simple64Generator } from './generators/Simple64Generator.js';
import { Singe2Generator } from './generators/Singe2Generator.js';
import { Snes9xGenerator } from './generators/Snes9xGenerator.js';
import { SolarusGenerator } from './generators/SolarusGenerator.js';
import { SSFGenerator } from './generators/SSFGenerator.js';
import { ExeLauncherGenerator } from './generators/ExeLauncherGenerator.js';
import { StellaGenerator } from './generators/StellaGenerator.js';
import { SudachiGenerator } from './generators/SudachiGenerator.js';
import { SuyuGenerator } from './generators/SuyuGenerator.js';
import { TsugaruGenerator } from './generators/TsugaruGenerator.js';
import { UaeGenerator } from './generators/UaeGenerator.js';
import { VPinballGenerator } from './generators/VPinballGenerator.js';
import { WinArcadiaGenerator } from './generators/WinArcadiaGenerator.js';
import { Xm6proGenerator } from './generators/Xm6proGenerator.js';
import { XroarGenerator } from './generators/XroarGenerator.js';
import { YabasanshiroGenerator } from './generators/YabasanshiroGenerator.js';
import { YmirGenerator } from './generators/YmirGenerator.js';
import { YuzuGenerator } from './generators/YuzuGenerator.js';
import { ZaccariaPinballGenerator } from './generators/ZaccariaPinballGenerator.js';
import { ZEsarUXGenerator } from './generators/ZEsarUXGenerator.js';
import { ZincGenerator } from './generators/ZincGenerator.js';



function parseArgs(args: string[]): LaunchArgs {
  const rawArgs: Record<string, string> = {};
  const flags: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        rawArgs[arg] = nextArg;
        i++;
      } else {
        flags.push(arg.substring(1));
      }
    }
  }

  // 3-Tier Controller Parsing Strategy
  let controllers: ControllerInfo[] = [];
  const controllersRaw = rawArgs['-controllers'];

  if (controllersRaw) {
    // Tier 1: Try Base64 decode -> JSON parse
    try {
      const decoded = Buffer.from(controllersRaw, 'base64').toString('utf-8');
      controllers = JSON.parse(decoded);
      Logger.info(`Parsed ${controllers.length} controller(s) from -controllers Base64 payload`);
    } catch (e1) {
      // Tier 2: Try direct JSON parse (for raw un-encoded CLI input)
      try {
        controllers = JSON.parse(controllersRaw);
        Logger.info(`Parsed ${controllers.length} controller(s) from raw -controllers JSON`);
      } catch (e2) {
        Logger.warn(`Failed to parse -controllers payload as Base64 or raw JSON. Falling back to legacy per-player args.`);
      }
    }
  }

  // Tier 3: Fallback to building controllers from legacy per-player args (-p1guid, etc.)
  if (controllers.length === 0) {
    for (let p = 1; p <= 4; p++) {
      const guid = rawArgs[`-p${p}guid`];
      if (!guid) continue;
      controllers.push({
        player: p,
        type: (rawArgs[`-p${p}type`] as ControllerInfo['type']) || 'xinput',
        guid,
        name: rawArgs[`-p${p}name`] || `Player ${p} Controller`,
        index: parseInt(rawArgs[`-p${p}index`] || String(p - 1), 10),
        buttons: parseInt(rawArgs[`-p${p}nbbuttons`] || '0', 10),
        axes: parseInt(rawArgs[`-p${p}nbaxes`] || '0', 10),
        hats: parseInt(rawArgs[`-p${p}nbhats`] || '1', 10),
        instanceId: rawArgs[`-p${p}path`],
      });
    }
    if (controllers.length > 0) {
      Logger.info(`Built ${controllers.length} controller(s) from legacy per-player CLI args`);
    }
  }

  return {
    system: rawArgs['-system'] || '',
    emulator: rawArgs['-emulator'] || '',
    core: rawArgs['-core'] || '',
    rom: rawArgs['-rom'] || '',
    controllers,
    p1guid: rawArgs['-p1guid'],
    p2guid: rawArgs['-p2guid'],
    p3guid: rawArgs['-p3guid'],
    p4guid: rawArgs['-p4guid'],
    p1index: rawArgs['-p1index'],
    p2index: rawArgs['-p2index'],
    p3index: rawArgs['-p3index'],
    p4index: rawArgs['-p4index'],
    p1name: rawArgs['-p1name'],
    p2name: rawArgs['-p2name'],
    p3name: rawArgs['-p3name'],
    p4name: rawArgs['-p4name'],
    p1type: rawArgs['-p1type'],
    p2type: rawArgs['-p2type'],
    p3type: rawArgs['-p3type'],
    p4type: rawArgs['-p4type'],
    p1path: rawArgs['-p1path'],
    p2path: rawArgs['-p2path'],
    p3path: rawArgs['-p3path'],
    p4path: rawArgs['-p4path'],
    rawArgs,
    flags,
  };
}

function getGenerator(args: LaunchArgs): BaseGenerator {
  const emu = args.emulator.toLowerCase();
  const sys = args.system.toLowerCase();

  if (emu === 'libretro' || emu === 'retroarch' || emu === 'angle') {
    return new LibRetroGenerator(args);
  }
  if (emu === 'pcsx2' || emu === 'pcsx2-nightly' || emu === 'pcsx2qt' || emu === 'pcsx2-16' || emu === 'ps2' || sys === 'ps2') {
    return new Pcsx2Generator(args);
  }
  if (emu === 'pcsx2x6') {
    return new Pcsx2x6Generator(args);
  }
  if (emu === 'dolphin' || emu === 'dolphin-emu' || emu === 'dolphin-triforce' || sys === 'gamecube' || sys === 'wii') {
    return new DolphinGenerator(args);
  }
  if (emu === 'teknoparrot' || sys === 'teknoparrot') {
    return new TeknoParrotGenerator(args);
  }
  if (emu === 'ares' || sys === 'ares') {
    return new AresGenerator(args);
  }
  if (emu === 'mame64' || emu === 'mame' || sys === 'mame64') {
    return new Mame64Generator(args);
  }
  if (emu === 'xenia' || emu === 'xenia-canary' || sys === 'xbox360' || sys === 'xboxlivearcade' || sys === 'xbla') {
    return new XeniaGenerator(args);
  }
  if (emu === 'eden' || emu === 'eden-nightly') {
    return new EdenGenerator(args);
  }
  if (emu === 'citron') {
    return new CitronGenerator(args);
  }
  if (emu === 'ryujinx' || sys === 'switch') {
    return new RyujinxGenerator(args);
  }
  if (emu === 'rpcs3' || sys === 'ps3') {
    return new Rpcs3Generator(args);
  }
  if (emu === 'cemu' || sys === 'wiiu') {
    return new CemuGenerator(args);
  }
  if (emu === 'duckstation' || sys === 'psx') {
    return new DuckstationGenerator(args);
  }
  if (emu === 'ppsspp' || sys === 'psp') {
    return new PpssppGenerator(args);
  }
  if (emu === 'flycast' || sys === 'dreamcast' || sys === 'naomi') {
    return new FlycastGenerator(args);
  }
  if (emu === 'xemu' || sys === 'xbox') {
    return new XemuGenerator(args);
  }
  if (emu === 'bigpemu' || sys === 'atarijaguar') {
    return new BigPemuGenerator(args);
  }
  if (emu === 'model2' || sys === 'model2') {
    return new Model2Generator(args);
  }
  if (emu === 'supermodel' || emu === 'model3' || sys === 'model3') {
    return new Model3Generator(args);
  }
  if (emu === 'redream') {
    return new RedreamGenerator(args);
  }
  if (emu === 'shadps4' || sys === 'ps4') {
    return new Shadps4Generator(args);
  }
  if (emu === 'vita3k' || sys === 'psvita') {
    return new Vita3kGenerator(args);
  }
  if (emu === 'windows' || sys === 'windows') {
    return new WindowsGenerator(args);
  }



    if (emu === 'altirra') {
    return new AltirraGenerator(args);
  }
  if (emu === 'amazonlauncher') {
    return new ExeLauncherGenerator(args);
  }
  if (emu === 'amigaforever') {
    return new AmigaForeverGenerator(args);
  }
  if (emu === 'applewin') {
    return new AppleWinGenerator(args);
  }
  if (emu === 'arcadeflashweb') {
    return new ArcadeFlashWebGenerator(args);
  }
  if (emu === 'azahar') {
    return new AzaharGenerator(args);
  }
  if (emu === 'bizhawk') {
    return new BizhawkGenerator(args);
  }
  if (emu === 'capriceforever') {
    return new CapriceForeverGenerator(args);
  }
  if (emu === 'citra') {
    return new CitraGenerator(args);
  }
  if (emu === 'cxbx') {
    return new CxbxGenerator(args);
  }
  if (emu === 'daphne') {
    return new DaphneGenerator(args);
  }
  if (emu === 'demul') {
    return new DemulGenerator(args);
  }
  if (emu === 'desmume') {
    return new DesmumeGenerator(args);
  }
  if (emu === 'devilutionx') {
    return new DevilutionXGenerator(args);
  }
  if (emu === 'dosbox') {
    return new DosBoxGenerator(args);
  }
  if (emu === 'dosboxpure') {
    return new DosBoxPureGenerator(args);
  }
  if (emu === 'dosboxstaging') {
    return new DosBoxStagingGenerator(args);
  }
  if (emu === 'easyrpg') {
    return new EasyRpgGenerator(args);
  }
  if (emu === 'eduke32') {
    return new EDukeGenerator(args);
  }
  if (emu === 'eka2l1') {
    return new Eka2l1Generator(args);
  }
  if (emu === 'epiclauncher') {
    return new ExeLauncherGenerator(args);
  }
  if (emu === 'exelauncher') {
    return new ExeLauncherGenerator(args);
  }
  if (emu === 'exodos') {
    return new exoDOSGenerator(args);
  }
  if (emu === 'fbneo') {
    return new FbneoGenerator(args);
  }
  if (emu === 'forceengine') {
    return new ForceEngineGenerator(args);
  }
  if (emu === 'fpinball') {
    return new FpinballGenerator(args);
  }
  if (emu === 'gemrb') {
    return new GemRBGenerator(args);
  }
  if (emu === 'goglauncher') {
    return new ExeLauncherGenerator(args);
  }
  if (emu === 'gopher64') {
    return new Gopher64Generator(args);
  }
  if (emu === 'gsplus') {
    return new GsPlusGenerator(args);
  }
  if (emu === 'gzdoom') {
    return new GZDoomGenerator(args);
  }
  if (emu === 'hatari') {
    return new HatariGenerator(args);
  }
  if (emu === 'jgenesis') {
    return new JgenesisGenerator(args);
  }
  if (emu === 'jynx') {
    return new JynxGenerator(args);
  }
  if (emu === 'jzintv') {
    return new JZintvGenerator(args);
  }
  if (emu === 'kegafusion') {
    return new KegaFusionGenerator(args);
  }
  if (emu === 'kronos') {
    return new KronosGenerator(args);
  }
  if (emu === 'lime3ds') {
    return new Lime3dsGenerator(args);
  }
  if (emu === 'linuxloader') {
    return new LinuxloaderGenerator(args);
  }
  if (emu === 'love') {
    return new LoveGenerator(args);
  }
  if (emu === 'magicengine') {
    return new MagicEngineGenerator(args);
  }
  if (emu === 'mandarine') {
    return new MandarineGenerator(args);
  }
  if (emu === 'mednafen') {
    return new MednafenGenerator(args);
  }
  if (emu === 'melonds') {
    return new MelonDSGenerator(args);
  }
  if (emu === 'mesen') {
    return new MesenGenerator(args);
  }
  if (emu === 'mgba') {
    return new MGBAGenerator(args);
  }
  if (emu === 'mupen64') {
    return new Mupen64Generator(args);
  }
  if (emu === 'n64recomp') {
    return new N64RecompGenerator(args);
  }
  if (emu === 'nes3d') {
    return new Nes3dGenerator(args);
  }
  if (emu === 'nosgba') {
    return new NosGbaGenerator(args);
  }
  if (emu === 'openbor') {
    return new OpenBorGenerator(args);
  }
  if (emu === 'openmsx') {
    return new OpenMSXGenerator(args);
  }
  if (emu === 'oricutron') {
    return new OricutronGenerator(args);
  }
  if (emu === 'phoenix') {
    return new PhoenixGenerator(args);
  }
  if (emu === 'pico8') {
    return new Pico8Generator(args);
  }
  if (emu === 'pinballfx' || emu === 'pinballfx2' || emu === 'pinballfx3' || emu === 'pinballm' || sys === 'pinballfx' || sys === 'pinballfx2' || sys === 'pinballfx3' || sys === 'pinballm') {
    return new PinballFXGenerator(args);
  }
  if (emu === 'play') {
    return new PlayGenerator(args);
  }
  if (emu === 'portslauncher') {
    return new PortsLauncherGenerator(args);
  }
  if (emu === 'project64') {
    return new Project64Generator(args);
  }
  if (emu === 'psxmame') {
    return new PSXMameGenerator(args);
  }
  if (emu === 'raine') {
    return new RaineGenerator(args);
  }
  if (emu === 'raze') {
    return new RazeGenerator(args);
  }
  if (emu === 'retrobatlauncher') {
    return new RetrobatLauncherGenerator(args);
  }
  if (emu === 'ruffle') {
    return new RuffleGenerator(args);
  }
  if (emu === 'scummvm') {
    return new ScummVmGenerator(args);
  }
  if (emu === 'simcoupe') {
    return new SimCoupeGenerator(args);
  }
  if (emu === 'simple64') {
    return new Simple64Generator(args);
  }
  if (emu === 'singe2') {
    return new Singe2Generator(args);
  }
  if (emu === 'snes9x') {
    return new Snes9xGenerator(args);
  }
  if (emu === 'solarus') {
    return new SolarusGenerator(args);
  }
  if (emu === 'ssf') {
    return new SSFGenerator(args);
  }
  if (emu === 'steamlauncher') {
    return new ExeLauncherGenerator(args);
  }
  if (emu === 'stella') {
    return new StellaGenerator(args);
  }
  if (emu === 'sudachi') {
    return new SudachiGenerator(args);
  }
  if (emu === 'suyu') {
    return new SuyuGenerator(args);
  }
  if (emu === 'tsugaru') {
    return new TsugaruGenerator(args);
  }
  if (emu === 'uae') {
    return new UaeGenerator(args);
  }
  if (emu === 'vpinball') {
    return new VPinballGenerator(args);
  }
  if (emu === 'winarcadia') {
    return new WinArcadiaGenerator(args);
  }
  if (emu === 'xm6pro') {
    return new Xm6proGenerator(args);
  }
  if (emu === 'xroar') {
    return new XroarGenerator(args);
  }
  if (emu === 'yabasanshiro') {
    return new YabasanshiroGenerator(args);
  }
  if (emu === 'ymir') {
    return new YmirGenerator(args);
  }
  if (emu === 'yuzu') {
    return new YuzuGenerator(args);
  }
  if (emu === 'zaccariapinball') {
    return new ZaccariaPinballGenerator(args);
  }
  if (emu === 'zesarux') {
    return new ZEsarUXGenerator(args);
  }
  if (emu === 'zinc') {
    return new ZincGenerator(args);
  }
  return new GenericGenerator(args);
}

interface ControllerMonitor {
  id: number;
  hk: number;
  st: number;
}

function getControllerMonitors(parsedArgs: LaunchArgs): ControllerMonitor[] {
  const monitors: ControllerMonitor[] = [];
  const inputConfig = Config.getInputConfig();
  const configs = inputConfig.inputConfigs || [];

  for (let player = 1; player <= 4; player++) {
    const guid = parsedArgs.rawArgs[`-p${player}guid`]?.toLowerCase();
    const name = parsedArgs.rawArgs[`-p${player}name`]?.toLowerCase();
    const indexStr = parsedArgs.rawArgs[`-p${player}index`];

    if (!guid && !indexStr) continue;

    const deviceIndex = indexStr !== undefined ? parseInt(indexStr, 10) : (player - 1);

    let matched = configs.find(c => c.deviceGUID?.toString().toLowerCase() === guid);
    if (!matched && name) {
      matched = configs.find(c => c.deviceName?.toLowerCase() === name);
    }

    if (matched && matched.type === 'joystick') {
      const hotkeyInput = matched.inputs.find(i => i.name === 'hotkey' && i.type === 'button');
      const startInput = matched.inputs.find(i => i.name === 'start' && i.type === 'button');

      if (hotkeyInput && startInput) {
        monitors.push({
          id: deviceIndex,
          hk: hotkeyInput.id,
          st: startInput.id
        });
        Logger.info(`ControllerMonitor: Registered monitor for Player ${player} (Joystick ID: ${deviceIndex}, Hotkey Button: ${hotkeyInput.id}, Start Button: ${startInput.id})`);
      }
    }
  }

  // Fallback: if no controller mapped explicitly in input.json, register standard button IDs
  if (monitors.length === 0) {
    const p1indexStr = parsedArgs.rawArgs[`-p1index`];
    if (p1indexStr !== undefined) {
      const p1Index = parseInt(p1indexStr, 10);
      monitors.push({ id: p1Index, hk: 4, st: 6 }); // PS/Switch layout (Select + Start)
      monitors.push({ id: p1Index, hk: 6, st: 7 }); // Xbox layout (Select + Start)
      Logger.info(`ControllerMonitor: Registered fallback monitors for Joystick ID ${p1Index} (Select=4, Start=6 and Select=6, Start=7)`);
    }
  }

  return monitors;
}

function startHotkeyMonitor(monitors: ControllerMonitor[], onExitRequested: () => void): any {
  if (monitors.length === 0) return null;

  const monitorsArrayStr = monitors.map(m => `@{id=${m.id}; hk=${m.hk}; st=${m.st}}`).join(', ');

  const script = `
$Signature = @"
using System;
using System.Runtime.InteropServices;
public class Win32Joy {
    [DllImport("winmm.dll")]
    public static extern int joyGetPosEx(int uJoyID, ref JOYINFOEX pji);
    [StructLayout(LayoutKind.Sequential)]
    public struct JOYINFOEX {
        public int dwSize;
        public int dwFlags;
        public int dwXpos;
        public int dwYpos;
        public int dwZpos;
        public int dwRpos;
        public int dwUpos;
        public int dwVpos;
        public int dwButtons;
        public int dwButtonNumber;
        public int dwPOV;
        public int dwReserved1;
        public int dwReserved2;
    }
}
"@
Add-Type -TypeDefinition $Signature
$info = New-Object Win32Joy+JOYINFOEX
$info.dwSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
$info.dwFlags = 255

$monitors = @(${monitorsArrayStr})

while ($true) {
    foreach ($m in $monitors) {
        $res = [Win32Joy]::joyGetPosEx($m.id, [ref]$info)
        if ($res -eq 0) {
            $btn = $info.dwButtons
            $hkPressed = ($btn -band (1 -shl $m.hk)) -ne 0
            $stPressed = ($btn -band (1 -shl $m.st)) -ne 0
            if ($hkPressed -and $stPressed) {
                Write-Output "KILL"
                Exit
            }
        }
    }
    Start-Sleep -Milliseconds 100
}
  `;

  try {
    const ps = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'ignore']
    });

    ps.stdin.write(script);
    ps.stdin.end();

    ps.stdout.on('data', (data: any) => {
      const output = data.toString().trim();
      if (output.includes('KILL')) {
        Logger.info(`ControllerMonitor: HOTKEY + START combination detected!`);
        onExitRequested();
      }
    });

    return ps;
  } catch (err) {
    Logger.error('Failed to spawn PowerShell hotkey monitor:', err);
    return null;
  }
}

async function main() {
  const argsList = process.argv.slice(2);
  Logger.info(`--------------------------------------------------------------`);
  Logger.info(`[Startup] Command Line: ${process.argv.join(' ')}`);

  if (argsList.length === 0) {
    Logger.error('No arguments provided. Exiting.');
    process.exit(1);
  }

  const parsedArgs = parseArgs(argsList);
  Logger.info(`Parsed Args - System: ${parsedArgs.system}, Emulator: ${parsedArgs.emulator}, Core: ${parsedArgs.core}`);
  Logger.info(`ROM: ${parsedArgs.rom}`);

  // Load configuration files
  Config.load();

  let mountProcess: any = null;
  let virtualDrive = '';

  try {
    if (parsedArgs.rom && (parsedArgs.rom.toLowerCase().endsWith('.squashfs') || parsedArgs.rom.toLowerCase().endsWith('.wsquashfs'))) {
      virtualDrive = findFreeDriveLetter();
      const retroBatPath = getRetroBatPath();
      const gameName = parse(parsedArgs.rom).name;
      const overlayDir = join(retroBatPath, 'riescade', 'saves', parsedArgs.system, 'squashfs-overlays', gameName);
      const workDir = join(retroBatPath, 'riescade', 'saves', parsedArgs.system, 'squashfs-work', gameName);

      mountProcess = await mountSquashfs(parsedArgs.rom, virtualDrive, overlayDir, workDir);
      const resolved = resolveRomInDrive(virtualDrive, parsedArgs.system);

      Logger.info(`Launcher: Mounted SquashFS, resolved ROM path to: ${resolved}`);
      parsedArgs.rom = resolved;
    }

    // Instantiate correct generator
    const generator = getGenerator(parsedArgs);

    // Configure emulator/files before launching
    await generator.configure();

    if (parsedArgs.flags.includes('configure-only')) {
      Logger.info('Configure only flag detected. Exiting launcher after config phase.');
      process.exit(0);
    }

    // Get launch command
    const { executable, args } = generator.getLaunchCommand();
    Logger.info(`Spawning child process: "${executable}" ${args.join(' ')}`);

    const useShell = executable.toLowerCase().endsWith('.lnk') || 
                     executable.toLowerCase().endsWith('.bat') || 
                     executable.toLowerCase().endsWith('.cmd');

    const spawnExecutable = (useShell && !executable.startsWith('"')) ? `"${executable}"` : executable;

    // Spawn the child process
    const child = spawn(spawnExecutable, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      detached: false,
      cwd: dirname(executable),
      shell: useShell
    });

    Logger.info(`[Running]`);

    // Start controller hotkey exit monitor (only for standalone emulators, i.e., not libretro)
    const isLibRetro = parsedArgs.emulator.toLowerCase() === 'libretro';
    const monitors = isLibRetro ? [] : getControllerMonitors(parsedArgs);
    let psMonitor: any = null;

    if (monitors.length > 0) {
      psMonitor = startHotkeyMonitor(monitors, () => {
        Logger.info(`Hotkey exit requested. Terminating emulator...`);
        try {
          spawn('taskkill', ['/F', '/T', '/PID', child.pid.toString()]);
        } catch (err) {
          Logger.error(`Failed to execute taskkill:`, err);
          child.kill();
        }
      });
    }

    child.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line.trim()) Logger.debug(`[Emulator STDOUT] ${line.trim()}`);
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line.trim()) Logger.error(`[Emulator STDERR] ${line.trim()}`);
      }
    });

    child.on('close', (code) => {
      Logger.info(`Emulator process closed with exit code ${code}`);
      if (psMonitor) {
        try {
          psMonitor.kill();
        } catch (e) {}
      }
      if (mountProcess) {
        unmountSquashfs(mountProcess);
      }
      generator.cleanup();
      process.exit(code ?? 0);
    });

    child.on('error', (err) => {
      Logger.error(`Failed to start emulator:`, err);
      if (psMonitor) {
        try {
          psMonitor.kill();
        } catch (e) {}
      }
      if (mountProcess) {
        unmountSquashfs(mountProcess);
      }
      generator.cleanup();
      process.exit(1);
    });

  } catch (err) {
    Logger.error(`Launcher: Error during configuration or execution:`, err);
    if (mountProcess) {
      try {
        unmountSquashfs(mountProcess);
      } catch (e) {}
    }
    process.exit(1);
  }
}

main().catch((err) => {
  Logger.error(`Unhandled error in main process`, err);
  process.exit(1);
});
