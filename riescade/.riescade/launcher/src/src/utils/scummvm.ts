import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, extname, join } from 'path';

export interface ScummVmMarker {
  markerPath: string;
  target: string;
}

function collectMarkers(directory: string, depth = 0): string[] {
  if (depth > 3) return [];

  const markers: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.scummvm')) {
      markers.push(path);
    } else if (entry.isDirectory()) {
      markers.push(...collectMarkers(path, depth + 1));
    }
  }
  return markers;
}

export function resolveScummVmMarker(romPath: string): ScummVmMarker {
  if (!existsSync(romPath)) {
    throw new Error(`A pasta ou arquivo do jogo ScummVM não existe: ${romPath}`);
  }

  const stat = statSync(romPath);
  let markerPath = romPath;
  if (stat.isDirectory()) {
    const markers = collectMarkers(romPath)
      .sort((left, right) => left.localeCompare(right, 'pt-BR'));
    if (markers.length === 0) {
      throw new Error(`Nenhum arquivo .scummvm foi encontrado dentro de ${romPath}`);
    }

    const expectedName = `${basename(romPath, extname(romPath))}.scummvm`.toLowerCase();
    markerPath = markers.find(path => basename(path).toLowerCase() === expectedName) || markers[0];
  } else if (extname(romPath).toLowerCase() !== '.scummvm') {
    throw new Error(`O jogo ScummVM não aponta para uma pasta .game nem para um arquivo .scummvm: ${romPath}`);
  }

  const target = readFileSync(markerPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  if (!target || target.length > 256 || /[\u0000-\u001f\s]/.test(target)) {
    throw new Error(`O arquivo ${markerPath} não contém um short ID válido do ScummVM.`);
  }

  return { markerPath, target };
}
