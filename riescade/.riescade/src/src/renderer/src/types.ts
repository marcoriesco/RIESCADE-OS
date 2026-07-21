export type ToolAppId = "saves" | "settings" | "achievements" | "database" | "all" | "favorites" | "collections";

export type System = {
  name: string;
  fullname: string;
  path: string;
  extension: string;
  command: string;
  platform: string;
  theme: string;
  logo: string;
  art: string;
  hardware?: string;
  gamecount?: number;
  emulators?: any[];
};

export type Game = {
  id: string;
  name: string;
  desc?: string;
  image?: string;
  video?: string;
  marquee?: string;
  thumbnail?: string;
  rating?: number;
  releasedate?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  players?: string;
  favorite?: boolean;
  playcount?: number;
  lastplayed?: string;
  path: string;
  system: string;
  fanart?: string;
  wheel?: string;
  emulator?: string;
  core?: string;
  mix?: string;
  manual?: string;
  magazine?: string;
  map?: string;
  gamefamily?: string;
  arcadesystem?: string;
  languages?: string;
  region?: string;
  lang?: string;
  screenshot?: string;
  cover?: string;
  cover3d?: string;
  coverback?: string;
  cartridge?: string;
  logo?: string;
  title?: string;
  sortname?: string;
  tags?: string;
  crc32?: string;
  md5?: string;
  gametime?: number;
  scrapName?: string;
  scrapDate?: string;
  hidden?: boolean;
  kidgame?: boolean;
  isCollectionFolder?: boolean;
  gameCount?: number;
};


export type WinState = {
  id: string;
  type: "system" | "tool";
  appId: string; // system name or tool app id
  x: number; y: number; w: number; h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prev?: { x: number; y: number; w: number; h: number };
};

export type SettingsCtx = {
  getSetting: (name: string, fallback?: any) => string;
  isBoolOn: (name: string) => boolean;
  saveSetting: (name: string, value: any, type?: "string" | "bool" | "int" | "float") => void;
};

export function hasMultipleEmulators(system?: System | null): boolean {
  if (!system || !system.emulators || system.emulators.length === 0) return false;
  let count = 0;
  system.emulators.forEach((emu: any) => {
    if (emu.cores && emu.cores.length > 0) {
      count += emu.cores.length;
    } else {
      count += 1;
    }
  });
  return count > 1;
}

