import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { getEmulatorsPath, getRetroBatPath, getStatePath } from './paths.js';
import { Logger } from './logger.js';

export interface LibretroVisuals {
  overlayConfig?: string;
  shaderPreset?: string;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find(path => existsSync(path));
}

function indexedName(romPath: string): string {
  return basename(romPath, extname(romPath))
    .replace(/\s*[\[(][^\])]*[\])]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveBezel(system: string, romPath: string, bezelType: string): string | undefined {
  if (!bezelType || bezelType.toLowerCase() === 'none') return undefined;
  const root = getRetroBatPath();
  const decorationsRoot = join(root, 'riescade', 'decorations');
  const type = bezelType.toLowerCase() === 'auto' ? 'default' : bezelType;
  const rom = basename(romPath, extname(romPath));
  const indexedRomName = indexedName(romPath);
  const candidates: string[] = [];

  for (const name of [rom, indexedRomName]) {
    candidates.push(
      join(decorationsRoot, type, 'games', system, `${name}.png`),
      join(decorationsRoot, type, 'games', `${name}.png`)
    );
  }
  candidates.push(
    join(decorationsRoot, type, system, `${system}.png`),
    join(decorationsRoot, type, 'default.png'),
    join(decorationsRoot, 'default_unglazed', system, `${system}.png`),
    join(decorationsRoot, 'default', system, `${system}.png`)
  );

  return firstExisting(candidates);
}

function ensureOverlayConfig(imagePath: string): string {
  const suppliedCfg = imagePath.replace(/\.png$/i, '.cfg');
  if (existsSync(suppliedCfg)) return suppliedCfg;
  const outputDir = join(getStatePath(), 'retroarch-overlays');
  mkdirSync(outputDir, { recursive: true });
  const safeName = imagePath.replace(/[^a-z0-9]+/gi, '_').slice(-120);
  const output = join(outputDir, `${safeName}.cfg`);
  const escaped = imagePath.replace(/\\/g, '/');
  writeFileSync(output, [
    'overlays = 1',
    `overlay0_overlay = "${escaped}"`,
    'overlay0_full_screen = true',
    'overlay0_descs = 0'
  ].join('\n'), 'utf8');
  return output;
}

function resolveShader(configured: string): string | undefined {
  if (!configured || configured.toLowerCase() === 'none' || configured.toLowerCase() === 'auto') return undefined;
  if (existsSync(configured)) return configured;
  const roots = [
    join(getRetroBatPath(), 'riescade', 'shaders'),
    join(getRetroBatPath(), 'riescade', 'system', 'shaders'),
    join(getEmulatorsPath(), 'retroarch', 'shaders')
  ];
  const extensions = extname(configured) ? [''] : ['.slangp', '.glslp', '.cgp'];
  return firstExisting(roots.flatMap(root => extensions.map(ext => join(root, `${configured}${ext}`))));
}

export function resolveLibretroVisuals(
  system: string,
  romPath: string,
  bezelSetting: string,
  shaderSetting: string
): LibretroVisuals {
  const bezelImage = resolveBezel(system, romPath, bezelSetting);
  const shaderPreset = resolveShader(shaderSetting);
  if (bezelImage) Logger.info(`LibRetro visuals: selected bezel ${bezelImage}`);
  if (shaderPreset) Logger.info(`LibRetro visuals: selected shader ${shaderPreset}`);
  return {
    overlayConfig: bezelImage ? ensureOverlayConfig(bezelImage) : undefined,
    shaderPreset
  };
}
