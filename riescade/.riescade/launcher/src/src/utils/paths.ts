import { join, dirname, resolve } from 'path';

const isProduction = !process.execPath.includes('node') && !process.execPath.includes('ts-node');

export function getRetroBatPath(): string {
  if (isProduction) {
    // execPath is in: riescade/riescadeLauncher/riescadeLauncher.exe
    return resolve(dirname(process.execPath), '..', '..');
  }
  // cwd is in: riescade/riescadeLauncher/src
  return resolve(process.cwd(), '..', '..', '..');
}

export function getRiescadePath(): string {
  return join(getRetroBatPath(), 'riescade', '.riescade');
}

export function getConfigsPath(): string {
  return join(getRiescadePath(), 'configs');
}

export function getLogsPath(): string {
  return join(getRiescadePath(), 'logs');
}

export function getEmulatorsPath(): string {
  return join(getRetroBatPath(), 'emulators');
}
