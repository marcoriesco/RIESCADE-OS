import { spawn } from 'child_process';
import { Logger } from './utils/logger.js';
import { Config } from './config.js';
import { LaunchArgs } from './types.js';
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
import { Rpcs3Generator } from './generators/Rpcs3Generator.js';
import { CemuGenerator } from './generators/CemuGenerator.js';
import { PpssppGenerator } from './generators/PpssppGenerator.js';
import { FlycastGenerator } from './generators/FlycastGenerator.js';
import { XemuGenerator } from './generators/XemuGenerator.js';
import { BigPemuGenerator } from './generators/BigPemuGenerator.js';
import { Model2Generator } from './generators/Model2Generator.js';
import { Model3Generator } from './generators/Model3Generator.js';
import { RedreamGenerator } from './generators/RedreamGenerator.js';

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

  return {
    system: rawArgs['-system'] || '',
    emulator: rawArgs['-emulator'] || '',
    core: rawArgs['-core'] || '',
    rom: rawArgs['-rom'] || '',
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
    rawArgs,
    flags,
  };
}

function getGenerator(args: LaunchArgs): BaseGenerator {
  const emu = args.emulator.toLowerCase();
  const sys = args.system.toLowerCase();

  if (emu === 'libretro' || emu === 'angle') {
    return new LibRetroGenerator(args);
  }
  if (emu === 'pcsx2' || emu === 'pcsx2qt' || emu === 'pcsx2-16' || emu === 'ps2' || sys === 'ps2') {
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
  if (emu === 'xenia' || emu === 'xenia-canary' || sys === 'xbox360') {
    return new XeniaGenerator(args);
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

  // Instantiate correct generator
  const generator = getGenerator(parsedArgs);

  // Configure emulator/files before launching
  await generator.configure();

  // Get launch command
  const { executable, args } = generator.getLaunchCommand();
  Logger.info(`Spawning child process: "${executable}" ${args.join(' ')}`);

  // Spawn the child process
  const child = spawn(executable, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    detached: false
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
    generator.cleanup();
    process.exit(1);
  });
}

main().catch((err) => {
  Logger.error(`Unhandled error in main process`, err);
  process.exit(1);
});
