import { spawn, execSync, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { getRetroBatPath } from './paths.js';
import { Logger } from './logger.js';
import { Config } from '../config.js';

export function findFreeDriveLetter(): string {
  try {
    const output = execSync('fsutil fsinfo drives').toString();
    const activeDrives = (output.match(/[A-Z]:/gi) || []).map(d => d.toUpperCase());
    
    // Scan Z down to D as in C# EmulatorLauncher
    for (let i = 90; i >= 68; i--) {
      const letter = String.fromCharCode(i);
      if (!activeDrives.includes(letter + ':')) {
        return letter + ':';
      }
    }
  } catch (err) {
    Logger.error('SquashFS: Failed to get active drives using fsutil, trying fallback', err);
  }
  
  // Fallback: fast loop check using existsSync
  for (let i = 90; i >= 68; i--) {
    const letter = String.fromCharCode(i);
    const drivePath = letter + ':\\';
    try {
      if (!existsSync(drivePath)) {
        return letter + ':';
      }
    } catch (e) {}
  }

  throw new Error('No virtual drive letter available.');
}

export function mountSquashfs(
  squashfsFile: string,
  driveLetter: string,
  overlayDir: string,
  workDir: string
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const retroBatPath = getRetroBatPath();
    const mounterExe = join(retroBatPath, 'riescade', 'riescadeLauncher', 'tools', 'mountsquashfs.exe');

    if (!existsSync(mounterExe)) {
      return reject(new Error(`mountsquashfs.exe not found at ${mounterExe}`));
    }

    try {
      if (!existsSync(overlayDir)) {
        mkdirSync(overlayDir, { recursive: true });
      }
      if (!existsSync(workDir)) {
        mkdirSync(workDir, { recursive: true });
      }
    } catch (err) {
      Logger.error(`SquashFS: Failed to create overlay or work directories`, err);
    }

    Logger.info(`SquashFS: Mounting ${squashfsFile} at ${driveLetter}`);
    Logger.info(`SquashFS: Overlay dir: ${overlayDir}, Work dir: ${workDir}`);

    const args = [
      '-drive', driveLetter,
      '-overlay', overlayDir,
      '-extractionpath', workDir,
      squashfsFile
    ];

    const proc = spawn(mounterExe, args, {
      detached: true,
      stdio: 'ignore'
    });

    // Wait until the drive is mounted and readable
    let attempts = 0;
    const maxAttempts = 100; // 5 seconds (100 * 50ms)
    const interval = setInterval(() => {
      attempts++;
      if (existsSync(join(driveLetter, '\\'))) {
        clearInterval(interval);
        Logger.info(`SquashFS: Mount successful at ${driveLetter}`);
        resolve(proc);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        // Terminate mount process if it timed out
        try {
          proc.kill('SIGKILL');
        } catch (e) {}
        reject(new Error(`SquashFS: Timeout waiting for drive ${driveLetter} to mount`));
      }
    }, 50);
  });
}

export function unmountSquashfs(proc: ChildProcess): void {
  if (!proc) return;
  Logger.info(`SquashFS: Unmounting SquashFS (killing mount process PID ${proc.pid})`);
  try {
    execSync(`taskkill /F /T /PID ${proc.pid}`);
  } catch (e) {
    try {
      proc.kill('SIGKILL');
    } catch (err) {}
  }
}

export function resolveRomInDrive(driveLetter: string, systemName: string): string {
  const rootPath = join(driveLetter, '\\');
  const files = readdirSync(rootPath);

  // 1. If it's a PC/Windows system (e.g. 'windows', 'teknoparrot', 'unity', 'windows9x'), look for executables (.exe) only
  const isPcSystem = ['windows', 'teknoparrot', 'unity', 'windows9x'].includes(systemName.toLowerCase());
  if (isPcSystem) {
    const exeFiles = files.filter(f => f.toLowerCase().endsWith('.exe'));

    if (exeFiles.length === 1) {
      return join(rootPath, exeFiles[0]);
    } else if (exeFiles.length > 1) {
      // Prioritize non-setup/config/install/uninstall files
      const candidates = exeFiles.filter(f => {
        const low = f.toLowerCase();
        return !low.includes('config') && !low.includes('setup') && !low.includes('install') && !low.includes('uninst');
      });
      if (candidates.length > 0) {
        return join(rootPath, candidates[0]);
      }
      return join(rootPath, exeFiles[0]);
    }
  }

  // 2. Get system extensions from systems.json
  const systemsData = Config.getSystems();
  const systems = systemsData?.systems || [];
  const system = systems.find((s: any) => s.name.toLowerCase() === systemName.toLowerCase());
  
  if (system && system.extension) {
    const allowedExtensions = system.extension
      .toLowerCase()
      .split(/\s+/)
      .filter((ext: string) => ext && ext !== '.squashfs' && ext !== '.wsquashfs');

    // Search for files in the drive matching allowed extensions
    for (const ext of allowedExtensions) {
      const matched = files.find(f => f.toLowerCase().endsWith(ext));
      if (matched) {
        return join(rootPath, matched);
      }
    }
  }

  // 3. Fallback: return the first file or directory in the drive that isn't a system file
  const fallback = files.find(f => !f.startsWith('.') && f.toLowerCase() !== 'autorun.inf');
  if (fallback) {
    return join(rootPath, fallback);
  }

  return rootPath;
}
