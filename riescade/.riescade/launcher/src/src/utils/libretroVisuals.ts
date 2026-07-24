import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { getEmulatorsPath, getRetroBatPath, getStatePath } from './paths.js';
import { Logger } from './logger.js';

export interface LibretroVisuals {
  overlayConfig?: string;
  shaderPreset?: string;
  videoFilter?: string;
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

function resolveShaderReference(reference: string, kind: 'slang' | 'glsl'): string | undefined {
  const retroarchShaders = join(getEmulatorsPath(), 'retroarch', 'shaders');
  const extension = kind === 'slang' ? '.slangp' : '.glslp';
  const subfolder = kind === 'slang' ? 'shaders_slang' : 'shaders_glsl';
  const filename = extname(reference) ? reference : `${reference}${extension}`;
  return firstExisting([
    join(retroarchShaders, subfolder, filename),
    join(retroarchShaders, filename)
  ]);
}

function readShaderProfile(profileName: string, system: string, preferGl: boolean): string | undefined {
  const cleanName = profileName.replace(/\.json$/i, '');
  const configPath = join(getRetroBatPath(), 'riescade', 'shaders', `${cleanName}.json`);
  if (!existsSync(configPath)) return undefined;

  let profile: any;
  try {
    profile = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (profile?.$schema !== 'riescade-shader-profile-v1') return undefined;
  const defaults = profile.default || {};
  const specific = profile.systems?.[system.toLowerCase()] || {};
  const candidates: Array<[string | undefined, 'slang' | 'glsl']> = preferGl
    ? [
        [specific.shaderGL, 'glsl'],
        [specific.shader, 'slang'],
        [defaults.shaderGL, 'glsl'],
        [defaults.shader, 'slang']
      ]
    : [
        [specific.shader, 'slang'],
        [specific.shaderGL, 'glsl'],
        [defaults.shader, 'slang'],
        [defaults.shaderGL, 'glsl']
      ];
  for (const [reference, kind] of candidates) {
    if (!reference) continue;
    if (String(reference).toLowerCase() === 'disabled') return undefined;
    const resolved = resolveShaderReference(reference, kind);
    if (resolved) return resolved;
  }
  return undefined;
}

function resolveShader(configured: string, system: string, preferGl: boolean): string | undefined {
  if (!configured || configured.toLowerCase() === 'none' || configured.toLowerCase() === 'auto') return undefined;
  if (existsSync(configured)) return configured;
  const profile = readShaderProfile(configured, system, preferGl);
  if (profile) return profile;
  const roots = [
    join(getRetroBatPath(), 'riescade', 'shaders'),
    join(getEmulatorsPath(), 'retroarch', 'shaders')
  ];
  const extensions = extname(configured) ? [''] : ['.slangp', '.glslp', '.cgp'];
  return firstExisting(roots.flatMap(root => extensions.map(ext => join(root, `${configured}${ext}`))));
}

function resolveVideoFilter(configured: string): string | undefined {
  if (!configured || configured.toLowerCase() === 'none' || configured.toLowerCase() === 'auto') return undefined;
  if (existsSync(configured)) return configured;
  const root = join(getEmulatorsPath(), 'retroarch', 'filters', 'video');
  const filename = extname(configured) ? configured : `${configured}.filt`;
  const candidate = join(root, filename);
  return existsSync(candidate) ? candidate : undefined;
}

export function resolveLibretroVisuals(
  system: string,
  romPath: string,
  bezelSetting: string,
  shaderSetting: string,
  videoFilterSetting: string,
  preferGl = false
): LibretroVisuals {
  const bezelImage = resolveBezel(system, romPath, bezelSetting);
  const shaderPreset = resolveShader(shaderSetting, system, preferGl);
  const videoFilter = resolveVideoFilter(videoFilterSetting);
  if (bezelImage) Logger.info(`LibRetro visuals: selected bezel ${bezelImage}`);
  if (shaderPreset) Logger.info(`LibRetro visuals: selected shader ${shaderPreset}`);
  if (videoFilter) Logger.info(`LibRetro visuals: selected video filter ${videoFilter}`);
  return {
    overlayConfig: bezelImage ? ensureOverlayConfig(bezelImage) : undefined,
    shaderPreset,
    videoFilter
  };
}
