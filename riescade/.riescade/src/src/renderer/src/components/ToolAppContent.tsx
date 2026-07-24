import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronRight, Search, Folder, Star, User, Shield, Settings, Palette, Gamepad2, Volume2, Cpu, Info, Database, Trash2, Edit3, X, ChevronLeft, Filter, HardDrive, RefreshCw, Eye, EyeOff, Check, ChevronDown, Save, Trophy, Loader2, Sliders, CheckCircle, Circle, Wrench, Bug, Copy, Download, Activity } from "lucide-react";
import { System, SettingsCtx } from "../types";
import { TOOL_APPS, getSystemTheme } from "../constants";
import {
  SettingGroup, SettingToggle, SettingSelect, SettingSlider, SettingInput, SettingInfo
} from "./SettingsComponents";
import { EmulatorSettingsPanel } from "./EmulatorSettingsPanel";
import { ScrollArea } from "./ScrollArea";
import * as Select from "@radix-ui/react-select";

const DatabaseApp = React.lazy(() => import("./DatabaseApp"));
const SettingsControls = React.lazy(() => import("./settings/SettingsControls"));

const WIZARD_STEPS = [
  { key: 'a', label: 'Botão A / Confirmação' },
  { key: 'b', label: 'Botão B / Voltar' },
  { key: 'x', label: 'Botão X' },
  { key: 'y', label: 'Botão Y' },
  { key: 'leftshoulder', label: 'Bumper Esquerdo (LB)' },
  { key: 'rightshoulder', label: 'Bumper Direito (RB)' },
  { key: 'lefttrigger', label: 'Gatilho Esquerdo (LT)', type: 'axis' },
  { key: 'righttrigger', label: 'Gatilho Direito (RT)', type: 'axis' },
  { key: 'back', label: 'Select / Back' },
  { key: 'start', label: 'Start' },
  { key: 'leftstick', label: 'Stick Esquerdo (L3/Click)' },
  { key: 'rightstick', label: 'Stick Direito (R3/Click)' },
  { key: 'dpad_up', label: 'D-Pad Cima' },
  { key: 'dpad_down', label: 'D-Pad Baixo' },
  { key: 'dpad_left', label: 'D-Pad Esquerda' },
  { key: 'dpad_right', label: 'D-Pad Direita' },
  { key: 'leftx', label: 'Stick Esquerdo (Eixo Horizontal X)', type: 'axis' },
  { key: 'lefty', label: 'Stick Esquerdo (Eixo Vertical Y)', type: 'axis' },
  { key: 'rightx', label: 'Stick Direito (Eixo Horizontal X)', type: 'axis' },
  { key: 'righty', label: 'Stick Direito (Eixo Vertical Y)', type: 'axis' },
  { key: 'hotkey', label: 'Botão Hotkey (Atalho)' }
];

function RadixSelect({
  value,
  onValueChange,
  options,
  placeholder = "Selecionar..."
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className="flex items-center justify-between gap-1.5 bg-[#121620] border border-white/10 rounded-md px-2.5 py-1 text-xs text-white/90 hover:bg-white/5 hover:border-accent transition cursor-pointer focus:outline-none focus:border-accent">
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="w-3 h-3 text-white/40" />
        </Select.Icon>
      </Select.Trigger>
      
      <Select.Portal>
        <Select.Content className="bg-[#121620] border border-white/10 rounded-md shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-100 min-w-[var(--radix-select-trigger-width)]">
          <Select.Viewport className="p-1">
            {options.map(opt => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center justify-between pl-8 pr-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/5 rounded-md outline-none cursor-pointer select-none data-[state=checked]:text-white data-[state=checked]:bg-white/5"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
                <Select.ItemIndicator className="absolute left-2 flex items-center justify-center">
                  <Check className="w-3 h-3 text-accent" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}


const SETTINGS_TABS = [
  { id: "conta", name: "Minha Conta", icon: User },
  { id: "emuladores", name: "Emuladores", icon: Gamepad2 },
  { id: "personalizacao", name: "Personalização", icon: Palette },
  { id: "controles", name: "Controles", icon: Gamepad2 },
  { id: "audio", name: "Áudio", icon: Volume2 },
  { id: "scraper", name: "Scraper", icon: Cpu },
  { id: "avancado", name: "Avançado", icon: Cpu },
  { id: "sobre", name: "Sobre", icon: Info }
];

const EMULATOR_NAMES: Record<string, string> = {
  "2ship": "2 Ship 2 Harkinian (Zelda MM)",
  "altirra": "Altirra (Atari 8-bit / 5200)",
  "amigaforever": "Amiga Forever",
  "applewin": "AppleWin (Apple II)",
  "arcadeflashweb": "Arcade Flash Web",
  "ares": "Ares (Multi-sistema)",
  "azahar": "Azahar (Nintendo 3DS)",
  "bigpemu": "BigPEmu (Atari Jaguar)",
  "bizhawk": "BizHawk (Multi-sistema)",
  "bstone": "Blake Stone (BSOne Engine)",
  "bsyndrome": "Blood Syndrome",
  "capriceforever": "Caprice Forever (Amstrad CPC)",
  "cdogs": "C-Dogs SDL",
  "cemu": "Cemu (Wii U)",
  "cgenius": "Commander Genius (Commander Keen)",
  "chihiro-gun": "Chihiro Gun (Sega Chihiro Arcade)",
  "chihiro": "Chihiro (Sega Chihiro Arcade)",
  "citra-canary": "Citra Canary (Nintendo 3DS)",
  "citra": "Citra (Nintendo 3DS)",
  "citron": "Citron (Nintendo Switch)",
  "corsixth": "CorsixTH (Theme Hospital)",
  "cxbx": "Cxbx-Reloaded (Xbox Original)",
  "daphne": "Daphne (Laserdisc Arcade)",
  "demul": "Demul (Arcade / Dreamcast / Naomi)",
  "desmume": "DeSmuME (Nintendo DS)",
  "dhewm3": "dhewm3 (Doom 3 Engine)",
  "dolphin-triforce": "Dolphin Triforce (Arcade)",
  "dolphin": "Dolphin (GameCube & Wii)",
  "dosbox-pure": "DOSBox Pure (MS-DOS)",
  "dosbox-staging": "DOSBox Staging (MS-DOS)",
  "dosbox": "DOSBox (MS-DOS)",
  "duckstation": "DuckStation (PlayStation 1)",
  "dusklight": "Dusklight Engine",
  "eden": "Eden (Nintendo Switch)",
  "eden-nightly": "Eden Nightly (Nintendo Switch)",
  "eduke32": "EDuke32 (Duke Nukem 3D)",
  "eka2l1": "EKA2L1 (Symbian / N-Gage)",
  "exodos": "eXoDOS (MS-DOS Collection)",
  "exowin3x": "eXoWin3x (Windows 3.x)",
  "exowin9x": "eXoWin9x (Windows 9x)",
  "fbneo": "FinalBurn Neo (Arcade / NeoGeo)",
  "flycast": "Flycast (Dreamcast / Naomi / Atomiswave)",
  "fpinball": "Future Pinball",
  "gemrb": "GemRB (Infinity Engine)",
  "ghostship": "Ghostship Engine",
  "gopher64": "Gopher64 (Nintendo 64)",
  "groovymame": "GroovyMAME (CRT Arcade)",
  "gsplus": "GSplus (Apple IIGS)",
  "gzdoom": "GZDoom (Doom Engine)",
  "hatari": "Hatari (Atari ST / STE / TT)",
  "hbmame": "HBMAME (Homebrew MAME)",
  "hypseus": "Hypseus Singe (Laserdisc)",
  "ikemen": "IKEMEN GO (Fighting Engine)",
  "jgenesis": "jGenesis (Sega Genesis / Master System)",
  "jynx": "Jynx (Camputers Lynx)",
  "jzintv": "jzIntv (Intellivision)",
  "kega-fusion": "Kega Fusion (Mega Drive / Genesis)",
  "kronos": "Kronos (Sega Saturn)",
  "lime3ds": "Lime3DS (Nintendo 3DS)",
  "linuxloader": "Linux Loader Engine",
  "m2emulator": "Model 2 Emulator (Sega Model 2)",
  "magicengine": "MagicEngine (PC Engine / TurboGrafx-16)",
  "mame64": "MAME 64-bit (Arcade)",
  "mandarine": "Mandarine (Nintendo 3DS)",
  "mednafen": "Mednafen (Multi-sistema)",
  "melonds": "melonDS (Nintendo DS)",
  "mesen": "Mesen (NES / SNES / GB)",
  "mgba": "mGBA (Game Boy Advance)",
  "model2": "Model 2 Emulator (Sega Model 2)",
  "mugen": "M.U.G.E.N (Fighting Engine)",
  "mupen64": "Mupen64Plus (Nintendo 64)",
  "n64recomplauncher": "N64 Recomp Launcher",
  "nosgba": "No$GBA (Nintendo DS / GBA)",
  "openbor": "OpenBOR (Beat 'Em Up Engine)",
  "opengoal": "OpenGOAL (Jak & Daxter)",
  "openjazz": "OpenJazz (Jazz Jackrabbit)",
  "openmsx": "openMSX (MSX / MSX2)",
  "oricutron": "Oricutron (Oric 1 / Atmos)",
  "pcsx2": "PCSX2 (PlayStation 2)",
  "pcsx2x6": "PCSX2 64-bit (PlayStation 2)",
  "pcsx2-nightly": "PCSX2 Nightly (PlayStation 2)",
  "pdark": "Perfect Dark PC Port",
  "phoenix": "Phoenix (3DO / Jaguar)",
  "pico8": "PICO-8 (Fantasy Console)",
  "pinballfx": "Pinball FX",
  "pinballfx2": "Pinball FX2",
  "pinballfx3": "Pinball FX3",
  "pinballm": "Pinball M",
  "play": "Play! (PlayStation 2)",
  "powerbomberman": "Power Bomberman",
  "ppsspp": "PPSSPP (PlayStation Portable)",
  "project64": "Project64 (Nintendo 64)",
  "psxmame": "PSXMAME (PlayStation Arcade)",
  "raine": "Raine (Arcade 68000)",
  "raze": "Raze (Build Engine)",
  "redream": "Redream (Sega Dreamcast)",
  "retroarch": "RetroArch (Libretro Frontend)",
  "rpcs3": "RPCS3 (PlayStation 3)",
  "rtcw": "Return to Castle Wolfenstein (iRTCW)",
  "ruffle": "Ruffle (Flash Player)",
  "ryujinx": "Ryujinx (Nintendo Switch)",
  "scummvm": "ScummVM (Adventure / Point&Click)",
  "shadps4": "shadPS4 (PlayStation 4)",
  "simcoupe": "SimCoupe (SAM Coupé)",
  "simple64": "simple64 (Nintendo 64)",
  "singe2": "Singe 2 (Laserdisc Arcade)",
  "snes9x": "Snes9x (Super Nintendo)",
  "soh": "Ship of Harkinian (Zelda OoT)",
  "solarus": "Solarus Engine (ARPG)",
  "solarus2": "Solarus 2 Engine",
  "sonic3air": "Sonic 3 A.I.R.",
  "sonicmania": "Sonic Mania",
  "sonicretro": "Sonic Retro Engines",
  "sonicretrocd": "Sonic Retro CD Engine",
  "ssf": "SSF (Sega Saturn)",
  "starship": "Starship Engine",
  "stella": "Stella (Atari 2600)",
  "sudachi": "Sudachi (Nintendo Switch)",
  "supermodel": "Supermodel (Sega Model 3)",
  "suyu": "Suyu (Nintendo Switch)",
  "teknoparrot": "TeknoParrot (Arcade)",
  "theforceengine": "The Force Engine (Star Wars Dark Forces)",
  "tsugaru": "Tsugaru (FM Towns)",
  "vita3k": "Vita3K (PlayStation Vita)",
  "vkquake": "vkQuake (Vulkan Quake)",
  "vkquake2": "vkQuake2 (Vulkan Quake II)",
  "vpinball": "Visual Pinball X (VPX)",
  "winarcadia": "WinArcadia (Signetics 2650)",
  "windows": "Windows / PC Games Nativos",
  "winuae": "WinUAE (Amiga)",
  "xash3d": "Xash3D FWGS (Half-Life Engine)",
  "xemu": "xemu (Xbox Original)",
  "xenia-canary": "Xenia Canary (Xbox 360)",
  "xenia-edge": "Xenia Edge (Xbox 360)",
  "xenia-manager": "Xenia Manager",
  "xenia": "Xenia (Xbox 360)",
  "xm6pro": "XM6 Pro (Sharp X68000)",
  "xroar": "XRoar (Dragon 32/64 / TRS-80)",
  "yabasanshiro": "Yaba Sanshiro (Sega Saturn)",
  "ymir": "YMIR Engine",
  "yuzu-early-access": "Yuzu Early Access (Switch)",
  "yuzu": "Yuzu (Nintendo Switch)",
  "zaccariapinball": "Zaccaria Pinball",
  "zesarux": "ZEsarUX (ZX Spectrum / Amstrad)",
  "zinc": "ZiNc (Arcade Sony ZN-1/ZN-2)",
  "global": "Geral / Globais",
};

const EMULATOR_DESCRIPTIONS: Record<string, string> = {
  "2ship": "Ajuste os parâmetros do port nativo de PC 2 Ship 2 Harkinian (Zelda Majora's Mask).",
  "altirra": "Ajuste os parâmetros específicos do emulador Altirra.",
  "amigaforever": "Ajuste os parâmetros específicos do Amiga Forever.",
  "applewin": "Ajuste os parâmetros específicos do emulador AppleWin.",
  "arcadeflashweb": "Ajuste os parâmetros específicos para jogos em Flash/Web Arcade.",
  "ares": "Ajuste os parâmetros específicos do emulador Ares.",
  "azahar": "Ajuste os parâmetros específicos do emulador Azahar.",
  "bigpemu": "Ajuste os parâmetros específicos do emulador BigPEmu.",
  "bizhawk": "Ajuste os parâmetros específicos do emulador BizHawk.",
  "bstone": "Ajuste os parâmetros do port nativo BStone para Blake Stone.",
  "bsyndrome": "Ajuste os parâmetros para a engine Blood Syndrome.",
  "capriceforever": "Ajuste os parâmetros específicos do emulador Caprice Forever.",
  "cdogs": "Ajuste os parâmetros para a engine C-Dogs SDL.",
  "cemu": "Ajuste os parâmetros específicos do emulador Cemu (Wii U).",
  "cgenius": "Ajuste os parâmetros da engine Commander Genius.",
  "chihiro-gun": "Ajuste os parâmetros de jogos de tiro em arcade Sega Chihiro.",
  "chihiro": "Ajuste os parâmetros do emulador de arcade Sega Chihiro.",
  "citra-canary": "Ajuste os parâmetros específicos do Citra Canary (3DS).",
  "citra": "Ajuste os parâmetros específicos do emulador Citra (3DS).",
  "citron": "Ajuste os parâmetros específicos do emulador Citron.",
  "corsixth": "Ajuste os parâmetros da engine CorsixTH.",
  "cxbx": "Ajuste os parâmetros específicos do emulador Cxbx-Reloaded.",
  "daphne": "Ajuste os parâmetros específicos do emulador Daphne (Dragon's Lair / Space Ace).",
  "demul": "Ajuste os parâmetros específicos do emulador Demul.",
  "desmume": "Ajuste os parâmetros específicos do emulador DeSmuME.",
  "dhewm3": "Ajuste os parâmetros da engine dhewm3 para Doom 3.",
  "dolphin-triforce": "Ajuste os parâmetros do Dolphin Triforce Arcade.",
  "dolphin": "Ajuste os parâmetros específicos do emulador Dolphin.",
  "dosbox-pure": "Ajuste os parâmetros do core DOSBox Pure.",
  "dosbox-staging": "Ajuste os parâmetros do emulador DOSBox Staging.",
  "dosbox": "Ajuste os parâmetros específicos do emulador DOSBox.",
  "duckstation": "Ajuste os parâmetros específicos do emulador DuckStation (PS1).",
  "dusklight": "Ajuste os parâmetros específicos da engine Dusklight.",
  "eden": "Ajuste os parâmetros específicos do emulador Eden.",
  "eden-nightly": "Ajuste os parâmetros do emulador Eden Nightly.",
  "eduke32": "Ajuste os parâmetros da engine EDuke32.",
  "eka2l1": "Ajuste os parâmetros específicos do emulador EKA2L1.",
  "exodos": "Ajuste os parâmetros para a coleção eXoDOS.",
  "exowin3x": "Ajuste os parâmetros para jogos Windows 3.x.",
  "exowin9x": "Ajuste os parâmetros para jogos Windows 9x.",
  "fbneo": "Ajuste os parâmetros específicos do FinalBurn Neo.",
  "flycast": "Ajuste os parâmetros específicos do emulador Flycast.",
  "fpinball": "Ajuste os parâmetros específicos do Future Pinball.",
  "gemrb": "Ajuste os parâmetros da engine GemRB (Baldur's Gate / Icewind Dale).",
  "ghostship": "Ajuste os parâmetros da engine Ghostship.",
  "gopher64": "Ajuste os parâmetros específicos do emulador Gopher64.",
  "groovymame": "Ajuste os parâmetros do GroovyMAME para displays CRT.",
  "gsplus": "Ajuste os parâmetros específicos do emulador GSplus.",
  "gzdoom": "Ajuste os parâmetros da engine GZDoom.",
  "hatari": "Ajuste os parâmetros específicos do emulador Hatari.",
  "hbmame": "Ajuste os parâmetros do Homebrew MAME.",
  "hypseus": "Ajuste os parâmetros do emulador Hypseus Singe.",
  "ikemen": "Ajuste os parâmetros da engine IKEMEN GO.",
  "jgenesis": "Ajuste os parâmetros específicos do emulador jGenesis.",
  "jynx": "Ajuste os parâmetros do emulador Jynx.",
  "jzintv": "Ajuste os parâmetros específicos do emulador jzIntv.",
  "kega-fusion": "Ajuste os parâmetros do emulador Kega Fusion.",
  "kronos": "Ajuste os parâmetros específicos do emulador Kronos.",
  "lime3ds": "Ajuste os parâmetros específicos do emulador Lime3DS.",
  "linuxloader": "Ajuste os parâmetros do carregador Linux.",
  "m2emulator": "Ajuste os parâmetros do Sega Model 2 Emulator.",
  "magicengine": "Ajuste os parâmetros do MagicEngine.",
  "mame64": "Ajuste os parâmetros específicos do emulador MAME 64-bit.",
  "mandarine": "Ajuste os parâmetros do emulador Mandarine.",
  "mednafen": "Ajuste os parâmetros específicos do emulador Mednafen.",
  "melonds": "Ajuste os parâmetros específicos do emulador melonDS.",
  "mesen": "Ajuste os parâmetros específicos do emulador Mesen.",
  "mgba": "Ajuste os parâmetros específicos do emulador mGBA.",
  "model2": "Ajuste os parâmetros do Sega Model 2 Emulator.",
  "mugen": "Ajuste os parâmetros da engine M.U.G.E.N.",
  "mupen64": "Ajuste os parâmetros específicos do Mupen64Plus.",
  "n64recomplauncher": "Ajuste os parâmetros do N64 Recomp Launcher.",
  "nosgba": "Ajuste os parâmetros do emulador No$GBA.",
  "openbor": "Ajuste os parâmetros da engine OpenBOR.",
  "opengoal": "Ajuste os parâmetros da engine OpenGOAL.",
  "openjazz": "Ajuste os parâmetros da engine OpenJazz.",
  "openmsx": "Ajuste os parâmetros específicos do emulador openMSX.",
  "oricutron": "Ajuste os parâmetros específicos do Oricutron.",
  "pcsx2": "Ajuste os parâmetros específicos do emulador PCSX2.",
  "pcsx2x6": "Ajuste os parâmetros do PCSX2 64-bit.",
  "pcsx2-nightly": "Ajuste os parâmetros do PCSX2 Nightly.",
  "pdark": "Ajuste os parâmetros do port nativo de PC de Perfect Dark.",
  "phoenix": "Ajuste os parâmetros do emulador Phoenix.",
  "pico8": "Ajuste os parâmetros da fantasy console PICO-8.",
  "pinballfx": "Ajuste os parâmetros específicos do Pinball FX.",
  "pinballfx2": "Ajuste os parâmetros específicos do Pinball FX2.",
  "pinballfx3": "Ajuste os parâmetros específicos do Pinball FX3.",
  "pinballm": "Ajuste os parâmetros específicos do Pinball M.",
  "play": "Ajuste os parâmetros específicos do emulador Play!.",
  "powerbomberman": "Ajuste os parâmetros do jogo Power Bomberman.",
  "ppsspp": "Ajuste os parâmetros específicos do emulador PPSSPP.",
  "project64": "Ajuste os parâmetros específicos do Project64.",
  "psxmame": "Ajuste os parâmetros do emulador PSXMAME.",
  "raine": "Ajuste os parâmetros específicos do emulador Raine.",
  "raze": "Ajuste os parâmetros da engine Raze.",
  "redream": "Ajuste os parâmetros específicos do emulador Redream.",
  "retroarch": "Configurações globais de emulação, vídeo, shaders e mais.",
  "rpcs3": "Ajuste os parâmetros específicos do emulador RPCS3.",
  "rtcw": "Ajuste os parâmetros para Return to Castle Wolfenstein.",
  "ruffle": "Ajuste os parâmetros do emulador de Flash Ruffle.",
  "ryujinx": "Ajuste os parâmetros específicos do emulador Ryujinx.",
  "scummvm": "Ajuste os parâmetros do ScummVM.",
  "shadps4": "Ajuste os parâmetros específicos do emulador shadPS4.",
  "simcoupe": "Ajuste os parâmetros do emulador SimCoupe.",
  "simple64": "Ajuste os parâmetros específicos do emulador simple64.",
  "singe2": "Ajuste os parâmetros do emulador Singe 2.",
  "snes9x": "Ajuste os parâmetros específicos do emulador Snes9x.",
  "soh": "Ajuste os parâmetros do port nativo Ship of Harkinian.",
  "solarus": "Ajuste os parâmetros da engine Solarus.",
  "solarus2": "Ajuste os parâmetros da engine Solarus 2.",
  "sonic3air": "Ajuste os parâmetros do Sonic 3 Angel Island Revisited.",
  "sonicmania": "Ajuste os parâmetros para Sonic Mania.",
  "sonicretro": "Ajuste os parâmetros das engines Sonic Retro.",
  "sonicretrocd": "Ajuste os parâmetros da engine Sonic Retro CD.",
  "ssf": "Ajuste os parâmetros específicos do emulador SSF.",
  "starship": "Ajuste os parâmetros da engine Starship.",
  "stella": "Ajuste os parâmetros específicos do emulador Stella.",
  "sudachi": "Ajuste os parâmetros específicos do emulador Sudachi.",
  "supermodel": "Ajuste os parâmetros do emulador Supermodel.",
  "suyu": "Ajuste os parâmetros específicos do emulador Suyu.",
  "teknoparrot": "Ajuste os parâmetros específicos do emulador TeknoParrot.",
  "theforceengine": "Ajuste os parâmetros da engine The Force Engine.",
  "tsugaru": "Ajuste os parâmetros do emulador Tsugaru.",
  "vita3k": "Ajuste os parâmetros específicos do emulador Vita3K.",
  "vkquake": "Ajuste os parâmetros do vkQuake.",
  "vkquake2": "Ajuste os parâmetros do vkQuake2.",
  "vpinball": "Ajuste os parâmetros do Visual Pinball X.",
  "winarcadia": "Ajuste os parâmetros do emulador WinArcadia.",
  "windows": "Configurações e parâmetros para jogos nativos de Windows.",
  "winuae": "Ajuste os parâmetros específicos do emulador WinUAE.",
  "xash3d": "Ajuste os parâmetros da engine Xash3D.",
  "xemu": "Ajuste os parâmetros específicos do emulador xemu.",
  "xenia-canary": "Ajuste os parâmetros do emulador Xenia Canary.",
  "xenia-edge": "Ajuste os parâmetros do emulador Xenia Edge.",
  "xenia-manager": "Ajuste os parâmetros do Xenia Manager.",
  "xenia": "Ajuste os parâmetros específicos do emulador Xenia.",
  "xm6pro": "Ajuste os parâmetros do emulador XM6 Pro.",
  "xroar": "Ajuste os parâmetros do emulador XRoar.",
  "yabasanshiro": "Ajuste os parâmetros do emulador Yaba Sanshiro.",
  "ymir": "Ajuste os parâmetros da engine YMIR.",
  "yuzu-early-access": "Ajuste os parâmetros do Yuzu Early Access.",
  "yuzu": "Ajuste os parâmetros específicos do emulador Yuzu.",
  "zaccariapinball": "Ajuste os parâmetros do Zaccaria Pinball.",
  "zesarux": "Ajuste os parâmetros do emulador ZEsarUX.",
  "zinc": "Ajuste os parâmetros do emulador ZiNc.",
  "global": "Configure opções gerais aplicadas a todos os emuladores.",
};

export default function ToolAppContent({
  appId, systems, onOpenSystem, settings, onSaveSetting, emulatorSettings, onSaveEmulatorSetting
}: {
  appId: string;
  systems: System[];
  onOpenSystem: (sysName: string) => void;
  settings?: any;
  onSaveSetting?: (name: string, value: any, type: "string" | "bool" | "int" | "float") => void;
  emulatorSettings?: any;
  onSaveEmulatorSetting?: (emulator: string, name: string, value: any) => void;
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState("conta");
  const [activeEmuSubmenu, setActiveEmuSubmenu] = useState<string>("global");
  const [emuMenuOpen, setEmuMenuOpen] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [settingsCategory, setSettingsCategory] = useState<"all" | "tools" | "systems">("all");
  const [riescadeLogo, setRiescadeLogo] = useState<string>("");
  const [riescadeVersion, setRiescadeVersion] = useState<string>("v2.0.0-Beta");
  const [emulatorSchemas, setEmulatorSchemas] = useState<{ id: string; name: string; description?: string }[]>([]);

  const [showGpuModal, setShowGpuModal] = useState(false);
  const [gpuDiagData, setGpuDiagData] = useState<any>(null);
  const [loadingGpuDiag, setLoadingGpuDiag] = useState(false);

  const fetchGpuDiagnostics = useCallback(async () => {
    setLoadingGpuDiag(true);
    try {
      const data = await window.api.getGpuDiagnostics();
      setGpuDiagData(data);
    } catch (err) {
      setGpuDiagData({ error: String(err) });
    } finally {
      setLoadingGpuDiag(false);
    }
  }, []);

  const [initialGroup, setInitialGroup] = useState<string | undefined>();
  const [initialCore, setInitialCore] = useState<string | undefined>();

  const selectedEmuRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleNavigate = (e: any) => {
      const data = e.detail;
      if (data && data.tab) {
        setActiveSettingsTab(data.tab);
        if (data.subTab) {
          setEmuMenuOpen(true);
          const targetSub = data.subTab === "libretro" ? "retroarch" : data.subTab;
          setActiveEmuSubmenu(targetSub);
          setInitialGroup(data.initialGroup);
          setInitialCore(data.initialCore);
        }
      }
    };
    window.addEventListener("navigate-settings", handleNavigate);
    return () => {
      window.removeEventListener("navigate-settings", handleNavigate);
    };
  }, []);

  useEffect(() => {
    if (activeSettingsTab === "emuladores" && activeEmuSubmenu && selectedEmuRef.current) {
      const el = selectedEmuRef.current;
      setTimeout(() => {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    }
  }, [activeEmuSubmenu, activeSettingsTab]);

  useEffect(() => {
    window.api.getRiescadeLogoPath().then((path) => {
      if (path) setRiescadeLogo(path);
    });
    window.api.getVersion().then((res) => {
      if (res && res.app) {
        setRiescadeVersion(`v${res.app}`);
      }
    });
    window.api.getEmulatorSchemas().then((list) => {
      if (list) {
        const sorted = [...list].sort((a, b) => {
          if (a.id === 'global') return -1;
          if (b.id === 'global') return 1;
          return a.name.localeCompare(b.name);
        });
        setEmulatorSchemas(sorted);
      }
    });
  }, []);
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'no-update' | 'available' | 'downloading' | 'error';
    version?: string;
    releaseNotes?: string;
    zipUrl?: string | null;
    errorMsg?: string;
    percent?: number;
    downloadedBytes?: number;
    totalBytes?: number;
  }>({ status: 'idle' });

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);



  useEffect(() => {
    const unsub = window.api.on('update-progress', (_event: any, data: any) => {
      if (data && data.status === 'downloading') {
        setUpdateState(prev => ({
          ...prev,
          status: 'downloading',
          percent: data.percent,
          downloadedBytes: data.downloadedBytes,
          totalBytes: data.totalBytes
        }));
      }
    });
    return unsub;
  }, []);

  const handleCheckForUpdates = () => {
    setUpdateState({ status: 'checking' });
    window.api.checkForUpdates()
      .then((res: any) => {
        if (res.error) {
          setUpdateState({
            status: 'error',
            errorMsg: res.errorMsg || 'Erro ao buscar atualizações.'
          });
        } else if (res.updateAvailable) {
          setUpdateState({
            status: 'available',
            version: res.version,
            releaseNotes: res.releaseNotes,
            zipUrl: res.zipUrl
          });
        } else {
          setUpdateState({ status: 'no-update' });
        }
      })
      .catch((err: any) => {
        setUpdateState({
          status: 'error',
          errorMsg: err.message || 'Erro de conexão.'
        });
      });
  };

  const handleInstallUpdate = () => {
    if (updateState.zipUrl) {
      setUpdateState(prev => ({ ...prev, status: 'downloading', percent: 0 }));
      window.api.downloadAndInstallUpdate(updateState.zipUrl)
        .catch((err: any) => {
          setUpdateState({
            status: 'error',
            errorMsg: err.message || 'Falha ao baixar atualização.'
          });
        });
    }
  };


  if (appId === "settings") {
    // --- Helper: read a setting value ---
    const getSetting = useCallback((name: string, fallback: any = ""): string => {
      const raw = settings?.[name]?.value;
      if (raw !== undefined && raw !== null) return String(raw);
      // System-specific settings default to 'auto'
      if (name.includes(".") && !name.startsWith("global.") && !name.startsWith("RIESCADE.") && !name.startsWith("Desktop.") && !name.startsWith("Taskbar.") && !name.startsWith("Window.")) {
        return "auto";
      }
      return String(fallback);
    }, [settings]);

    const isBoolOn = useCallback((name: string) => {
      const defaultValue = (name === "RIESCADE.ShowDesktopIcons" || name === "RIESCADE.DynamicBackground") ? "true" : "false";
      const v = getSetting(name, defaultValue);
      return v === "true" || v === "1";
    }, [getSetting]);

    const saveSetting = useCallback((name: string, value: any, type: "string" | "bool" | "int" | "float" = "string") => {
      if (onSaveSetting) onSaveSetting(name, value, type);
    }, [onSaveSetting]);

    // Build settings context object to pass to stable module-level components
    const ctx: SettingsCtx = useMemo(() => ({ getSetting, isBoolOn, saveSetting }), [getSetting, isBoolOn, saveSetting]);

    // Build emulator settings context
    const getEmuSetting = useCallback((name: string, fallback: any = ""): string => {
      const val = emulatorSettings?.[activeEmuSubmenu]?.[name] ?? emulatorSettings?.[activeEmuSubmenu]?.[`${activeEmuSubmenu}_${name}`];
      if (val !== undefined && val !== null) return String(val);
      return String(fallback);
    }, [emulatorSettings, activeEmuSubmenu]);

    const isEmuBoolOn = useCallback((name: string) => {
      const v = getEmuSetting(name, "false");
      return v === "true" || v === "1";
    }, [getEmuSetting]);

    const saveEmuSetting = useCallback((name: string, value: any, type: "string" | "bool" | "int" | "float" = "string") => {
      if (onSaveEmulatorSetting) {
        onSaveEmulatorSetting(activeEmuSubmenu, name, value);
      }
    }, [onSaveEmulatorSetting, activeEmuSubmenu]);

    const emuCtx: SettingsCtx = useMemo(() => ({
      getSetting: getEmuSetting,
      isBoolOn: isEmuBoolOn,
      saveSetting: saveEmuSetting
    }), [getEmuSetting, isEmuBoolOn, saveEmuSetting]);

    // --- Desktop/Taskbar icons logic (Interface tab) ---
    const allToggleItems = useMemo(() => [
      ...TOOL_APPS.map(tool => ({
        key: `tool:${tool.id}`, name: tool.name, type: "tool" as const,
        icon: tool.icon, color: tool.color, logo: null
      })),
      ...systems.map(sys => {
        const theme = getSystemTheme(sys.name);
        return {
          key: `system:${sys.name}`, name: sys.fullname, type: "system" as const,
          icon: theme.icon, color: theme.color, logo: sys.logo || null
        };
      })
    ], [systems]);

    const filteredToggleItems = useMemo(() => allToggleItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(settingsSearch.toLowerCase()) || item.key.toLowerCase().includes(settingsSearch.toLowerCase());
      const matchesCategory = settingsCategory === "all"
        || (settingsCategory === "tools" && item.type === "tool")
        || (settingsCategory === "systems" && item.type === "system");
      return matchesSearch && matchesCategory;
    }), [allToggleItems, settingsSearch, settingsCategory]);

    const getDesktopIcons = () => {
      const raw = settings?.["Desktop.Icons"]?.value;
      if (raw !== undefined) return String(raw).split(",").filter(Boolean);
      return ["tool:all"];
    };
    const getTaskbarIcons = () => {
      const raw = settings?.["Taskbar.Icons"]?.value;
      if (raw !== undefined) return String(raw).split(",").filter(Boolean);
      return ["tool:all", "tool:settings"];
    };
    const desktopIcons = getDesktopIcons();
    const taskbarIcons = getTaskbarIcons();
    
    const handleToggleDesktop = (itemKey: string) => {
      if (!onSaveSetting) return;
      const current = getDesktopIcons();
      const next = current.includes(itemKey) ? current.filter(x => x !== itemKey) : [...current, itemKey];
      onSaveSetting("Desktop.Icons", next.join(","), "string");
    };
    const handleToggleTaskbar = (itemKey: string) => {
      if (!onSaveSetting) return;
      const current = getTaskbarIcons();
      const next = current.includes(itemKey) ? current.filter(x => x !== itemKey) : [...current, itemKey];
      onSaveSetting("Taskbar.Icons", next.join(","), "string");
    };


    // --- Settings tabs definition ---
    const settingsTabs = SETTINGS_TABS;

    return (
      <div className="flex h-full text-white">
        {/* Discord-like Sidebar - extends to top, merges with titlebar */}
        <aside className="w-[320px] bg-black/40 border-r border-white/5 flex flex-col shrink-0 select-none">
          {/* Branding Section - top padding accounts for drag region */}
          <div className="pt-8 px-4 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              {riescadeLogo ? (
                <img 
                  src={riescadeLogo} 
                  alt="RIESCADE OS" 
                  className="w-10 h-10 rounded-full object-cover shadow-lg shrink-0"
                />
              ) : (
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--accent-color), rgba(46, 46, 46, 1))' }}
                >
                  R
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-md font-bold text-white tracking-wide">RIESCADE OS</span>
                <span className="text-sm text-white/40 font-medium">{riescadeVersion}</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-xs font-bold uppercase text-white/25 tracking-widest px-3.5 py-2 mt-1">Configurações</div>
            <div className="flex flex-col gap-1">
              {settingsTabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeSettingsTab === tab.id;
                return (
                  <div key={tab.id} className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        setActiveSettingsTab(tab.id);
                        if (tab.id === "emuladores") {
                          if (activeSettingsTab === "emuladores") {
                            setEmuMenuOpen(v => !v);
                          } else {
                            setEmuMenuOpen(true);
                            setActiveEmuSubmenu("global");
                          }
                        }
                      }}
                      className={`cursor-pointer font-medium w-full text-left px-3.5 py-2.5 rounded-md text-sm flex items-center justify-between transition ${
                        isActive 
                          ? "bg-white/5 text-white" 
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <TabIcon className={`w-4 h-4 shrink-0 transition ${isActive ? 'text-accent' : 'opacity-60'}`} />
                        <span>{tab.name}</span>
                      </div>
                      {tab.id === "emuladores" && (
                        <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform duration-200 ${emuMenuOpen ? "" : "-rotate-90"}`} />
                      )}
                    </button>
                    {tab.id === "emuladores" && emuMenuOpen && (
                      <div className="flex flex-col gap-1 pl-4 border-l border-white/5 ml-5.5 my-1 max-h-[340px] overflow-y-auto pr-1 select-none scrollbar-thin">
                        {emulatorSchemas.length > 0 ? (
                          emulatorSchemas.map((schema) => {
                            const isSelected = activeSettingsTab === "emuladores" && activeEmuSubmenu === schema.id;
                            return (
                              <button
                                key={schema.id}
                                ref={isSelected ? selectedEmuRef : null}
                                onClick={() => {
                                  setActiveSettingsTab("emuladores");
                                  setActiveEmuSubmenu(schema.id);
                                }}
                                className={`cursor-pointer w-full text-left py-1.5 px-2 rounded-md text-[13px] font-medium transition ${
                                  isSelected
                                    ? "text-accent font-bold bg-white/[0.04]"
                                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
                                }`}
                              >
                                {schema.name}
                              </button>
                            );
                          })
                        ) : (
                          Object.entries(EMULATOR_NAMES).map(([emuKey, emuName]) => {
                            const isSelected = activeSettingsTab === "emuladores" && activeEmuSubmenu === emuKey;
                            return (
                              <button
                                key={emuKey}
                                ref={isSelected ? selectedEmuRef : null}
                                onClick={() => {
                                  setActiveSettingsTab("emuladores");
                                  setActiveEmuSubmenu(emuKey);
                                }}
                                className={`cursor-pointer w-full text-left py-1.5 px-2 rounded-md text-[11px] font-medium transition ${
                                  isSelected
                                    ? "text-accent font-bold bg-white/[0.04]"
                                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
                                }`}
                              >
                                {emuName}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Profile (Static) */}
          <div className="p-3 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-color))' }}
              >
                RC
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white/90 truncate">RIESCADE Player</span>
                <span className="text-xs text-white/35">Online</span>
              </div>
            </div>
          </div>
        </aside>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-black/10">

          {/* ===== TAB: CONTA (Account - Static) ===== */}
          {activeSettingsTab === "conta" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-8 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Minha Conta</h2>
                <p className="text-sm text-white/40">Gerencie suas informações pessoais e configurações de conta.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px]">
                  {/* Account Info Section */}
                  <div className="mb-8">
                    <h3 className="text-base font-bold text-white mb-4">Informações da conta</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Nome de usuário", value: "RIESCADE Player", action: "Editar" },
                        { label: "E-mail", value: "**************@gmail.com", action: "Editar", link: "Mostrar" },
                      ].map((field, i) => (
                        <div key={i} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-md px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs text-white/40 font-medium">{field.label}</span>
                            <span className="text-sm text-white/90">{field.value}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {field.link && (
                              <button className="text-xs text-blue-400 hover:text-blue-300 transition cursor-pointer font-medium">
                                {field.link}
                              </button>
                            )}
                            <button className="px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-xs text-white/80 font-medium transition cursor-pointer">
                              {field.action}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Account Status Section */}
                  <div>
                    <h3 className="text-base font-bold text-white mb-4">Status da Conta</h3>
                    <div className="flex items-center gap-2.5 bg-black/20 border border-white/5 rounded-md px-4 py-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-sm text-white/70">Sua conta está toda em ordem</span>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}



          {/* ===== TAB: INTERFACE ===== */}
          {activeSettingsTab === "interface" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-8 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Interface</h2>
                <p className="text-sm text-white/40">Aparência, ícones do desktop/taskbar, tema e idioma.</p>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-2">
                  <SettingGroup label="Ícones do Desktop e Taskbar" />

                  {/* Search & Category Filter */}
                  <div className="flex items-center gap-3 mb-4 select-none">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 group-focus-within:text-accent transition duration-200" />
                      <input 
                        value={settingsSearch} 
                        onChange={(e) => setSettingsSearch(e.target.value)} 
                        placeholder="Pesquisar ferramentas ou sistemas..."
                        className="w-full bg-[#121212] border border-white/10 rounded-md pl-9 pr-8 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent hover:border-accent transition duration-200" 
                      />
                      {settingsSearch && (
                        <button
                          type="button"
                          onClick={() => setSettingsSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition p-0.5 cursor-pointer"
                          title="Limpar busca"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex bg-black/25 p-1 rounded-md border border-white/5 text-xs items-center shrink-0">
                      {[{ id: "all", label: "Tudo" }, { id: "tools", label: "Ferramentas" }, { id: "systems", label: "Sistemas" }].map(cat => (
                        <button 
                          key={cat.id} 
                          onClick={() => setSettingsCategory(cat.id as any)}
                          className={`px-3 py-1.5 rounded-md transition cursor-pointer font-medium ${
                            settingsCategory === cat.id 
                              ? "bg-white/10 text-white shadow-sm font-semibold" 
                              : "text-white/50 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Icons List */}
                  {filteredToggleItems.map(item => {
                    const ItemIcon = item.icon;
                    const isDesk = desktopIcons.includes(item.key);
                    const isTask = taskbarIcons.includes(item.key);
                    return (
                      <div key={item.key} className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md p-3 hover:bg-white/5 transition duration-200 select-none">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 flex items-center justify-center shrink-0">
                            {item.logo ? (
                              <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
                            ) : (
                              <div className={`w-9 h-9 rounded-md bg-gradient-to-br ${item.color} flex items-center justify-center shadow-md`}>
                                <ItemIcon className="w-5 h-5 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-white/95 truncate">{item.name}</span>
                            <span className="text-[9px] text-white/35 uppercase tracking-wider font-semibold">
                              {item.type === "tool" ? "Ferramenta" : "Sistema de Jogos"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 font-sans" onClick={(e) => e.stopPropagation()}>
                          <label className="flex items-center gap-2 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-white/50 font-medium">Desktop</span>
                            <input 
                              type="checkbox" 
                              checked={isDesk}
                              onChange={e => { e.stopPropagation(); handleToggleDesktop(item.key); }}
                              className="w-4 h-4 cursor-pointer accent-range" 
                            />
                          </label>
                          <div className="w-px h-6 bg-white/10" />
                          <label className="flex items-center gap-2 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-white/50 font-medium">Taskbar</span>
                            <input 
                              type="checkbox" 
                              checked={isTask}
                              onChange={e => { e.stopPropagation(); handleToggleTaskbar(item.key); }}
                              className="w-4 h-4 cursor-pointer accent-range" 
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: PERSONALIZAÇÃO ===== */}
          {activeSettingsTab === "personalizacao" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-8 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Personalização</h2>
                <p className="text-sm text-white/40">Escolha a cor de destaque para os menus, botões e barras do sistema.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-2">
                  <SettingGroup label="Cor de Destaque" />
                  
                  <div className="bg-black/15 border border-white/5 rounded-md p-4 flex flex-col gap-4">
                    <span className="font-semibold text-xs text-white/90">Cores Predefinidas</span>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { name: "Roxo (Padrão)", hex: "#8b5cf6" },
                        { name: "Azul", hex: "#3b82f6" },
                        { name: "Ciano", hex: "#06b6d4" },
                        { name: "Esmeralda", hex: "#10b981" },
                        { name: "Laranja", hex: "#f97316" },
                        { name: "Rosa", hex: "#9f0043" },
                        { name: "Vermelho", hex: "#ef4444" },
                        { name: "Teal", hex: "#14b8a6" }
                      ].map(preset => {
                        const currentAccent = ctx.getSetting("RIESCADE.AccentColor", "#8b5cf6");
                        const isSelected = currentAccent.toLowerCase() === preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.hex}
                            onClick={() => ctx.saveSetting("RIESCADE.AccentColor", preset.hex, "string")}
                            className={`flex flex-col items-center gap-2 p-3 rounded-md border transition hover:bg-white/5 cursor-pointer ${
                              isSelected 
                                ? "border-accent bg-accent-light" 
                                : "border-white/10 hover:border-white/20"
                            }`}
                          >
                            <div 
                              className="w-6 h-6 rounded-full border border-white/10 shadow-inner" 
                              style={{ backgroundColor: preset.hex }}
                            />
                            <span className="text-xs text-white/60 font-medium text-center truncate w-full">{preset.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="h-px bg-white/5 my-1" />

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-sm text-white/90">Cor Customizada</span>
                        <span className="text-xs text-white/40">Defina uma cor hexadecimal personalizada para a interface.</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="text" 
                          value={ctx.getSetting("RIESCADE.AccentColor", "#8b5cf6")}
                          onChange={(e) => ctx.saveSetting("RIESCADE.AccentColor", e.target.value, "string")}
                          className="bg-[#121212] border border-white/10 rounded-md px-2.5 py-1 text-xs text-white/90 focus:outline-none focus:border-accent hover:border-accent w-24 text-center font-mono"
                        />
                        <div className="relative w-8 h-8 rounded-md overflow-hidden border border-white/15 cursor-pointer">
                          <input 
                            type="color" 
                            value={ctx.getSetting("RIESCADE.AccentColor", "#8b5cf6")}
                            onChange={(e) => ctx.saveSetting("RIESCADE.AccentColor", e.target.value, "string")}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                          <div 
                            className="w-full h-full" 
                            style={{ backgroundColor: ctx.getSetting("RIESCADE.AccentColor", "#8b5cf6") }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <SettingGroup label="Área de Trabalho" />
                  
                  <SettingToggle 
                    label="Mostrar ícones no desktop" 
                    name="RIESCADE.ShowDesktopIcons" 
                    desc="Exibe os atalhos de ferramentas e plataformas diretamente na área de trabalho." 
                    ctx={ctx} 
                  />
                  
                  <SettingToggle 
                    label="Sempre trocar background para o sistema ativo" 
                    name="RIESCADE.DynamicBackground" 
                    desc="Altera o papel de parede automaticamente baseado no console ou jogo em foco." 
                    ctx={ctx} 
                  />

                  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-sm hover:bg-white/5 transition">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
                      <span className="font-medium text-white/90">Background Personalizado</span>
                      <span className="text-xs text-white/45 leading-relaxed font-sans">
                        {ctx.getSetting("RIESCADE.CustomBackground") 
                          ? `Arquivo selecionado: ${ctx.getSetting("RIESCADE.CustomBackground").split('/').pop()}` 
                          : "Selecione uma imagem do seu computador para usar como papel de parede."}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-sans">
                      {ctx.getSetting("RIESCADE.CustomBackground") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ctx.saveSetting("RIESCADE.CustomBackground", "", "string");
                          }}
                          className="px-3 py-1.5 rounded-md bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600/20 hover:text-red-300 font-semibold transition cursor-pointer"
                        >
                          Remover
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.api.selectBgImage().then((filePath) => {
                            if (filePath) {
                              ctx.saveSetting("RIESCADE.CustomBackground", filePath, "string");
                            }
                          }).catch(() => {});
                        }}
                        className="px-3 py-1.5 rounded-md bg-white/10 border border-white/10 hover:bg-white/15 hover:border-white/20 text-white font-semibold transition cursor-pointer"
                      >
                        Procurar...
                      </button>
                    </div>
                  </div>

                  <SettingGroup label="Vídeo de Fundo" />
                  
                  <SettingToggle 
                    label="Ativar vídeo de fundo" 
                    name="RIESCADE.EnableBackgroundVideo" 
                    desc="Reproduz um vídeo em loop na área de trabalho em tela cheia." 
                    ctx={ctx} 
                  />

                  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-sm hover:bg-white/5 transition">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
                      <span className="font-medium text-white/90">Vídeo de Fundo Personalizado</span>
                      <span className="text-[12px] text-white/45 leading-relaxed font-sans">
                        {ctx.getSetting("RIESCADE.BackgroundVideoPath") 
                          ? `Arquivo selecionado: ${decodeURIComponent(ctx.getSetting("RIESCADE.BackgroundVideoPath").split('/').pop() || '')}` 
                          : "Selecione um vídeo (MP4) do seu computador. Se não for selecionado, o default.mp4 será usado."}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-sans">
                      {ctx.getSetting("RIESCADE.BackgroundVideoPath") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ctx.saveSetting("RIESCADE.BackgroundVideoPath", "", "string");
                          }}
                          className="px-3 py-1.5 rounded-md bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600/20 hover:text-red-300 font-semibold transition cursor-pointer"
                        >
                          Remover
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.api.selectBgVideo().then((filePath) => {
                            if (filePath) {
                              ctx.saveSetting("RIESCADE.BackgroundVideoPath", filePath, "string");
                            }
                          }).catch(() => {});
                        }}
                        className="px-3 py-1.5 rounded-md bg-white/10 border border-white/10 hover:bg-white/15 hover:border-white/20 text-white font-semibold transition cursor-pointer"
                      >
                        Procurar...
                      </button>
                    </div>
                  </div>

                  <SettingGroup label="Barra de Tarefas" />
                  
                  <SettingToggle 
                    label="Ocultar automaticamente a Barra de Tarefas" 
                    name="taskbar.autoHide" 
                    desc="Oculta a barra de tarefas automaticamente após um período sem interação do mouse." 
                    ctx={ctx} 
                  />

                  {(String(ctx.getSetting("taskbar.autoHide")) === "true") && (
                    <SettingSlider 
                      label="Tempo de inatividade para ocultar" 
                      name="taskbar.autoHideTimeout" 
                      min={1} 
                      max={30} 
                      step={1} 
                      suffix=" s" 
                      ctx={ctx} 
                    />
                  )}

                  <SettingSelect 
                    label="Formato do Relógio" 
                    name="taskbar.clockFormat" 
                    defaultValue="default" 
                    desc="Escolha o estilo de exibição da hora e data no relógio da barra de tarefas." 
                    options={[
                      { label: "Padrão (Mês, Dia, HH:MM)", value: "default" },
                      { label: "24 Horas (14:30)", value: "24h" },
                      { label: "24 Horas com Segundos (14:30:45)", value: "24h_sec" },
                      { label: "12 Horas AM/PM (02:30 PM)", value: "12h" },
                      { label: "12 Horas AM/PM com Segundos (02:30:45 PM)", value: "12h_sec" },
                      { label: "Data Completa + 24h (21/07 - 14:30)", value: "full_24h" }
                    ]} 
                    ctx={ctx} 
                  />

                  <SettingToggle label="Mostrar ícone de Wi-Fi na bandeja" name="taskbar.showWifi" ctx={ctx} />
                  <SettingToggle label="Mostrar ícone de Som / Volume na bandeja" name="taskbar.showVolume" ctx={ctx} />
                  <SettingToggle label="Mostrar ícone de Bateria na bandeja" name="taskbar.showBattery" ctx={ctx} />
                  <SettingToggle label="Mostrar ícones de Controles na bandeja" name="taskbar.showControllers" ctx={ctx} />
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: CONTROLES ===== */}
          {activeSettingsTab === "controles" && (
            <React.Suspense fallback={<div className="p-8 text-center text-xs text-white/40">Carregando Controles...</div>}>
              <SettingsControls ctx={ctx} />
            </React.Suspense>
          )}

          {/* ===== TAB: ÁUDIO ===== */}
          {activeSettingsTab === "audio" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Áudio</h2>
                <p className="text-sm text-white/40">Volume, música de fundo e sons de navegação.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-2">
                  <SettingGroup label="Volume" />
                  <SettingSlider label="Volume do Sistema" name="Volume" min={0} max={100} step={1} suffix="%" ctx={ctx} />
                  <SettingSlider label="Volume da Música" name="MusicVolume" min={0} max={100} step={1} suffix="%" ctx={ctx} />
                  <SettingToggle label="Mostrar Popup de Volume" name="VolumePopup" ctx={ctx} />

                  <SettingGroup label="Música" />
                  <SettingToggle label="Ativar Música" name="audio.bgmusic" ctx={ctx} />
                  <SettingToggle label="Mostrar Popup dos Títulos das Músicas" name="audio.display_titles" ctx={ctx} />
                  <SettingToggle label="Tocar Música Específica por Sistema" desc="Ao abrir um sistema tocar a musica especifica daquele Sistema (/music/systems)" name="audio.persystem" ctx={ctx} />
                  <SettingToggle label="Tocar Apenas Favoritas" desc="Tocar de fundo as músicas que estão na pasta de favoritas (/music/favorites)" name="audio.useFavoriteMusic" ctx={ctx} />
                  <SettingToggle label="Baixar volume ao reproduzir Vídeo" name="VideoLowersMusic" ctx={ctx} />

                  <SettingGroup label="Sons" />
                  <SettingToggle label="Sons de Navegação" name="EnableSounds" ctx={ctx} />
                  <SettingToggle label="Áudio na Prévia de Vídeo" name="VideoAudio" ctx={ctx} />
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: SCRAPER ===== */}
          {activeSettingsTab === "scraper" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Configurações de Scraper</h2>
                <p className="text-sm text-white/40">Download de Fanarts, capas, logos, manuais e vídeos.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-2">
                  <SettingGroup label="Contas do Scraper" />
                  <SettingInput label="ScreenScraper Usuário" name="ScreenScraperUser" ctx={ctx} />
                  <SettingInput label="ScreenScraper Senha" name="ScreenScraperPass" isPassword ctx={ctx} />

                  {/* Connection Test Controls */}
                  <div className="flex flex-col gap-2 p-3.5 bg-white/5 border border-white/5 rounded-xl max-w-[400px] mt-2 mb-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={testingConnection}
                        onClick={async () => {
                          setTestingConnection(true);
                          setTestResult(null);
                          try {
                            const user = ctx.getSetting('ScreenScraperUser') || '';
                            const pass = ctx.getSetting('ScreenScraperPass') || '';
                            const res = await window.api.testScreenScraper(user, pass);
                            if (res.success) {
                              setTestResult({
                                success: true,
                                message: `Sucesso! Conectado como ${res.username}. Requisições hoje: ${res.requests} / ${res.maxRequests}`
                              });
                            } else {
                              setTestResult({
                                success: false,
                                message: res.reason || 'Usuário ou senha incorretos.'
                              });
                            }
                          } catch (err: any) {
                            setTestResult({
                              success: false,
                              message: err.message || 'Erro inesperado na conexão.'
                            });
                          } finally {
                            setTestingConnection(false);
                          }
                        }}
                        className="px-4 py-2 bg-accent hover:bg-[var(--accent-color-hover)] text-white text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 self-start disabled:opacity-50"
                      >
                        {testingConnection ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Testando...</span>
                          </>
                        ) : (
                          <span>Testar Conexão</span>
                        )}
                      </button>
                    </div>

                    {testResult && (
                      <div className={`text-xs font-semibold px-3 py-2 rounded-lg border mt-1 animate-in fade-in duration-200 ${
                        testResult.success 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}>
                        {testResult.message}
                      </div>
                    )}
                  </div>

                  <SettingGroup label="Configurações de Metadados" />
                  <SettingSelect
                    label="Região de Preferência"
                    name="ScraperRegion"
                    defaultValue="us"
                    options={[
                      { label: "Estados Unidos (USA)", value: "us" },
                      { label: "Europa (EU)", value: "eu" },
                      { label: "Japão (JP)", value: "jp" },
                      { label: "Brasil (BR)", value: "br" },
                      { label: "Mundo (WOR)", value: "wor" },
                      { label: "ScreenScraper (SS)", value: "ss" }
                    ]}
                    desc="Define a região prioritária para o download de capas e logos."
                    ctx={ctx}
                  />
                  <SettingToggle label="Sobrescrever Título" name="ScrapeOverWriteNames" desc="Permite atualizar o título do jogo caso ele já exista." ctx={ctx} />
                  <SettingToggle label="Sobrescrever Descrição" name="ScrapeOverWriteDesc" desc="Permite atualizar a sinopse do jogo caso ela já exista." ctx={ctx} />
                  <SettingToggle label="Sobrescrever Metadados" name="ScrapeOverWriteMetadata" desc="Atualiza gênero, desenvolvedor, distribuidora, jogadores e nota." ctx={ctx} />

                  <SettingGroup label="Download de Mídia" />
                  <SettingToggle label="Imagem Principal (Fanart)" name="ScrapperDownloadFanart" ctx={ctx} />
                  <SettingToggle label="Capa 2D (Cover)" name="ScrapperDownloadCover" ctx={ctx} />
                  <SettingToggle label="Capa 3D" name="ScrapperDownloadCover3D" ctx={ctx} />
                  <SettingToggle label="Verso da Capa (Cover Back)" name="ScrapperDownloadCoverBack" ctx={ctx} />
                  <SettingToggle label="Cartucho (Cartridge)" name="ScrapperDownloadCartridge" ctx={ctx} />
                  <SettingToggle label="Logo (Wheel)" name="ScrapperDownloadLogo" ctx={ctx} />
                  <SettingToggle label="Marquee" name="ScrapperDownloadMarquee" ctx={ctx} />
                  <SettingToggle label="Captura de Tela (Screenshot)" name="ScrapperDownloadScreenshot" ctx={ctx} />
                  <SettingToggle label="Tela de Título (Title Screen)" name="ScrapperDownloadTitle" ctx={ctx} />
                  <SettingToggle label="Mix Image" name="ScrapperDownloadMix" ctx={ctx} />
                  <SettingToggle label="Manual" name="ScrapperDownloadManual" ctx={ctx} />
                  <SettingToggle label="Vídeo" name="ScrapeVideos" ctx={ctx} />
                  
                  <div className="pt-2">
                    <SettingToggle label="Sobrescrever Mídias Existentes" name="ScrapeOverWriteMedias" desc="Baixa e substitui as mídias mesmo se os arquivos já existirem." ctx={ctx} />
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: EMULADORES ===== */}
          {activeSettingsTab === "emuladores" && (() => {
            const currentSchema = emulatorSchemas.find(s => s.id === activeEmuSubmenu);
            const dispName = currentSchema ? currentSchema.name : (EMULATOR_NAMES[activeEmuSubmenu] || (activeEmuSubmenu.charAt(0).toUpperCase() + activeEmuSubmenu.slice(1)));
            const dispDesc = currentSchema ? currentSchema.description : (EMULATOR_DESCRIPTIONS[activeEmuSubmenu] || `Ajuste os parâmetros específicos do emulador ${dispName}.`);
            return (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="shrink-0 px-6 pt-8 pb-4 max-w-[800px]">
                  <h2 className="text-xl font-bold text-white mb-1">
                    Configurações dos Emuladores - {dispName}
                  </h2>
                  <p className="text-sm text-white/40">
                    {dispDesc}
                  </p>
                </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px]">
                  <EmulatorSettingsPanel
                    emulatorId={activeEmuSubmenu}
                    emulatorSettings={emulatorSettings}
                    globalSettings={emulatorSettings?.['global']}
                    onSaveEmulatorSetting={onSaveEmulatorSetting || (() => {})}
                    initialGroup={initialGroup}
                    initialCore={initialCore}
                  />
                </div>
              </ScrollArea>
            </div>
            );
          })()}

          {/* ===== TAB: AVANÇADO ===== */}
          {activeSettingsTab === "avancado" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Configurações Avançadas</h2>
                <p className="text-sm text-white/40">Drivers, latência, opções de desenvolvedor e otimizações.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-2">
                  <SettingGroup label="Gráficos E GPU" />
                  <SettingSelect 
                    label="Aceleração Gráfica do Frontend" 
                    name="RIESCADE.GpuDriver" 
                    defaultValue="default" 
                    desc="Define a API gráfica para aceleração da interface. Deixar em 'Padrão (Auto)' permite que o Chromium escolha o melhor backend." 
                    options={[
                      { label: "Padrão (Auto - Recomendado)", value: "default" },
                      { label: "Direct3D 11 (ANGLE)", value: "d3d11" },
                      { label: "Direct3D 12 (ANGLE)", value: "d3d12" },
                      { label: "Vulkan", value: "vulkan" },
                      { label: "OpenGL", value: "opengl" },
                      { label: "Desativado (Software Rendering)", value: "software" }
                    ]} 
                    ctx={ctx} 
                  />
                  <SettingToggle 
                    label="Forçar Aceleração em GPUs Bloqueadas" 
                    name="RIESCADE.IgnoreGpuBlocklist" 
                    desc="Força aceleração por hardware mesmo em GPUs consideradas instáveis pelo Chromium (--ignore-gpu-blocklist). Desative se ocorrerem travamentos de vídeo." 
                    ctx={ctx} 
                  />
                  <SettingSlider label="Limite de VRAM" name="MaxVRAM" min={40} max={1000} step={10} suffix=" Mb" ctx={ctx} />
                  <SettingToggle label="V-Sync do Frontend" name="VSync" ctx={ctx} />


                  <SettingGroup label="DIAGNÓSTICO E DEPURAÇÃO" />
                  {/* GPU Diagnostic Card */}
                  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-sm hover:bg-white/5 transition duration-200 select-none">
                    <div className="flex items-center gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-white">Diagnóstico de Aceleração da GPU</h4>
                        <p className="text-[11px] text-white/40">Exibe o status em tempo real do Chromium GPU Process, driver ativo e suporte a hardware.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGpuModal(true);
                        fetchGpuDiagnostics();
                      }}
                      className="px-3.5 py-2 bg-accent hover:bg-accent/80 text-white font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-2 shrink-0 shadow-md"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Ver Diagnóstico</span>
                    </button>
                  </div>
                  <SettingToggle label="Exibir FPS" name="DrawFramerate" ctx={ctx} />
                  <SettingSelect 
                    label="Nível de Log" 
                    name="LogLevel" 
                    defaultValue="default" 
                    options={[
                      { label: "Padrão", value: "default" }, 
                      { label: "Desativado", value: "disabled" },
                      { label: "Aviso", value: "warning" }, 
                      { label: "Erro", value: "error" }, 
                      { label: "Debug", value: "debug" }
                    ]} 
                    ctx={ctx} 
                  />

                  <SettingGroup label="Interface do Frontend" />
                  <SettingToggle label="Gravar posições das janelas" name="RIESCADE.SaveWindowPositions" desc="Gravar posições e tamanhos de todas as janelas do sistema operacional." ctx={ctx} />
                  <SettingSelect label="Menu do RetroArch" name="global.retroarch.menu_driver" options={[
                    { label: "Automático", value: "" }, { label: "RGUI", value: "rgui" },
                    { label: "XMB", value: "xmb" }, { label: "Ozone", value: "ozone" }
                  ]} ctx={ctx} />

                  <SettingGroup label="Otimizações" />
                  <SettingToggle label="Carregamento em Segundo Plano" name="ThreadedLoading" ctx={ctx} />
                  <SettingToggle label="Otimizar VRAM de Imagens" name="OptimizeVRAM" ctx={ctx} />
                  <SettingToggle label="Otimizar VRAM de Vídeos" name="OptimizeVideo" ctx={ctx} />
                  <SettingToggle label="Cache do Sistema de Arquivos" name="UseFileCache" ctx={ctx} />
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: SOBRE ===== */}
          {activeSettingsTab === "sobre" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[800px]">
                <h2 className="text-xl font-bold text-white mb-1">Sobre o Sistema</h2>
                <p className="text-sm text-white/40">Informações do RIESCADE OS e hardware.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-2">
                  <SettingGroup label="Sistema" />
                  <SettingInfo label="Versão" value={`RIESCADE OS ${riescadeVersion}`} />
                  <SettingInfo label="Motor" value="Electron + React + Vite" />
                  <SettingInfo label="Idioma" value={getSetting("Language", "pt_BR")} />


                  <div className="bg-black/15 border border-white/5 rounded-md px-4 py-3.5 text-sm hover:bg-white/[0.03] transition duration-200 space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-white/90">Verificar Atualizações</span>
                        <span className="text-xs text-white/40 font-sans">
                          {updateState.status === 'idle' && 'Verifique se há novas atualizações do RIESCADE OS.'}
                          {updateState.status === 'checking' && 'Verificando atualizações no GitHub...'}
                          {updateState.status === 'no-update' && 'O sistema está atualizado! Nenhuma atualização disponível.'}
                          {updateState.status === 'available' && `Nova versão disponível: v${updateState.version}`}
                          {updateState.status === 'downloading' && `Baixando atualização... (${updateState.percent}%)`}
                          {updateState.status === 'error' && (updateState.errorMsg || 'Falha ao buscar atualizações.')}
                        </span>
                      </div>
                      
                      <div className="shrink-0 font-sans">
                        {(updateState.status === 'idle' || updateState.status === 'no-update' || updateState.status === 'error') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCheckForUpdates(); }}
                            className="px-3.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent/80 font-semibold transition cursor-pointer text-[11px]"
                          >
                            Buscar
                          </button>
                        )}
                        {updateState.status === 'checking' && (
                          <button
                            disabled
                            className="px-3.5 py-1.5 rounded-md bg-white/[0.04] border border-white/10 text-white/30 font-semibold text-[11px] cursor-not-allowed"
                          >
                            Buscando...
                          </button>
                        )}
                        {updateState.status === 'available' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleInstallUpdate(); }}
                            className="px-3.5 py-1.5 rounded-md bg-accent text-white hover:bg-accent/80 font-semibold transition cursor-pointer text-[11px]"
                          >
                            Atualizar
                          </button>
                        )}
                        {updateState.status === 'downloading' && (
                          <button
                            disabled
                            className="px-3.5 py-1.5 rounded-md bg-accent/30 text-accent/50 font-semibold text-[11px] cursor-not-allowed"
                          >
                            Instalando...
                          </button>
                        )}
                      </div>
                    </div>

                    {updateState.status === 'available' && updateState.releaseNotes && (
                      <div className="bg-black/35 rounded-md p-3 border border-white/5 space-y-1.5">
                        <div className="font-semibold text-xs text-white/60 uppercase tracking-wider">Notas de Lançamento:</div>
                        <pre className="text-xs text-white/50 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto pr-1">
                          {updateState.releaseNotes}
                        </pre>
                      </div>
                    )}

                    {updateState.status === 'downloading' && (
                      <div className="space-y-1.5">
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-accent transition-all duration-300 rounded-full" 
                            style={{ width: `${updateState.percent || 0}%` }}
                          />
                        </div>
                        {updateState.downloadedBytes !== undefined && updateState.totalBytes !== undefined && (
                          <div className="flex justify-between text-[9px] text-white/40 font-mono">
                            <span>
                              {((updateState.downloadedBytes) / 1024 / 1024).toFixed(1)} MB / {((updateState.totalBytes) / 1024 / 1024).toFixed(1)} MB
                            </span>
                            <span>{updateState.percent}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
          {/* ===== MODAL: DIAGNÓSTICO GPU ===== */}
          {showGpuModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-[#121214] border border-white/15 rounded-2xl w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide">Diagnóstico da GPU & Chromium</h3>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Processo de Aceleração Gráfica</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowGpuModal(false)}
                    className="text-white/40 hover:text-white transition p-1 cursor-pointer rounded-lg hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body */}
                <ScrollArea className="flex-1 p-6">
                  {loadingGpuDiag ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="w-8 h-8 text-accent animate-spin" />
                      <span className="text-xs text-white/50">Consultando subsistema GPU do Electron...</span>
                    </div>
                  ) : gpuDiagData?.error ? (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                      Erro ao consultar diagnóstico: {gpuDiagData.error}
                    </div>
                  ) : gpuDiagData ? (
                    <div className="space-y-4">
                      {/* Summary Cards */}
                      {(() => {
                        const glRenderer = gpuDiagData.gpuInfoBasic?.auxAttributes?.glRenderer || '';
                        let detectedBackend = 'ANGLE (D3D11)';
                        let statusText = '✓ Recomendado / Estável';
                        let badgeColor = 'text-emerald-400';

                        if (glRenderer.includes('Vulkan')) {
                          detectedBackend = 'ANGLE (VULKAN)';
                          statusText = '⚡ High-Performance / Experimental';
                          badgeColor = 'text-cyan-400';
                        } else if (glRenderer.includes('Direct3D12') || glRenderer.includes('D3D12')) {
                          detectedBackend = 'ANGLE (D3D12)';
                          statusText = '⚡ High-Performance / Experimental';
                          badgeColor = 'text-cyan-400';
                        } else if (glRenderer.includes('Direct3D11') || glRenderer.includes('D3D11')) {
                          detectedBackend = 'ANGLE (D3D11)';
                          statusText = '✓ Recomendado / Estável';
                          badgeColor = 'text-emerald-400';
                        } else if (glRenderer.includes('OpenGL') || glRenderer.includes('GL')) {
                          detectedBackend = 'OPENGL DESKTOP';
                          statusText = '✓ OpenGL Nativo';
                          badgeColor = 'text-emerald-400';
                        } else if (glRenderer.includes('Software') || glRenderer.includes('SwiftShader') || gpuDiagData.featureStatus?.gpu_compositing === 'disabled') {
                          detectedBackend = 'SOFTWARE RENDERING';
                          statusText = '⚠️ Sem aceleração gráfica';
                          badgeColor = 'text-rose-400';
                        }

                        const configured = (gpuDiagData.configuredDriver || 'default').toLowerCase();
                        const isFallback = configured !== 'default' && (
                          (configured === 'vulkan' && !detectedBackend.includes('VULKAN')) ||
                          (configured === 'd3d12' && !detectedBackend.includes('D3D12')) ||
                          (configured === 'd3d11' && !detectedBackend.includes('D3D11')) ||
                          (configured === 'opengl' && !detectedBackend.includes('OPENGL'))
                        );

                        return (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Backend Configurado</span>
                              <span className="text-xs font-bold text-white uppercase">{gpuDiagData.configuredDriver || 'default'}</span>
                              <span className="text-[9px] text-white/30">Opção salva no RIESCADE</span>
                            </div>

                            <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col gap-1 relative overflow-hidden">
                              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Backend Detectado</span>
                              <span className={`text-xs font-bold ${badgeColor} uppercase`}>
                                {detectedBackend}
                              </span>
                              <span className={`text-[9px] font-semibold ${badgeColor}`}>
                                {isFallback && detectedBackend !== 'SOFTWARE RENDERING' ? `${statusText} (Chromium auto-ajustou)` : statusText}
                              </span>
                            </div>

                            <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Ignore GPU Blocklist</span>
                              <span className={`text-xs font-bold ${gpuDiagData.ignoreBlocklist ? 'text-emerald-400' : 'text-white/60'}`}>
                                {gpuDiagData.ignoreBlocklist ? 'ATIVADO' : 'DESATIVADO'}
                              </span>
                              <span className="text-[9px] text-white/30">Flag --ignore-gpu-blocklist</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Chromium Feature Status Table */}
                      <div>
                        <h4 className="text-xs font-bold text-white/50 mb-2 tracking-wide uppercase">Recursos Chromium GPU</h4>
                        <div className="bg-white/5 border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden text-xs">
                          {gpuDiagData.featureStatus && Object.entries(gpuDiagData.featureStatus).map(([feat, status]) => {
                            const isAcc = status === 'hardware_accelerated';
                            const isDis = status === 'disabled' || status === 'software_only';
                            return (
                              <div key={feat} className="flex items-center justify-between px-4 py-2.5">
                                <span className="font-mono text-white/80">{feat}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isAcc ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                  isDis ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                                  'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}>
                                  {String(status).replace(/_/g, ' ').toUpperCase()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* GPU Info Devices */}
                      {gpuDiagData.gpuInfoBasic?.gpuDevice?.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-white/50 mb-2 tracking-wide uppercase">Dispositivos de Vídeo Detectados</h4>
                          <div className="space-y-3">
                            {gpuDiagData.gpuInfoBasic.gpuDevice.map((dev: any, idx: number) => {
                              const vendorHex = Number(dev.vendorId).toString(16).toUpperCase();
                              const deviceHex = Number(dev.deviceId).toString(16).toUpperCase();
                              const vendorName = dev.driverVendor || (dev.vendorId === 0x10de ? 'NVIDIA' : dev.vendorId === 0x1002 ? 'AMD' : dev.vendorId === 0x8086 ? 'Intel' : 'GPU Adapter');
                              
                              // Helper to parse renderer string for ANGLE backend
                              const glRenderer = gpuDiagData.gpuInfoBasic?.auxAttributes?.glRenderer || '';
                              let rendererShort = 'ANGLE / Native Hardware';
                              if (glRenderer.includes('Vulkan')) rendererShort = 'ANGLE (Vulkan)';
                              else if (glRenderer.includes('Direct3D11') || glRenderer.includes('D3D11')) rendererShort = 'ANGLE (Direct3D 11)';
                              else if (glRenderer.includes('Direct3D12') || glRenderer.includes('D3D12')) rendererShort = 'ANGLE (Direct3D 12)';
                              else if (glRenderer.includes('OpenGL') || glRenderer.includes('GL')) rendererShort = 'OpenGL Desktop';
                              else if (glRenderer.includes('Software') || glRenderer.includes('SwiftShader')) rendererShort = 'Software Rendering';

                              return (
                                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                                  {/* Device Header */}
                                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                    <div className="flex items-center gap-2">
                                      <Cpu className="w-4 h-4 text-accent shrink-0" />
                                      <span className="text-xs font-bold text-white tracking-wide">
                                        {vendorName} (0x{vendorHex})
                                      </span>
                                    </div>
                                    {dev.active ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        GPU ATIVA
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-white/40">
                                        SECUNDÁRIA
                                      </span>
                                    )}
                                  </div>

                                  {/* Info Fields Grid */}
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                                      <span className="text-[10px] text-white/40 uppercase font-bold block mb-0.5">GPU / Fabricante</span>
                                      <span className="text-white font-semibold">{vendorName}</span>
                                    </div>

                                    <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                                      <span className="text-[10px] text-white/40 uppercase font-bold block mb-0.5">Vendor ID / Device ID</span>
                                      <span className="text-white font-mono">0x{vendorHex} / 0x{deviceHex}</span>
                                    </div>

                                    <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                                      <span className="text-[10px] text-white/40 uppercase font-bold block mb-0.5">Driver Version</span>
                                      <span className="text-white font-mono">{dev.driverVersion || 'N/A'}</span>
                                    </div>

                                    <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
                                      <span className="text-[10px] text-white/40 uppercase font-bold block mb-0.5">VRAM</span>
                                      <span className="text-white font-mono font-semibold">
                                        {dev.memoryMb ? `${dev.memoryMb} MB` : gpuDiagData.gpuInfoBasic?.auxAttributes?.videoMemoryMb ? `${gpuDiagData.gpuInfoBasic.auxAttributes.videoMemoryMb} MB` : 'Gerenciado pelo SO'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Renderer Active Backend */}
                                  <div className="pt-1">
                                    <span className="text-[10px] text-white/40 uppercase font-bold block mb-1">Renderer (Chromium Backend)</span>
                                    <div className="p-2.5 bg-black/40 rounded-lg border border-white/5 text-[11px] font-mono text-cyan-300 flex items-center justify-between">
                                      <span className="truncate">{glRenderer || 'Chromium GPU Pipeline'}</span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 shrink-0 ml-2">
                                        {rendererShort}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </ScrollArea>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={fetchGpuDiagnostics}
                    disabled={loadingGpuDiag}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingGpuDiag ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGpuModal(false)}
                    className="px-4 py-1.5 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }



  if (appId === "achievements") {
    const list = [
      "Primeira Conquista", "Desafiador Retrô", "Speedrunner",
      "Colecionador de Saves", "Sem Game Over", "Multitarefa Master"
    ];
    return (
      <ScrollArea className="p-5 h-full text-white">
        <div className="space-y-2">
        <h2 className="text-lg font-bold mb-1">Conquistas</h2>
        <p className="text-xs text-white/50 mb-4">Seu progresso acumulado através do RetroAchievements</p>
        
        {list.map((a, i) => (
          <div key={a} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl p-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-md">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-white/95">{a}</div>
              <div className="text-xs text-white/40">Desbloqueado há {i + 1} dias atrás</div>
            </div>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
        ))}
        </div>
      </ScrollArea>
    );
  }

  if (appId === "database") {
    return <DatabaseApp />;
  }

  return null;
}
