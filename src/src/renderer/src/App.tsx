import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Search, Power, X, Minus, Square, Gamepad2, Joystick, Monitor,
  Settings as SettingsIcon, Trophy, Folder, Grid3x3,
  Cpu, Wifi, Volume2, Battery, Star, Play, Save, Download,
  Library, Sparkles, ChevronRight, Heart, RefreshCw, Loader2, Info,
  MoreHorizontal
} from "lucide-react";

/* ----------------------------- App definitions ---------------------------- */

type ToolAppId = "library" | "saves" | "settings" | "files" | "achievements";

type System = {
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

type Game = {
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
};

type WinState = {
  id: string;
  type: "system" | "tool";
  appId: string; // system name or tool app id
  x: number; y: number; w: number; h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prev?: { x: number; y: number; w: number; h: number };
};

const TOOL_APPS = [
  { id: "library",      name: "Biblioteca",     icon: Library,      color: "from-indigo-500 to-violet-600", initialSize: { w: 980, h: 620 } },
  { id: "saves",        name: "Saves",          icon: Save,         color: "from-cyan-500 to-blue-600",     initialSize: { w: 760, h: 540 } },
  { id: "achievements", name: "Conquistas",     icon: Trophy,       color: "from-yellow-500 to-amber-600",  initialSize: { w: 720, h: 520 } },
  { id: "files",        name: "Arquivos",       icon: Folder,       color: "from-sky-500 to-indigo-600",    initialSize: { w: 820, h: 560 } },
  { id: "settings",     name: "Configurações",  icon: SettingsIcon, color: "from-zinc-500 to-zinc-700",     initialSize: { w: 820, h: 560 } },
];

// System Specific Styles
export const getSystemTheme = (sysName: string) => {
  const name = sysName.toLowerCase();
  // if (name === "ps2") return { icon: Joystick, color: "from-blue-500 to-indigo-700", bg: "radial-gradient(1200px at 50% 50%, #0c2054 0%, #03081a 100%)" };
  // if (name === "snes") return { icon: Gamepad2, color: "from-purple-500 to-fuchsia-600", bg: "radial-gradient(1200px at 50% 50%, #2f0e42 0%, #0b0312 100%)" };
  // if (name === "switch" || name === "nswitch") return { icon: Gamepad2, color: "from-red-500 to-rose-600", bg: "radial-gradient(1200px at 50% 50%, #4a0914 0%, #170205 100%)" };
  // if (name === "psx" || name === "ps1") return { icon: Joystick, color: "from-slate-500 to-slate-800", bg: "radial-gradient(1200px at 50% 50%, #202738 0%, #07090f 100%)" };
  // if (name === "n64") return { icon: Gamepad2, color: "from-emerald-500 to-teal-700", bg: "radial-gradient(1200px at 50% 50%, #083b24 0%, #010d07 100%)" };
  // if (name === "arcade" || name === "mame" || name === "fbneo") return { icon: Joystick, color: "from-amber-500 to-orange-600", bg: "radial-gradient(1200px at 50% 50%, #3d1b04 0%, #120601 100%)" };
  return { icon: Gamepad2, color: "from-indigo-500 to-violet-600", bg: "radial-gradient(1200px at 50% 50%, #1e1b4b 0%, #0a051d 100%)" };
};

export default function App() {
  const [systems, setSystems] = useState<System[]>([]);
  const [windows, setWindows] = useState<WinState[]>([]);
  const [zTop, setZTop] = useState(10);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(new Date());
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<Game | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [nativeWins, setNativeWins] = useState<{ type: string; appId: string; minimized: boolean }[]>([]);
  const [overlaySystemUrl, setOverlaySystemUrl] = useState<string>("");
  const [activeSubWindowId, setActiveSubWindowId] = useState<string | null>(null);
  const [activeGameArt, setActiveGameArt] = useState<string | null>(null);
  const [controllers, setControllers] = useState<any[]>([]);

  useEffect(() => {
    window.api.getOverlayPath("overlay-system.png").then((url: string) => {
      setOverlaySystemUrl(url);
    });
  }, []);

  // Monitor gamepad connections and synchronize active controllers with main process
  useEffect(() => {
    let lastControllersStr = "";

    const updateControllers = () => {
      const gamepads = navigator.getGamepads();
      const active = Array.from(gamepads)
        .filter((gp) => gp !== null)
        .map((gp) => {
          const id = gp!.id;
          const vMatch = id.match(/vendor: ([0-9a-f]{4})/i);
          const pMatch = id.match(/product: ([0-9a-f]{4})/i);

          let guid = id;
          if (vMatch && pMatch) {
            const v = vMatch[1];
            const p = pMatch[1];
            const vSwap = v.substring(2, 4) + v.substring(0, 2);
            const pSwap = p.substring(2, 4) + p.substring(0, 2);
            guid = `03000000${vSwap}0000${pSwap}000000000000`;
          } else if (
            id.toLowerCase().includes('xinput') ||
            id.toLowerCase().includes('xbox 360')
          ) {
            guid = '030000005e0400008e02000000007200';
          }

          return {
            name: id.split('(')[0].trim(),
            guid: guid,
            buttons: gp!.buttons.length,
            axes: gp!.axes.length,
            hats: 1,
          };
        });

      const currentStr = JSON.stringify(active);
      if (currentStr !== lastControllersStr) {
        lastControllersStr = currentStr;
        setControllers(active);
        window.api.executeCommand('set-active-controllers', active);
      }
    };

    let rafId: number;
    const poll = () => {
      updateControllers();
      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);

    window.addEventListener('gamepadconnected', updateControllers);
    window.addEventListener('gamepaddisconnected', updateControllers);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('gamepadconnected', updateControllers);
      window.removeEventListener('gamepaddisconnected', updateControllers);
    };
  }, []);

  // Listen for native subwindows state changes
  useEffect(() => {
    const unsubscribe = window.api.on('subwindow-state-changed', (_event: any, data: { type: string; id: string; state: string }) => {
      // 1. Update focused subwindow id (keep background active on blur)
      if (data.state === 'focused') {
        setActiveSubWindowId(data.id);
      }

      // 2. Update list of native windows and resolve background fallback on close/hide
      setNativeWins(prev => {
        const list = data.state === 'closed'
          ? prev.filter(w => !(w.appId === data.id && w.type === data.type))
          : prev.find(w => w.appId === data.id && w.type === data.type)
            ? prev.map(w => w.appId === data.id && w.type === data.type 
                ? { ...w, minimized: data.state === 'hidden' ? true : (data.state === 'focused' ? false : w.minimized) } 
                : w
              )
            : [...prev, { type: data.type, appId: data.id, minimized: data.state === 'hidden' }];

        // 3. Fallback active subwindow if the current active one was closed or hidden
        if (data.state === 'closed' || data.state === 'hidden') {
          setActiveSubWindowId(currentActive => {
            if (currentActive === data.id) {
              const nextVisible = list.find(w => w.type === 'system' && !w.minimized);
              return nextVisible ? nextVisible.appId : null;
            }
            return currentActive;
          });
        }

        return list;
      });
    });
    return () => unsubscribe();
  }, []);

  // Parse URL Search Parameters for Standalone mode
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const windowType = params.get("windowType");   // "system" | "tool" | null
  const systemName = params.get("systemName");   // ex: "snes"
  const toolId = params.get("toolId");           // ex: "settings"

  // Fast boot: Skip overlay synchronized loader inside standalone windows
  const [libraryLoading, setLibraryLoading] = useState(windowType === null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Iniciando RIESCADE OS...");
  
  const desktopRef = useRef<HTMLDivElement>(null);

  const handleSaveSetting = useCallback((name: string, value: any, type: "string" | "bool" | "int" | "float") => {
    window.api.saveSetting(name, value, type).then(() => {
      setSettings((prev: any) => ({
        ...prev,
        [name]: { value }
      }));
    });
  }, []);

  const getDesktopIcons = useCallback(() => {
    const raw = settings["Desktop.Icons"]?.value;
    if (raw !== undefined) {
      return String(raw).split(",").filter(Boolean);
    }
    return ["tool:library", "tool:saves", "tool:achievements", "tool:files"];
  }, [settings]);

  const getTaskbarIcons = useCallback(() => {
    const raw = settings["Taskbar.Icons"]?.value;
    if (raw !== undefined) {
      return String(raw).split(",").filter(Boolean);
    }
    return ["tool:library", "tool:saves", "tool:achievements", "tool:files", "tool:settings"];
  }, [settings]);

  const resolveIconItem = useCallback((itemKey: string) => {
    const [type, id] = itemKey.split(":");
    if (type === "tool") {
      const tool = TOOL_APPS.find(t => t.id === id);
      if (tool) {
        return {
          id: itemKey,
          type: "tool" as const,
          appId: id,
          name: tool.name,
          icon: tool.icon,
          color: tool.color,
          logo: null
        };
      }
    } else if (type === "system") {
      const sys = systems.find(s => s.name === id);
      if (sys) {
        const theme = getSystemTheme(id);
        return {
          id: itemKey,
          type: "system" as const,
          appId: id,
          name: sys.fullname,
          icon: theme.icon,
          color: theme.color,
          logo: sys.logo || null
        };
      }
    }
    return null;
  }, [systems]);

  // Load clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Listen for systems loading progress from backend
  useEffect(() => {
    const unsubscribe = window.api.on('systems-loading-progress', (_event: any, progress: number) => {
      setLoadingProgress(Math.min(100, Math.max(0, Math.round(progress * 5))));
    });
    return () => unsubscribe();
  }, []);

  // Listen for settings changes from other windows (e.g. standalone Settings window)
  useEffect(() => {
    const unsubscribe = window.api.on('setting-changed', (_event: any, data: { name: string; value: any; type: string }) => {
      setSettings((prev: any) => ({
        ...prev,
        [data.name]: { value: data.value, type: data.type }
      }));
    });
    return () => unsubscribe();
  }, []);

  // Fetch Systems & Settings on Mount
  useEffect(() => {
    setLoadingMessage("Carregando banco de dados...");
    window.api.preloadLibrary().then(() => {
      setLoadingMessage("Sincronizando plataformas...");
      Promise.all([
        window.api.getSystems(),
        window.api.getSettings()
      ]).then(([sysList, appSettings]) => {
        setLoadingMessage("Carregando configurações de exibição...");
        setSystems(sysList || []);
        setSettings(appSettings || {});
        
        setTimeout(() => {
          setLibraryLoading(false);
        }, 800); // 0.8s smooth fade-out
      });
    }).catch((err) => {
      console.error("Failed to preload library:", err);
      setLibraryLoading(false);
    });
  }, []);

  // Open App - Hybrid router (natively opens platforms, virtually opens tools in the main window)
  const openApp = useCallback((type: "system" | "tool", appId: string) => {
    setLauncherOpen(false);
    if (type === "system") {
      window.api.openAppWindow(type, appId);
    } else {
      setWindows(prev => {
        const existing = prev.find(w => w.appId === appId && w.type === type);
        const nextZ = zTop + 1;
        setZTop(nextZ);
        if (existing) {
          return prev.map(w => w.id === existing.id ? { ...w, minimized: false, z: nextZ } : w);
        }
        
        let initialSize = { w: 840, h: 560 };
        const def = TOOL_APPS.find(a => a.id === appId);
        if (def) initialSize = def.initialSize;

        const dx = (prev.length % 6) * 28;
        const dy = (prev.length % 6) * 24;
        const vw = desktopRef.current?.clientWidth ?? 1280;
        const vh = desktopRef.current?.clientHeight ?? 720;
        
        return [
          ...prev,
          {
            id: `${appId}-${Date.now()}`,
            type,
            appId,
            x: Math.max(40, (vw - initialSize.w) / 2 + dx),
            y: Math.max(40, (vh - initialSize.h) / 2 + dy),
            w: initialSize.w,
            h: initialSize.h,
            z: nextZ,
            minimized: false,
            maximized: false,
          },
        ];
      });
    }
  }, [zTop]);

  // Window Actions for virtual tool windows
  const focusWin  = (id: string) => setWindows(prev => {
    const target = prev.find(w => w.id === id);
    // Skip if window is already on top and not minimized (avoids unnecessary re-renders)
    if (target && target.z === zTop && !target.minimized) return prev;
    const nz = zTop + 1; setZTop(nz);
    return prev.map(w => w.id === id ? { ...w, z: nz, minimized: false } : w);
  });
  const closeWin  = (id: string) => setWindows(prev => prev.filter(w => w.id !== id));
  const minWin    = (id: string) => setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
  const maxWin    = (id: string) => setWindows(prev => prev.map(w => {
    if (w.id !== id) return w;
    if (w.maximized && w.prev) return { ...w, ...w.prev, maximized: false, prev: undefined };
    return { 
      ...w, 
      prev: { x: w.x, y: w.y, w: w.w, h: w.h }, 
      x: 12, y: 12, 
      w: (desktopRef.current?.clientWidth ?? 1280) - 24, 
      h: (desktopRef.current?.clientHeight ?? 720) - 96, 
      maximized: true 
    };
  }));
  const moveWin   = (id: string, x: number, y: number) =>
    setWindows(prev => prev.map(w => w.id === id ? { ...w, x, y } : w));

  // Determine Dynamic Background
  const activeBg = useMemo(() => {
    if (windowType === "system" && systemName) {
      return getSystemTheme(systemName).bg;
    }
    const activeWin = [...windows]
      .filter(w => !w.minimized)
      .sort((a, b) => b.z - a.z)[0];
    
    if (activeWin && activeWin.type === "system") {
      return getSystemTheme(activeWin.appId).bg;
    }
    return "radial-gradient(1200px 800px at 20% 10%, #2d1b69 0%, transparent 60%), radial-gradient(1000px 700px at 85% 90%, #1e3a8a 0%, transparent 55%), linear-gradient(180deg, #0a0a23 0%, #0f0f2e 100%)";
  }, [windows, windowType, systemName]);

  const activeSubWindowArt = useMemo(() => {
    if (!activeSubWindowId) return null;
    const sys = systems.find(s => s.name === activeSubWindowId);
    return sys?.art || null;
  }, [activeSubWindowId, systems]);

  // Launch Game Handler
  const handleLaunchGame = (game: Game, system: System) => {
    setIsLaunching(true);
    setLaunchingGame(game);
    window.api.launchGame(game, system).then(() => {
      setIsLaunching(false);
      setLaunchingGame(null);
    }).catch(() => {
      setIsLaunching(false);
      setLaunchingGame(null);
    });
  };

  // Top-level beautiful loading screen
  if (libraryLoading) {
    return (
      <div key="loading-screen" className="w-screen h-screen bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] select-none text-center">
        <div className="glass-strong rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-white/10 flex flex-col items-center select-none text-center animate-in zoom-in-95 duration-200">
          <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Sincronizando Plataformas</h3>
          <p className="text-xs text-white/50 mb-6 leading-relaxed">
            Aguarde enquanto o RIESCADE OS sincroniza suas plataformas de jogos e emuladores.
          </p>
          
          <div className="flex flex-col items-center gap-3 w-full">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            <span className="text-xs font-semibold text-white/60 animate-pulse">{loadingMessage}</span>
          </div>

          {/* Progresso Dinâmico */}
          {loadingProgress > 0 && (
            <div className="w-full mt-5">
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full transition-all duration-300" 
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <div className="text-[10px] text-white/40 mt-1.5 text-right font-semibold">
                {loadingProgress}%
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Standalone System Window (Spotify-like Frameless)
  if (windowType === "system" && systemName) {
    const system = systems.find(s => s.name === systemName);
    const theme = getSystemTheme(systemName);

    if (!system) {
      return (
        <div key="system-not-found" className="w-screen h-screen flex items-center justify-center text-white bg-[#0a051d]">
          <span className="text-sm font-semibold text-white/60 animate-pulse">Buscando plataforma em cache...</span>
        </div>
      );
    }

    const platformBackgroundArt = activeGameArt || system.art || null;

    return (
      <div key={`system-${systemName}`} className="w-screen h-screen overflow-hidden select-none flex flex-col relative" style={{ background: activeBg }}>
        {platformBackgroundArt && (
          <div 
            key={platformBackgroundArt}
            className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-20 animate-in fade-in duration-1000 z-0"
            style={{ backgroundImage: `url("${platformBackgroundArt}")` }}
          />
        )}

        {/* Spotify-like premium draggable custom titlebar */}
        <div 
          className="h-14 px-4 pr-0 flex items-center justify-between select-none shrink-0 relative z-10 bg-black/60 backdrop-blur-xl border-b border-white/5" 
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          {/* Left Side: Three dots menu & Console Logo */}
          <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button className="text-white/60 hover:text-white transition cursor-pointer">
              <MoreHorizontal className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {system.logo ? (
                <img src={system.logo} alt={system.fullname} className="h-7 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
              ) : (
                <span className="text-[10px] font-extrabold tracking-wider text-white/40 uppercase">{system.fullname}</span>
              )}
            </div>
          </div>

          {/* Center: Spotify-Style Pill Search Bar */}
          <div className="flex-1 max-w-[440px] mx-auto" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="relative flex items-center bg-[#242424] border border-transparent rounded-full px-3.5 py-2.5 hover:bg-[#2a2a2a] hover:border-white/5 focus-within:bg-[#242424] focus-within:border-white/10 focus-within:ring-2 focus-within:ring-white/10 transition-all duration-200">
              <Search className="w-4 h-4 text-white/55 shrink-0 mr-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`O que você quer jogar no ${system.fullname}?`}
                className="w-full bg-transparent border-none text-xs text-white placeholder:text-white/40 focus:outline-none"
              />
              <div className="h-3.5 w-px bg-white/10 mx-2 shrink-0" />
              <Folder className="w-4 h-4 text-white/55 hover:text-white transition cursor-pointer shrink-0" title="Navegar Arquivos" />
            </div>
          </div>

          {/* Right Side: Native Window Controls (Windows styled) */}
          <div className="flex items-center h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button 
              onClick={() => window.api.minimizeWindow()} 
              className="w-11 h-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
              title="Minimizar"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button 
              onClick={() => window.api.maximizeWindow()} 
              className="w-11 h-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
              title="Maximizar"
            >
              <Square className="w-3 h-3" />
            </button>
            <button 
              onClick={() => window.api.closeWindow()} 
              className="w-11 h-full hover:bg-red-600 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative z-10">
          <div className="relative z-10 h-full">
            <SystemAppContent
              systemName={systemName}
              system={system}
              color={theme.color}
              Icon={theme.icon}
              onLaunchGame={handleLaunchGame}
              search={search}
              setSearch={setSearch}
              onActiveGameArtChanged={setActiveGameArt}
            />
          </div>
        </div>

        {/* Premium Full-screen Game Loading Backdrop */}
        {isLaunching && launchingGame && (
          <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="relative flex flex-col items-center">
              <div className="relative w-36 h-36 rounded-full bg-violet-600/20 flex items-center justify-center border border-violet-500/20 shadow-2xl mb-8 animate-pulse">
                <Loader2 className="w-16 h-16 text-violet-400 animate-spin" />
              </div>
              <h2 className="text-2xl font-bold tracking-wider text-white/90 mb-2">INICIANDO</h2>
              <p className="text-xl font-medium text-white/70">{launchingGame.name}</p>
              <p className="text-xs text-white/40 uppercase tracking-widest mt-2">{launchingGame.system}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standalone Tool Window
  if (windowType === "tool" && toolId) {
    return (
      <div key={`tool-${toolId}`} className="w-screen h-screen overflow-hidden select-none animate-in fade-in duration-300" style={{ background: activeBg }}>
        <ToolAppContent
          appId={toolId}
          systems={systems}
          onOpenSystem={(sysName) => {
            window.api.openAppWindow("system", sysName);
          }}
          settings={settings}
          onSaveSetting={handleSaveSetting}
        />
      </div>
    );
  }

  // Default Desktop Window
  return (
    <div key="desktop-container" className="w-screen h-screen flex flex-col overflow-hidden select-none">
      {/* Draggable custom titlebar */}
      <div 
        className="h-14 px-4 pr-0 flex items-center justify-between select-none shrink-0 z-80 fixed top-0 w-full" 
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Left Side: App Title/Logo */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <Gamepad2 className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-bold tracking-wider text-white">RIESCADE OS</span>
        </div>

        {/* Right Side: Native Window Controls (Windows styled) */}
        <div className="flex items-center h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button 
            onClick={() => window.api.minimizeWindow()} 
            className="w-11 h-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={() => window.api.maximizeWindow()} 
            className="w-11 h-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button 
            onClick={() => window.api.closeWindow()} 
            className="w-11 h-full hover:bg-red-600 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={desktopRef}
        className="flex-1 relative overflow-hidden"
        style={{ background: activeBg, transition: "background 0.8s ease" }}
        onClick={() => setLauncherOpen(false)}
      >
        {/* Desktop Active System Background Art Overlay with Fade-in */}
        {activeSubWindowArt && (
          <div 
            key={activeSubWindowArt}
            className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-80 animate-in fade-in duration-1000 z-0"
            style={{ backgroundImage: `url("${activeSubWindowArt}")` }}
          />
        )}
      {/* Floating orbs wallpaper */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-20 left-40 w-72 h-72 rounded-full bg-violet-600/10 blur-3xl animate-float" />
        <div className="absolute bottom-40 right-32 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl animate-float" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-cyan-500/5 blur-3xl animate-float" style={{ animationDelay: "4s" }} />
      </div>

      {/* Desktop shortcuts */}
      <div className="absolute top-6 left-6 flex flex-col gap-4 z-40">
        {getDesktopIcons()
          .map(resolveIconItem)
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onDoubleClick={() => openApp(item.type, item.appId)}
                onClick={(e) => e.stopPropagation()}
                className="group flex flex-col items-center gap-1 w-20 p-2 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <div className="w-12 h-12 flex items-center justify-center">
                  {item.logo ? (
                    <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-all" />
                  ) : (
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-white/90 text-center drop-shadow truncate w-full font-medium leading-tight">{item.name}</span>
              </button>
            );
          })}
      </div>

      {/* Render Floating Windows (Tools only) */}
      {windows.filter(w => !w.minimized).map(w => {
        let title = "";
        let color = "";
        let Icon = Monitor;

        if (w.type === "tool") {
          const def = TOOL_APPS.find(t => t.id === w.appId)!;
          title = def.name;
          color = def.color;
          Icon = def.icon;
        }

        return (
          <WindowFrame
            key={w.id}
            state={w}
            title={title}
            color={color}
            Icon={Icon}
            onFocus={() => focusWin(w.id)}
            onClose={() => closeWin(w.id)}
            onMinimize={() => minWin(w.id)}
            onMaximize={() => maxWin(w.id)}
            onMove={(x, y) => moveWin(w.id, x, y)}
          >
            <ToolAppContent
              appId={w.appId}
              systems={systems}
              onOpenSystem={(sysName) => openApp("system", sysName)}
              settings={settings}
              onSaveSetting={handleSaveSetting}
            />
          </WindowFrame>
        );
      })}

      {/* App Launcher Start Menu */}
      {launcherOpen && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pt-16 pb-32"
          onClick={(e) => { e.stopPropagation(); setLauncherOpen(false); }}
        >
          <div
            className="glass-strong rounded-3xl w-[760px] max-w-[90%] h-[78%] p-6 flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar plataformas ou ferramentas..."
                className="w-full bg-white/10 border border-white/15 rounded-full pl-11 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-violet-400/60"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2">
              <div className="text-xs uppercase text-white/40 tracking-wider mb-3">Plataformas de Jogos</div>
              <div className="grid grid-cols-5 gap-3 mb-6">
                {systems
                  .filter(sys => sys.fullname.toLowerCase().includes(search.toLowerCase()) || sys.name.toLowerCase().includes(search.toLowerCase()))
                  .map(sys => {
                    const theme = getSystemTheme(sys.name);
                    const SysIcon = theme.icon;
                    return (
                      <button
                        key={sys.name}
                        onClick={() => openApp("system", sys.name)}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/10 transition group"
                      >
                        <div className="w-12 h-12 flex items-center justify-center">
                          {sys.logo ? (
                            <img src={sys.logo} alt={sys.fullname} className="h-full object-contain max-w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-all" />
                          ) : (
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${theme.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition`}>
                              <SysIcon className="w-6 h-6 text-white" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-white/90 text-center leading-tight truncate w-full">{sys.fullname}</span>
                      </button>
                    );
                  })}
              </div>

              <div className="text-xs uppercase text-white/40 tracking-wider mb-3">Ferramentas do Sistema</div>
              <div className="grid grid-cols-5 gap-3">
                {TOOL_APPS
                  .filter(app => app.name.toLowerCase().includes(search.toLowerCase()))
                  .map(app => {
                    const ToolIcon = app.icon;
                    return (
                      <button
                        key={app.id}
                        onClick={() => openApp("tool", app.id)}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/10 transition group"
                      >
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition`}>
                          <ToolIcon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs text-white/90 text-center leading-tight">{app.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold shadow-md">R</div>
                <span className="text-sm font-medium text-white/80">RIESCADE Player</span>
              </div>
              <button 
                onClick={() => window.api.executeCommand("shutdown")}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-red-500/80 flex items-center justify-center transition"
                title="Desligar"
              >
                <Power className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay behind the taskbar */}
      {overlaySystemUrl && (
        <>
        <div 
          className="pointer-events-none absolute w-full h-full top-0 left-0 bg-center bg-no-repeat bg-cover z-20 opacity-80"
          style={{ backgroundImage: `url("${overlaySystemUrl}")` }}
        />       
        <div 
          className="pointer-events-none absolute w-full h-full top-0 left-0 bg-center bg-no-repeat bg-cover z-20 opacity-80"
          style={{ backgroundImage: `url("${overlaySystemUrl}")` }}
        />
        </>
      )}

      {/* Taskbar inferior flutuante */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50" onClick={(e) => e.stopPropagation()}>
        <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-2 shadow-2xl">
          
          {/* Start Menu button */}
          <button
            onClick={() => setLauncherOpen(v => !v)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${launcherOpen ? "bg-violet-500/40" : "bg-gradient-to-br from-violet-600 to-indigo-700 hover:scale-105"}`}
            title="Menu RIESCADE"
          >
            <Grid3x3 className="w-5 h-5 text-white" />
          </button>

          <div className="w-px h-8 bg-white/15 mx-1" />

          {/* Pinned Apps */}
          {getTaskbarIcons()
            .map(resolveIconItem)
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .map(item => {
              const Icon = item.icon;
              const isOpen = item.type === "tool"
                ? windows.some(w => w.appId === item.appId && w.type === "tool")
                : nativeWins.some(w => w.appId === item.appId && w.type === "system");
              const isMinimized = item.type === "tool"
                ? (windows.find(w => w.appId === item.appId && w.type === "tool")?.minimized ?? false)
                : (nativeWins.find(w => w.appId === item.appId && w.type === "system")?.minimized ?? false);

              return (
                <button
                  key={item.id}
                  onClick={() => openApp(item.type, item.appId)}
                  className="relative w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition group cursor-pointer"
                  title={item.name}
                >
                  <div className="w-7 h-7 flex items-center justify-center">
                    {item.logo ? (
                      <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full" />
                    ) : (
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all ${isMinimized ? "w-1 bg-white/40" : "w-5 bg-violet-400"}`} />
                  )}
                </button>
              );
            })}

          {/* Dynamic Running Apps Separator & Icons */}
          {(() => {
            const pinnedKeys = getTaskbarIcons();
            const runningTools = windows
              .filter(w => !pinnedKeys.includes(`tool:${w.appId}`))
              .filter((w, idx, self) => self.findIndex(x => x.appId === w.appId) === idx)
              .map(w => {
                const resolved = resolveIconItem(`tool:${w.appId}`);
                return resolved ? { ...resolved, isMinimized: w.minimized } : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            const runningSystems = nativeWins
              .filter(w => !pinnedKeys.includes(`system:${w.appId}`))
              .map(w => {
                const resolved = resolveIconItem(`system:${w.appId}`);
                return resolved ? { ...resolved, isMinimized: w.minimized } : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            const dynamicRunning = [...runningTools, ...runningSystems];

            if (dynamicRunning.length === 0) return null;

            return (
              <>
                <div className="w-px h-8 bg-white/15 mx-1" />
                {dynamicRunning.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openApp(item.type, item.appId)}
                      className="relative w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition group animate-in zoom-in-95 duration-200 cursor-pointer"
                      title={item.name}
                    >
                      <div className="w-7 h-7 flex items-center justify-center">
                        {item.logo ? (
                          <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full" />
                        ) : (
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all ${item.isMinimized ? "w-1 bg-white/40" : "w-5 bg-violet-400"}`} />
                    </button>
                  );
                })}
              </>
            );
          })()}

          <div className="w-px h-8 bg-white/15 mx-1" />

          {/* System tray */}
          <div className="flex items-center gap-2 px-3 text-white/80">
            {controllers.length > 0 && (
              <Gamepad2 className="w-4 h-4 text-violet-400 mr-1 animate-pulse" title={`${controllers.length} controle(s) conectado(s)`} />
            )}
            <Wifi className="w-4 h-4 text-white/60" />
            <Volume2 className="w-4 h-4 text-white/60" />
            <Battery className="w-4 h-4 text-white/60" />
            <div className="text-xs leading-tight ml-1 flex text-right gap-1 pl-3">
              <span className="font-semibold text-white capitalize">{now.toLocaleDateString("pt-BR", { month: "short" })}</span>
              <span className="font-semibold text-white">{now.toLocaleDateString("pt-BR", { day: "2-digit" })}</span>
              <span className="font-semibold text-white">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
    </div>
  );
}

/* ----------------------------- WindowFrame Component ---------------------------- */

function WindowFrame({
  state, title, color, Icon, onFocus, onClose, onMinimize, onMaximize, onMove, children
}: {
  state: WinState;
  title: string;
  color: string;
  Icon: any;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
  children: React.ReactNode;
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; windowX: number; windowY: number; lastX: number; lastY: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (state.maximized) return;
    onFocus();
    dragRef.current = { 
      startX: e.clientX, 
      startY: e.clientY, 
      windowX: state.x, 
      windowY: state.y,
      lastX: state.x,
      lastY: state.y
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, dragRef.current.windowX + deltaX);
    const newY = Math.max(0, dragRef.current.windowY + deltaY);
    
    dragRef.current.lastX = newX;
    dragRef.current.lastY = newY;

    if (windowRef.current) {
      windowRef.current.style.left = `${newX}px`;
      windowRef.current.style.top = `${newY}px`;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      onMove(dragRef.current.lastX, dragRef.current.lastY);
    }
    dragRef.current = null;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch {/* ignore */}
  };

  return (
    <div
      ref={windowRef}
      onMouseDown={onFocus}
      className="absolute glass-strong rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 bg-[#090909] z-40"
      style={{ left: state.x, top: state.y, width: state.w, height: state.h, zIndex: state.z }}
    >
      {/* Titlebar */}
      <div
        className="h-14 pl-4 pr-0 flex items-center justify-between bg-[#090909] border-b border-white/5 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onMaximize}
      >
        {/* Left Side: Menu button & Title */}
        <div className="flex items-center gap-4" onPointerDown={e => e.stopPropagation()}>
          <button className="text-white/60 hover:text-white transition cursor-pointer">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className={`w-6.5 h-6.5 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
              <Icon className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-white/95">{title}</span>
          </div>
        </div>
        
        {/* Right Side: Native Window Controls (Windows styled) */}
        <div className="flex items-center h-full shrink-0" onPointerDown={e => e.stopPropagation()}>
          <button 
            onClick={onMinimize} 
            className="w-11 h-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={onMaximize} 
            className="w-11 h-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button 
            onClick={onClose} 
            className="w-11 h-full hover:bg-red-600 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}

/* ----------------------------- System App Content ---------------------------- */

function SystemAppContent({
  system, color, Icon, onLaunchGame, search, setSearch, onActiveGameArtChanged
}: {
  systemName: string;
  system: System;
  color: string;
  Icon: any;
  onLaunchGame: (game: Game, system: System) => void;
  search: string;
  setSearch: (s: string) => void;
  onActiveGameArtChanged?: (art: string | null) => void;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [loading, setLoading] = useState(true);
  
  const [displayLimit, setDisplayLimit] = useState(40);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // New filter states for metadata tags
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedPlayers, setSelectedPlayers] = useState<string>("all");
  const [selectedMinRating, setSelectedMinRating] = useState<string>("all");

  // Reset display limit when system, search, filter or metadata filters change
  useEffect(() => {
    setDisplayLimit(40);
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollTop = 0;
    }
  }, [system, search, filter, selectedGenre, selectedYear, selectedPlayers, selectedMinRating]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight * 1.5) {
      if (displayLimit < filteredGames.length) {
        setDisplayLimit(prev => Math.min(filteredGames.length, prev + 40));
      }
    }
  };

  // Load Games of Platform & Reset Filters
  useEffect(() => {
    setLoading(true);
    setSelectedGenre("all");
    setSelectedYear("all");
    setSelectedPlayers("all");
    setSelectedMinRating("all");
    window.api.getGames(system.name).then((gameList: Game[]) => {
      setGames(gameList || []);
      setSelectedIdx(0);
      setLoading(false);
    });
  }, [system]);

  // Extract unique genres, years, player options, and ratings from games dynamically
  const filterOptions = useMemo(() => {
    const genresSet = new Set<string>();
    const yearsSet = new Set<string>();
    const playersSet = new Set<string>();
    const ratingsSet = new Set<number>();

    games.forEach(g => {
      // Robust case-insensitive tag fallback
      const genre = g.genre || (g as any).Genre;
      const releasedate = g.releasedate || (g as any).ReleaseDate;
      const players = g.players || (g as any).Players;
      const rating = g.rating !== undefined ? g.rating : (g as any).Rating;

      if (genre) {
        const parts = String(genre).split(/[,;/]/).map(s => s.trim()).filter(Boolean);
        parts.forEach(p => genresSet.add(p));
      }
      if (releasedate && String(releasedate).length >= 4) {
        const year = String(releasedate).substring(0, 4);
        if (/^\d{4}$/.test(year)) {
          yearsSet.add(year);
        }
      }
      if (players) {
        playersSet.add(String(players).trim());
      }
      if (rating !== undefined && rating !== null) {
        let numRating = parseFloat(String(rating));
        if (!isNaN(numRating)) {
          // Normalize 0-10 ratings to 0-1 range
          if (numRating > 1) {
            numRating = numRating / 10;
          }
          ratingsSet.add(numRating);
        }
      }
    });

    // Dynamically build rating filter options based on ratings present in the current gamelist
    const hasRatingAbove = (val: number) => Array.from(ratingsSet).some(r => r >= val);
    const availableRatings: { label: string; value: string }[] = [];
    if (hasRatingAbove(0.9)) availableRatings.push({ label: "⭐ 9.0+ (Excelente)", value: "9" });
    if (hasRatingAbove(0.8)) availableRatings.push({ label: "⭐ 8.0+ (Muito Bom)", value: "8" });
    if (hasRatingAbove(0.7)) availableRatings.push({ label: "⭐ 7.0+ (Bom)", value: "7" });
    if (hasRatingAbove(0.5)) availableRatings.push({ label: "⭐ 5.0+ (Mediano)", value: "5" });

    return {
      genres: Array.from(genresSet).sort(),
      years: Array.from(yearsSet).sort((a, b) => b.localeCompare(a)), // Newest first
      players: Array.from(playersSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      ratings: availableRatings
    };
  }, [games]);

  // Apply filters including genre, release year, players, and rating dynamically
  const filteredGames = useMemo(() => {
    return games.filter(g => {
      const gName = String(g.name || "");
      const matchSearch = gName.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "all" || g.favorite;
      
      const genre = g.genre || (g as any).Genre;
      const releasedate = g.releasedate || (g as any).ReleaseDate;
      const players = g.players || (g as any).Players;
      const rating = g.rating !== undefined ? g.rating : (g as any).Rating;

      const matchGenre = selectedGenre === "all" || 
        (genre && String(genre).toLowerCase().includes(selectedGenre.toLowerCase()));
        
      const matchYear = selectedYear === "all" || 
        (releasedate && String(releasedate).substring(0, 4) === selectedYear);
        
      const matchPlayers = selectedPlayers === "all" || 
        (players && String(players).trim() === selectedPlayers);
        
      const matchRating = selectedMinRating === "all" || (() => {
        if (rating === undefined || rating === null) return false;
        let numRating = parseFloat(String(rating));
        if (numRating > 1) {
          numRating = numRating / 10;
        }
        const val = numRating * 10;
        const minVal = parseFloat(selectedMinRating);
        return val >= minVal;
      })();
      
      return matchSearch && matchFilter && matchGenre && matchYear && matchPlayers && matchRating;
    });
  }, [games, search, filter, selectedGenre, selectedYear, selectedPlayers, selectedMinRating]);

  const selectedGame = filteredGames[selectedIdx];

  // Synchronize active game art background with the main window
  useEffect(() => {
    let gameArtUrl: string | null = null;
    if (selectedGame) {
      const rawArt = selectedGame.fanart || selectedGame.image || selectedGame.thumbnail || null;
      gameArtUrl = rawArt ? (rawArt.startsWith("http") || rawArt.startsWith("file://") ? rawArt : `file:///${rawArt.replace(/\\/g, '/')}`) : null;
      window.api.executeCommand("active-game-art-changed", { systemName: system.name, art: gameArtUrl });
    } else {
      window.api.executeCommand("active-game-art-changed", { systemName: system.name, art: null });
    }

    if (onActiveGameArtChanged) {
      onActiveGameArtChanged(gameArtUrl);
    }

    // Clean up on unmount or system change
    return () => {
      window.api.executeCommand("active-game-art-changed", { systemName: system.name, art: null });
      if (onActiveGameArtChanged) {
        onActiveGameArtChanged(null);
      }
    };
  }, [selectedGame, system, onActiveGameArtChanged]);

  const backgroundArt = useMemo(() => {
    if (selectedGame) {
      const rawArt = selectedGame.fanart || selectedGame.image || selectedGame.thumbnail || null;
      if (rawArt) {
        return rawArt.startsWith("http") || rawArt.startsWith("file://") ? rawArt : `file:///${rawArt.replace(/\\/g, '/')}`;
      }
    }
    return system.art || null;
  }, [selectedGame, system]);

  // Build Emulator/Core selection list
  const emulatorChoices = useMemo(() => {
    const choices: { label: string; value: string; emulator: string; core: string }[] = [];
    choices.push({ label: "Padrão (Auto)", value: "auto", emulator: "auto", core: "auto" });
    
    if (system && system.emulators) {
      system.emulators.forEach((emu: any) => {
        if (emu.cores && emu.cores.length > 0) {
          emu.cores.forEach((core: string) => {
            choices.push({
              label: `${emu.name} (${core})`,
              value: `${emu.name}:${core}`,
              emulator: emu.name,
              core: core
            });
          });
        } else {
          choices.push({
            label: emu.name,
            value: `${emu.name}:`,
            emulator: emu.name,
            core: ""
          });
        }
      });
    }
    return choices;
  }, [system]);

  const selectValue = useMemo(() => {
    if (!selectedGame) return "auto";
    if (!selectedGame.emulator || selectedGame.emulator === "auto") return "auto";
    return `${selectedGame.emulator}:${selectedGame.core || ""}`;
  }, [selectedGame]);

  const handleEmulatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!selectedGame) return;
    const val = e.target.value;
    let updatedGame = { ...selectedGame };
    
    if (val === "auto") {
      updatedGame.emulator = "auto";
      updatedGame.core = "auto";
    } else {
      const [emu, core] = val.split(":");
      updatedGame.emulator = emu;
      updatedGame.core = core || "";
    }

    window.api.updateGame(system.name, updatedGame).then(() => {
      setGames(prev => prev.map(g => g.path === selectedGame.path ? updatedGame : g));
    });
  };

  const handleToggleFavorite = () => {
    if (!selectedGame) return;
    const updatedGame = { ...selectedGame, favorite: !selectedGame.favorite };
    window.api.updateGame(system.name, updatedGame).then(() => {
      setGames(prev => prev.map(g => g.path === selectedGame.path ? updatedGame : g));
    });
  };

  return (
    <div className="h-full flex text-white overflow-hidden relative w-full bg-transparent">
      <div className="relative z-10 flex w-full h-full overflow-hidden">
        {/* Left Sidebar */}
      <aside className="w-48 bg-black/25 border-r border-white/5 p-3 flex flex-col gap-1.5 select-none shrink-0 overflow-y-auto scrollbar-thin">
        <div className="text-[10px] font-bold uppercase text-white/35 tracking-wider px-2 py-1">Filtros</div>
        
        <button
          onClick={() => { setFilter("all"); setSelectedIdx(0); }}
          className={`flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg transition ${filter === "all" ? "bg-white/10 text-white font-medium" : "text-white/60 hover:bg-white/5"}`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Todos</span>
        </button>
        
        <button
          onClick={() => { setFilter("favorites"); setSelectedIdx(0); }}
          className={`flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg transition ${filter === "favorites" ? "bg-white/10 text-white font-medium" : "text-white/60 hover:bg-white/5"}`}
        >
          <Heart className="w-4 h-4" />
          <span>Favoritos</span>
        </button>

        <div className="w-full h-px bg-white/5 my-1.5" />

        <div className="text-[10px] font-bold uppercase text-white/35 tracking-wider px-2 py-1">Avançados</div>

        {/* Genre Filter */}
        <div className="flex flex-col gap-1 px-2 py-1">
          <span className="text-[10px] text-white/40 font-medium">Gênero</span>
          <select
            value={selectedGenre}
            onChange={(e) => { setSelectedGenre(e.target.value); setSelectedIdx(0); }}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none cursor-pointer hover:bg-white/10"
          >
            <option value="all" className="bg-[#121212]">Todos</option>
            {filterOptions.genres.map(g => (
              <option key={g} value={g} className="bg-[#121212]">{g}</option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div className="flex flex-col gap-1 px-2 py-1">
          <span className="text-[10px] text-white/40 font-medium">Ano</span>
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setSelectedIdx(0); }}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none cursor-pointer hover:bg-white/10"
          >
            <option value="all" className="bg-[#121212]">Todos</option>
            {filterOptions.years.map(y => (
              <option key={y} value={y} className="bg-[#121212]">{y}</option>
            ))}
          </select>
        </div>

        {/* Players Filter */}
        <div className="flex flex-col gap-1 px-2 py-1">
          <span className="text-[10px] text-white/40 font-medium">Jogadores</span>
          <select
            value={selectedPlayers}
            onChange={(e) => { setSelectedPlayers(e.target.value); setSelectedIdx(0); }}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none cursor-pointer hover:bg-white/10"
          >
            <option value="all" className="bg-[#121212]">Todos</option>
            {filterOptions.players.map(p => (
              <option key={p} value={p} className="bg-[#121212]">{p === "1" ? "1 Jogador" : p === "2" ? "2 Jogadores" : `${p} Jogadores`}</option>
            ))}
          </select>
        </div>

        {/* Rating Filter */}
        <div className="flex flex-col gap-1 px-2 py-1">
          <span className="text-[10px] text-white/40 font-medium">Avaliação</span>
          <select
            value={selectedMinRating}
            onChange={(e) => { setSelectedMinRating(e.target.value); setSelectedIdx(0); }}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none cursor-pointer hover:bg-white/10"
          >
            <option value="all" className="bg-[#121212]">Todas</option>
            {filterOptions.ratings.map(r => (
              <option key={r.value} value={r.value} className="bg-[#121212]">{r.label}</option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        {(selectedGenre !== "all" || selectedYear !== "all" || selectedPlayers !== "all" || selectedMinRating !== "all") && (
          <button
            onClick={() => {
              setSelectedGenre("all");
              setSelectedYear("all");
              setSelectedPlayers("all");
              setSelectedMinRating("all");
              setSelectedIdx(0);
            }}
            className="mt-2 text-[10px] text-violet-400 hover:text-violet-300 font-semibold text-center py-1 transition cursor-pointer"
          >
            Limpar Filtros
          </button>
        )}
      </aside>

      {/* Main List */}
      <div className="flex-1 flex overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <h2 className="text-lg font-bold tracking-wide">{system.fullname}</h2>
                <span className="text-xs text-white/40">{filteredGames.length} jogos</span>
              </div>
            </div>

            {/* Grid display of Games */}
            <div 
              ref={gridContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto scrollbar-thin pr-1"
            >
              {filteredGames.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-white/30 uppercase tracking-widest">Nenhum jogo encontrado</div>
              ) : (
                <div className="grid grid-cols-5 gap-3">
                  {filteredGames.slice(0, displayLimit).map((g, idx) => {
                    const boxArt = g.thumbnail || g.image || g.marquee;
                    const finalImage = boxArt ? (boxArt.startsWith("http") || boxArt.startsWith("file://") ? boxArt : `file:///${boxArt}`) : "";
                    
                    return (
                      <button
                        key={g.path}
                        onClick={() => setSelectedIdx(idx)}
                        className={`group flex flex-col w-full rounded-xl overflow-hidden text-left transition-all border-2 relative bg-black/40 ${
                          idx === selectedIdx 
                            ? "border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.5)] scale-[1.02] z-10" 
                            : "border-white/5 hover:border-white/10 hover:scale-[1.01]"
                        }`}
                      >
                        <div className="flex items-center justify-center overflow-hidden relative">
                          {finalImage ? (
                            <img src={finalImage} alt={g.name} className="max-w-full max-h-full object-cover group-hover:scale-105 transition-all duration-300" />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white/30 p-2 text-center">
                              <Icon className="w-8 h-8 text-white/20 mb-2" />
                              <span className="text-[10px] font-semibold text-white/40 line-clamp-3">{g.name}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Details Panel */}
        {selectedGame && (
          <aside className="w-72 bg-black/30 border-l border-white/5 p-6 flex flex-col gap-4 overflow-y-auto scrollbar-thin select-none">
            <div className="w-full min-h-28 flex items-center justify-center overflow-hidden relative">
              {(() => {
                const boxArt = selectedGame.wheel || selectedGame.marquee || selectedGame.thumbnail || selectedGame.image;
                const finalImage = boxArt ? (boxArt.startsWith("http") || boxArt.startsWith("file://") ? boxArt : `file:///${boxArt}`) : "";
                
                return finalImage ? (
                  <img src={finalImage} alt={selectedGame.name} className="max-w-full max-h-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 rounded-xl text-white/30">
                    <Icon className="w-10 h-10 text-white/15" />
                  </div>
                );
              })()}
            </div>
            
            <div className="flex flex-col">
              <h3 className="font-bold text-base leading-snug text-white/95">{selectedGame.name}</h3>
              <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">
                {(() => {
                  const relDate = selectedGame.releasedate || (selectedGame as any).ReleaseDate;
                  return relDate ? String(relDate).substring(0, 4) : "Lançamento N/A";
                })()} · {system.fullname}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span className="font-bold text-amber-400">
                  {(() => {
                    const rating = selectedGame.rating !== undefined ? selectedGame.rating : (selectedGame as any).Rating;
                    if (rating === undefined || rating === null) return "N/A";
                    let numRating = parseFloat(String(rating));
                    if (numRating > 1) {
                      numRating = numRating / 10;
                    }
                    return (numRating * 10).toFixed(1);
                  })()}
                </span>
              </div>
              {selectedGame.playcount ? (
                <div className="text-white/50 text-[10px]">
                  Jogado <span className="text-white/80 font-bold">{selectedGame.playcount}</span> vezes
                </div>
              ) : null}
            </div>

            <p className="text-xs leading-relaxed text-white/60 h-28 overflow-y-auto scrollbar-thin pr-1 bg-white/5 p-2 rounded-lg">
              {selectedGame.desc || "Nenhuma descrição disponível para este jogo."}
            </p>

            {/* Game Info Details (Developer, Publisher, Genre, Players) */}
            {(() => {
              const genre = selectedGame.genre || (selectedGame as any).Genre;
              const players = selectedGame.players || (selectedGame as any).Players;
              const developer = selectedGame.developer || (selectedGame as any).Developer;
              const publisher = selectedGame.publisher || (selectedGame as any).Publisher;

              return (
                <div className="flex flex-col gap-2 bg-white/5 rounded-lg p-3 text-[11px] text-white/70">
                  {genre && (
                    <div className="flex justify-between items-center border-b border-white/5 pb-1 last:border-none last:pb-0">
                      <span className="text-white/40">Gênero</span>
                      <span className="font-semibold text-white/90 text-right truncate max-w-[150px]" title={String(genre)}>{String(genre)}</span>
                    </div>
                  )}
                  {players && (
                    <div className="flex justify-between items-center border-b border-white/5 pb-1 last:border-none last:pb-0">
                      <span className="text-white/40">Jogadores</span>
                      <span className="font-semibold text-white/90 text-right">
                        {String(players) === "1" ? "1 Jogador" : String(players) === "2" ? "2 Jogadores" : `${String(players)} Jogadores`}
                      </span>
                    </div>
                  )}
                  {developer && (
                    <div className="flex justify-between items-center border-b border-white/5 pb-1 last:border-none last:pb-0">
                      <span className="text-white/40">Desenvolvedor</span>
                      <span className="font-semibold text-white/90 text-right truncate max-w-[150px]" title={String(developer)}>{String(developer)}</span>
                    </div>
                  )}
                  {publisher && (
                    <div className="flex justify-between items-center border-b border-white/5 pb-1 last:border-none last:pb-0">
                      <span className="text-white/40">Distribuidora</span>
                      <span className="font-semibold text-white/90 text-right truncate max-w-[150px]" title={String(publisher)}>{String(publisher)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Emulator/Core Select Option */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Emulador / Core</span>
              <div className="relative">
                <select
                  value={selectValue}
                  onChange={handleEmulatorChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-violet-500/50 hover:bg-white/10 transition appearance-none cursor-pointer"
                >
                  {emulatorChoices.map(choice => (
                    <option key={choice.value} value={choice.value} className="bg-[#121212] text-white/90">
                      {choice.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40">
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-auto">
              <button
                onClick={() => onLaunchGame(selectedGame, system)}
                className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 hover:scale-[1.02] hover:shadow-lg transition-all rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                Jogar
              </button>
              
              <button
                onClick={handleToggleFavorite}
                className="w-full bg-white/5 hover:bg-white/10 transition rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-2 border border-white/5"
              >
                <Heart className={`w-3.5 h-3.5 ${selectedGame.favorite ? "fill-red-500 text-red-500" : "text-white/70"}`} />
                {selectedGame.favorite ? "Remover dos Favoritos" : "Favoritar"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
    </div>
  );
}

/* ----------------------------- Setting Components (Module Level) ---------------------------- */
/* These MUST be defined outside ToolAppContent so React keeps a stable component identity
   across re-renders. Defining them inline causes React to unmount/remount them on every
   state change, destroying DOM elements before onChange events can fire. */

type SettingsCtx = {
  getSetting: (name: string, fallback?: any) => string;
  isBoolOn: (name: string) => boolean;
  saveSetting: (name: string, value: any, type?: "string" | "bool" | "int" | "float") => void;
};

const SettingGroup = ({ label }: { label: string }) => (
  <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mt-5 mb-2 first:mt-0">{label}</div>
);

const SettingToggle = ({ label, name, desc, ctx }: {
  label: string; name: string; desc?: string; ctx: SettingsCtx;
}) => (
  <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs hover:bg-white/8 transition">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-semibold text-white/95">{label}</span>
      {desc && <span className="text-[10px] text-white/40 leading-snug">{desc}</span>}
    </div>
    <label className="relative inline-flex items-center cursor-pointer shrink-0" onClick={e => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={ctx.isBoolOn(name)}
        onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.checked ? "true" : "false", "bool"); }}
        className="sr-only peer"
      />
      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white/60 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600 peer-checked:after:bg-white" />
    </label>
  </div>
);

const SettingSelect = ({ label, name, options, desc, type = "string", ctx }: {
  label: string; name: string; options: { label: string; value: string }[]; desc?: string;
  type?: "string" | "int"; ctx: SettingsCtx;
}) => (
  <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs hover:bg-white/8 transition">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-semibold text-white/95">{label}</span>
      {desc && <span className="text-[10px] text-white/40 leading-snug">{desc}</span>}
    </div>
    <select
      value={ctx.getSetting(name)}
      onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, type); }}
      className="bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-violet-500/50 cursor-pointer max-w-[200px] shrink-0"
    >
      {options.map(opt => <option key={opt.value} value={opt.value} className="bg-[#121212]">{opt.label}</option>)}
    </select>
  </div>
);

const SettingSlider = ({ label, name, min, max, step, suffix = "", desc, type = "int", ctx }: {
  label: string; name: string; min: number; max: number; step: number; suffix?: string; desc?: string;
  type?: "int" | "float"; ctx: SettingsCtx;
}) => {
  const val = parseFloat(ctx.getSetting(name, String(Math.floor((min + max) / 2))));
  return (
    <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs hover:bg-white/8 transition">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-semibold text-white/95">{label}</span>
        {desc && <span className="text-[10px] text-white/40 leading-snug">{desc}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="range"
          min={min} max={max} step={step}
          value={val}
          onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, type); }}
          className="w-24 h-1.5 accent-violet-500 cursor-pointer"
        />
        <span className="text-white/60 font-mono text-[10px] w-12 text-right">{val}{suffix}</span>
      </div>
    </div>
  );
};

const SettingInput = ({ label, name, desc, isPassword = false, ctx }: {
  label: string; name: string; desc?: string; isPassword?: boolean; ctx: SettingsCtx;
}) => (
  <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs hover:bg-white/8 transition">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-semibold text-white/95">{label}</span>
      {desc && <span className="text-[10px] text-white/40 leading-snug">{desc}</span>}
    </div>
    <input
      type={isPassword ? "password" : "text"}
      value={ctx.getSetting(name)}
      onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, "string"); }}
      onBlur={e => ctx.saveSetting(name, e.target.value, "string")}
      className="bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-violet-500/50 w-44 shrink-0"
      placeholder="..."
    />
  </div>
);

const SettingInfo = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs">
    <span className="font-semibold text-white/95">{label}</span>
    <span className="text-white/50 font-mono text-[10px]">{value}</span>
  </div>
);

/* ----------------------------- Tool App Content ---------------------------- */

function ToolAppContent({
  appId, systems, onOpenSystem, settings, onSaveSetting
}: {
  appId: string;
  systems: System[];
  onOpenSystem: (sysName: string) => void;
  settings?: any;
  onSaveSetting?: (name: string, value: any, type: "string" | "bool" | "int" | "float") => void;
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState("jogos");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [settingsCategory, setSettingsCategory] = useState<"all" | "tools" | "systems">("all");
  if (appId === "library") {
    return (
      <div className="p-6 h-full overflow-y-auto scrollbar-thin text-white">
        <h2 className="text-xl font-bold mb-1">Biblioteca Gamer</h2>
        <p className="text-xs text-white/50 mb-5">Todos os seus sistemas e emuladores sincronizados</p>
        
        <div className="grid grid-cols-4 gap-4">
          {systems.map(sys => {
            const style = getSystemTheme(sys.name);
            const SysIcon = style.icon;
            return (
              <div
                key={sys.name}
                onClick={() => onOpenSystem(sys.name)}
                className="rounded-2xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 hover:scale-[1.02] hover:border-white/15 transition cursor-pointer select-none"
              >
                <div className="w-full h-12 flex items-center justify-start mb-3">
                  {sys.logo ? (
                    <img src={sys.logo} alt={sys.fullname} className="h-full object-contain max-w-[85%] filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] transition-all group-hover:scale-105" />
                  ) : (
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${style.color} flex items-center justify-center shadow-md`}>
                      <SysIcon className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>
                <div className="font-bold text-sm truncate">{sys.fullname}</div>
                <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">{sys.gamecount || 0} jogos</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (appId === "saves") {
    return (
      <div className="p-5 h-full overflow-y-auto scrollbar-thin text-white">
        <h2 className="text-lg font-bold mb-1">Gerenciador de Saves</h2>
        <p className="text-xs text-white/50 mb-4">Sincronização local automática de slots de emuladores</p>
        
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-indigo-700/50 to-violet-900/50 flex items-center justify-center text-white/30 text-xs font-semibold">
                Slot {i + 1}
              </div>
              <div className="p-3 text-xs flex flex-col gap-1 bg-black/20">
                <span className="font-semibold text-white/90">Slot de Backup {i + 1}</span>
                <span className="text-[10px] text-white/40">Há {i + 1} horas atrás · Automático</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (appId === "settings") {
    // --- Helper: read a setting value ---
    const getSetting = (name: string, fallback: any = ""): string => {
      const raw = settings?.[name]?.value;
      if (raw !== undefined && raw !== null) return String(raw);
      // System-specific settings default to 'auto'
      if (name.includes(".") && !name.startsWith("global.") && !name.startsWith("RIESCADE.") && !name.startsWith("Desktop.") && !name.startsWith("Taskbar.") && !name.startsWith("Window.")) {
        return "auto";
      }
      return String(fallback);
    };

    const isBoolOn = (name: string) => {
      const v = getSetting(name, "false");
      return v === "true" || v === "1";
    };

    const saveSetting = (name: string, value: any, type: "string" | "bool" | "int" | "float" = "string") => {
      if (onSaveSetting) onSaveSetting(name, value, type);
    };

    // Build settings context object to pass to stable module-level components
    const ctx: SettingsCtx = { getSetting, isBoolOn, saveSetting };

    // --- Desktop/Taskbar icons logic (Interface tab) ---
    const allToggleItems = [
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
    ];

    const filteredToggleItems = allToggleItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(settingsSearch.toLowerCase()) || item.key.toLowerCase().includes(settingsSearch.toLowerCase());
      const matchesCategory = settingsCategory === "all"
        || (settingsCategory === "tools" && item.type === "tool")
        || (settingsCategory === "systems" && item.type === "system");
      return matchesSearch && matchesCategory;
    });

    const getDesktopIcons = () => {
      const raw = settings?.["Desktop.Icons"]?.value;
      if (raw !== undefined) return String(raw).split(",").filter(Boolean);
      return ["tool:library", "tool:saves", "tool:achievements", "tool:files"];
    };
    const getTaskbarIcons = () => {
      const raw = settings?.["Taskbar.Icons"]?.value;
      if (raw !== undefined) return String(raw).split(",").filter(Boolean);
      return ["tool:library", "tool:saves", "tool:achievements", "tool:files", "tool:settings"];
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
    const settingsTabs = [
      { id: "jogos", name: "Jogos" },
      { id: "interface", name: "Interface" },
      { id: "controles", name: "Controles" },
      { id: "audio", name: "Áudio" },
      { id: "avancado", name: "Avançado" },
      { id: "sobre", name: "Sobre" }
    ];

    return (
      <div className="flex h-full text-white">
        {/* Sidebar */}
        <aside className="w-48 bg-black/20 border-r border-white/5 p-2 flex flex-col gap-0.5 select-none shrink-0">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-white/5 text-left transition cursor-pointer ${
                activeSettingsTab === tab.id ? "bg-white/10 text-white font-semibold" : "text-white/60"
              }`}
            >
              <span>{tab.name}</span>
              <ChevronRight className="w-3 h-3 ml-auto text-white/30" />
            </button>
          ))}
        </aside>
        
        <div className="flex-1 p-5 flex flex-col h-full overflow-hidden">
          {/* ===== TAB: JOGOS ===== */}
          {activeSettingsTab === "jogos" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 space-y-2">
              <h2 className="text-lg font-bold mb-1 shrink-0">Configurações de Jogos</h2>
              <p className="text-xs text-white/50 mb-4">Configurações globais de emulação, vídeo, shaders e mais.</p>

              <SettingGroup label="RetroAchievements" />
              <SettingToggle label="RetroAchievements" name="global.cheevos" desc="Ativar conquistas retrô durante a emulação." ctx={ctx} />
              <SettingInput label="Usuário" name="global.cheevos.username" ctx={ctx} />
              <SettingInput label="Senha" name="global.cheevos.password" isPassword ctx={ctx} />

              <SettingGroup label="Netplay" />
              <SettingToggle label="Ativar Netplay" name="global.netplay" desc="Ativar jogos em rede." ctx={ctx} />
              <SettingInput label="Apelido" name="global.netplay.nickname" ctx={ctx} />
              <SettingInput label="Porta" name="global.netplay.port" ctx={ctx} />

              <SettingGroup label="Save States" />
              <SettingToggle label="Salvar/Carregar Automático" name="global.autosave" desc="Carrega o estado mais recente ao iniciar e salva ao sair." ctx={ctx} />
              <SettingSelect label="Tipo de Incremento" name="global.incrementalsavestates" type="int" options={[
                { label: "Por Save State", value: "" },
                { label: "Por Save Slot", value: "0" },
                { label: "Não Incrementar", value: "2" }
              ]} ctx={ctx} />
              <SettingSelect label="Gerenciador de States" name="global.savestates" desc="Exibe o gerenciador antes de iniciar um jogo." options={[
                { label: "Não", value: "0" }, { label: "Sempre", value: "1" }, { label: "Se Disponível", value: "2" }
              ]} ctx={ctx} />

              <SettingGroup label="Exibição e Vídeo" />
              <SettingSelect label="Shaders" name="global.shaderset" options={[
                { label: "Nenhum", value: "none" }, { label: "RIESCADE", value: "[riescade]" },
                { label: "CRT-NEW-PIXIE", value: "crt-new-pixie" }, { label: "CRT-ROYALE", value: "crt-royale" },
                { label: "CURVATURE", value: "curvature" }, { label: "ENHANCED", value: "enhanced" },
                { label: "FLATTEN-GLOW", value: "flatten-glow" }, { label: "HANDHELD", value: "handheld" },
                { label: "NTSC", value: "ntsc" }, { label: "RETRO", value: "retro" },
                { label: "SCALEFX", value: "scalefx" }, { label: "SCANLINES", value: "scanlines" },
                { label: "TECHNICOLOR", value: "technicolor" }, { label: "VHS", value: "vhs" },
                { label: "XBRZ-5X", value: "xbrz-5x" }, { label: "ZFAST", value: "zfast" }
              ]} ctx={ctx} />
              <SettingSelect label="Decorações (Bezels)" name="global.bezel" options={[
                { label: "Nenhum", value: "none" }, { label: "Automático", value: "auto" }
              ]} ctx={ctx} />
              <SettingSelect label="Proporção de Tela" name="global.ratio" options={[
                { label: "Automático", value: "auto" }, { label: "4/3", value: "4/3" }, { label: "16/9", value: "16/9" },
                { label: "16/10", value: "16/10" }, { label: "Completo", value: "full" }
              ]} ctx={ctx} />
              <SettingSelect label="Modo de Vídeo" name="global.videomode" options={[
                { label: "Automático", value: "auto" }, { label: "1080p 60Hz", value: "1920x1080@60" },
                { label: "1080p 50Hz", value: "1920x1080@50" }, { label: "720p 60Hz", value: "1280x720@60" }
              ]} ctx={ctx} />
              <SettingToggle label="Forçar Tela Cheia" name="global.forcefullscreen" desc="Forçar emulador em tela cheia." ctx={ctx} />
              <SettingToggle label="Escala Inteira (Pixel Perfect)" name="global.integerscale" ctx={ctx} />
              <SettingToggle label="Suavizar Jogos (Bilinear)" name="global.smooth" ctx={ctx} />

              <SettingGroup label="Emulação" />
              <SettingToggle label="Rebobinar (Rewind)" name="rewind" ctx={ctx} />
              <SettingSlider label="Taxa de Avanço Rápido" name="global.fastforward_ratio" min={0} max={50} step={1} suffix="x" ctx={ctx} />
              <SettingToggle label="Discord Rich Presence" name="global.discord" desc="Atualiza status do Discord com o jogo atual." ctx={ctx} />
              <SettingToggle label="Configurar Controles Automaticamente" name="global.disableautocontrollers" ctx={ctx} />

              <SettingGroup label="Verificação de BIOS" />
              <SettingToggle label="Verificar BIOS ao Iniciar Jogo" name="CheckBiosesAtLaunch" ctx={ctx} />

              <SettingGroup label="Compressão" />
              <SettingSelect label="Descompressão" name="decompressedfolders" desc="Manter ou excluir arquivos extraídos." options={[
                { label: "Automático", value: "ask" }, { label: "Manter", value: "keep" }, { label: "Excluir", value: "delete" }
              ]} ctx={ctx} />

              <SettingGroup label="Tattoo (Sobreposição)" />
              <SettingToggle label="Mostrar Tattoo sobre Bezel" name="global.tattoo" desc="Exibe imagem de controle sobre a moldura." ctx={ctx} />
              <SettingSelect label="Posição do Tattoo" name="global.tattoo_corner" options={[
                { label: "Automático", value: "auto" }, { label: "Topo Esquerda", value: "NW" },
                { label: "Topo Direita", value: "NE" }, { label: "Baixo Direita", value: "SE" },
                { label: "Baixo Esquerda", value: "SW" }
              ]} ctx={ctx} />
            </div>
          )}

          {/* ===== TAB: INTERFACE ===== */}
          {activeSettingsTab === "interface" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 mb-4">
                <h2 className="text-lg font-bold mb-1">Interface</h2>
                <p className="text-xs text-white/50">Aparência, ícones do desktop/taskbar, tema e idioma.</p>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 space-y-2">
                <SettingGroup label="Ícones do Desktop e Taskbar" />

                {/* Search & Category Filter */}
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                    <input value={settingsSearch} onChange={(e) => setSettingsSearch(e.target.value)} placeholder="Pesquisar..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/5 text-[10px]">
                    {[{ id: "all", label: "Tudo" }, { id: "tools", label: "Ferramentas" }, { id: "systems", label: "Sistemas" }].map(cat => (
                      <button key={cat.id} onClick={() => setSettingsCategory(cat.id as any)}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer font-semibold ${settingsCategory === cat.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
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
                    <div key={item.key} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition duration-200">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 flex items-center justify-center shrink-0">
                          {item.logo ? (
                            <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
                          ) : (
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-md`}>
                              <ItemIcon className="w-5 h-5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-xs text-white/95 truncate">{item.name}</span>
                          <span className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">
                            {item.type === "tool" ? "Ferramenta" : "Sistema de Jogos"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 font-sans" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center gap-2 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] text-white/50 font-medium">Desktop</span>
                          <input type="checkbox" checked={isDesk}
                            onChange={e => { e.stopPropagation(); handleToggleDesktop(item.key); }}
                            className="w-5 h-5 cursor-pointer accent-violet-600" />
                        </label>
                        <div className="w-px h-6 bg-white/10" />
                        <label className="flex items-center gap-2 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] text-white/50 font-medium">Taskbar</span>
                          <input type="checkbox" checked={isTask}
                            onChange={e => { e.stopPropagation(); handleToggleTaskbar(item.key); }}
                            className="w-5 h-5 cursor-pointer accent-violet-600" />
                        </label>
                      </div>
                    </div>
                  );
                })}

                <SettingGroup label="Tema e Aparência" />
                <SettingSelect label="Protetor de Tela" name="ScreenSaverTime" options={[
                  { label: "Desligado", value: "0" }, { label: "1 Minuto", value: "60000" }, { label: "5 Minutos", value: "300000" }
                ]} ctx={ctx} />
                <SettingSelect label="Modo de Economia de Energia" name="PowerSaverMode" desc="Reduz consumo quando ocioso." options={[
                  { label: "Desativado", value: "disabled" }, { label: "Padrão", value: "default" },
                  { label: "Melhorado", value: "enhanced" }, { label: "Instantâneo", value: "instant" }
                ]} ctx={ctx} />
                <SettingSelect label="Modo da Interface" name="UIMode" desc="Bloqueia menus para uso com convidados." options={[
                  { label: "Completo", value: "Full" }, { label: "Básico", value: "Basic" }, { label: "Quiosque", value: "Kiosk" }
                ]} ctx={ctx} />
              </div>
            </div>
          )}

          {/* ===== TAB: CONTROLES ===== */}
          {activeSettingsTab === "controles" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 space-y-2">
              <h2 className="text-lg font-bold mb-1">Controles</h2>
              <p className="text-xs text-white/50 mb-4">Configurações de controles, bluetooth e armas lightgun.</p>

              <SettingGroup label="Exibição" />
              <SettingToggle label="Mostrar Notificações de Controle" name="ShowControllerNotifications" ctx={ctx} />
              <SettingToggle label="Mostrar Atividade do Controle" name="ShowControllerActivity" ctx={ctx} />
              <SettingToggle label="Mostrar Notificações de Gun" name="ShowGunNotifications" ctx={ctx} />
              <SettingToggle label="Desenhar Mira do Gun" name="DrawGunCrosshair" ctx={ctx} />

              <SettingGroup label="Prioridade dos Controles" />
              {Array.from({ length: 8 }, (_, i) => (
                <SettingInput key={i} label={`Controle #${i + 1}`} name={`INPUT P${i + 1}NAME`} ctx={ctx} />
              ))}

              <SettingGroup label="Analógico e D-Pad" />
              <SettingToggle label="D-Pad como Analógico" name="analogDpad" ctx={ctx} />
              <SettingSelect label="Zona Morta do Analógico" name="analog_deadzone" desc="Ignora movimentos abaixo deste limite." options={
                Array.from({ length: 11 }, (_, i) => ({ label: (i * 0.1).toFixed(1), value: (i * 0.1).toFixed(1) }))
              } ctx={ctx} />
              <SettingToggle label="Inverter Gatilhos N64" name="n64_special_trigger" desc="Usar R2 em vez de L2 como Z." ctx={ctx} />
              <SettingToggle label="PS4/PS5 Enhanced" name="ps_controller_enhanced" desc="Ativa vibração avançada para DualSense." ctx={ctx} />
              <SettingToggle label="Usar Botão para Gatilhos" name="buttonTrigger" desc="Força botão em vez de eixo." ctx={ctx} />

              <SettingGroup label="Bluetooth" />
              <SettingInfo label="Status" value="Gerenciamento via sistema operacional" />

              <SettingGroup label="Guns e Lightguns" />
              {Array.from({ length: 4 }, (_, i) => (
                <SettingSelect key={i} label={`Mouse/Gun P${i + 1}`} name={`p${i + 1}_gunIndex`} desc={`Índice do mouse para jogador ${i + 1}.`}
                  options={Array.from({ length: 9 }, (_, j) => ({ label: String(j), value: String(j) }))} ctx={ctx} />
              ))}

              <SettingGroup label="Sinden Gun" />
              <SettingSelect label="Configuração de Botões" name="global.sindenJoyMode" options={[
                { label: "Padrão", value: "standard" }, { label: "Modo Gamepad", value: "joypad" }, { label: "Sem Configuração", value: "none" }
              ]} ctx={ctx} />
              <SettingToggle label="Fechar Software Sinden ao Sair" name="sindenKill" ctx={ctx} />

              <SettingGroup label="Wiimote" />
              <SettingSelect label="Modo de Conexão" name="WiimoteMode" options={[
                { label: "Modo 2 (Normal)", value: "normal" }, { label: "Modo 2 (Game)", value: "game" }, { label: "Modo 4 (WiimoteGun)", value: "wiimotegun" }
              ]} ctx={ctx} />
              <SettingToggle label="Corrigir Associação do Wiimote" name="WiimoteKbOrder" ctx={ctx} />
            </div>
          )}

          {/* ===== TAB: ÁUDIO ===== */}
          {activeSettingsTab === "audio" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 space-y-2">
              <h2 className="text-lg font-bold mb-1">Áudio</h2>
              <p className="text-xs text-white/50 mb-4">Volume, música de fundo e sons de navegação.</p>

              <SettingGroup label="Volume" />
              <SettingSlider label="Volume do Sistema" name="Volume" min={0} max={100} step={1} suffix="%" ctx={ctx} />
              <SettingSlider label="Volume da Música" name="MusicVolume" min={0} max={100} step={1} suffix="%" ctx={ctx} />
              <SettingToggle label="Mostrar Popup de Volume" name="VolumePopup" ctx={ctx} />

              <SettingGroup label="Música" />
              <SettingToggle label="Música no Menu" name="audio.bgmusic" ctx={ctx} />
              <SettingToggle label="Exibir Títulos das Músicas" name="audio.display_titles" ctx={ctx} />
              <SettingSlider label="Tempo de Exibição do Título" name="audio.display_titles_time" min={2} max={120} step={2} suffix="s" ctx={ctx} />
              <SettingToggle label="Música Específica por Sistema" name="audio.persystem" ctx={ctx} />
              <SettingToggle label="Tocar Música do Tema" name="audio.thememusics" ctx={ctx} />
              <SettingToggle label="Baixar Música ao Reproduzir Vídeo" name="VideoLowersMusic" ctx={ctx} />
              <SettingToggle label="Tocar Apenas Favoritas" name="audio.useFavoriteMusic" ctx={ctx} />

              <SettingGroup label="Sons" />
              <SettingToggle label="Sons de Navegação" name="EnableSounds" ctx={ctx} />
              <SettingToggle label="Áudio na Prévia de Vídeo" name="VideoAudio" ctx={ctx} />

              <SettingGroup label="RetroArch Áudio" />
              <SettingSelect label="Reamostrador" name="audio_resampler" options={[
                { label: "sinc", value: "sinc" }, { label: "CC", value: "CC" }, { label: "nearest", value: "nearest" }, { label: "Nenhum", value: "null" }
              ]} ctx={ctx} />
              <SettingSelect label="Qualidade" name="audio_resampler_quality" options={[
                { label: "Mínima", value: "1" }, { label: "Baixa", value: "2" }, { label: "Normal", value: "3" },
                { label: "Alta", value: "4" }, { label: "Máxima", value: "5" }
              ]} ctx={ctx} />
              <SettingSlider label="Ganho de Volume" name="audio_volume" min={-80} max={12} step={2} suffix=" dB" ctx={ctx} />
              <SettingSlider label="Ganho do Mixer" name="audio_mixer_volume" min={-80} max={12} step={2} suffix=" dB" ctx={ctx} />
              <SettingToggle label="Sincronização de Áudio" name="audio_sync" ctx={ctx} />
              <SettingSelect label="Plugin DSP" name="audio_dsp_plugin" options={[
                { label: "Nenhum", value: "none" }, { label: "Bass Boost", value: ":\\filters\\audio\\BassBoost.dsp" },
                { label: "Chiptune", value: ":\\filters\\audio\\ChipTuneEnhance.dsp" },
                { label: "Echo", value: ":\\filters\\audio\\Echo.dsp" },
                { label: "Reverb", value: ":\\filters\\audio\\Reverb.dsp" },
                { label: "Mono", value: ":\\filters\\audio\\Mono.dsp" }
              ]} ctx={ctx} />
            </div>
          )}



          {/* ===== TAB: AVANÇADO ===== */}
          {activeSettingsTab === "avancado" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 space-y-2">
              <h2 className="text-lg font-bold mb-1">Configurações Avançadas</h2>
              <p className="text-xs text-white/50 mb-4">Drivers, latência, opções de desenvolvedor e otimizações.</p>

              <SettingGroup label="Drivers" />
              <SettingSelect label="Driver de Vídeo" name="video_driver" desc="Vulkan oferece melhor desempenho em hardware compatível." options={[
                { label: "OpenGL", value: "gl" }, { label: "OpenGL Core", value: "glcore" },
                { label: "DirectX 12", value: "d3d12" }, { label: "DirectX 11", value: "d3d11" },
                { label: "Vulkan", value: "vulkan" }
              ]} ctx={ctx} />
              <SettingSelect label="Driver de Áudio" name="audio_driver" options={[
                { label: "XAudio", value: "xaudio" }, { label: "DirectSound", value: "dsound" },
                { label: "SDL", value: "sdl2" }, { label: "WASAPI", value: "wasapi" }
              ]} ctx={ctx} />
              <SettingSelect label="Driver de Controles" name="input_driver" desc="XInput ativa vibração. SDL para maior compatibilidade." options={[
                { label: "SDL", value: "sdl2" }, { label: "XInput", value: "xinput" }, { label: "DInput", value: "dinput" }
              ]} ctx={ctx} />

              <SettingGroup label="Sincronização de Tela" />
              <SettingToggle label="G-Sync/FreeSync" name="vrr_runloop_enable" desc="Sincroniza com a taxa do jogo. Apenas para monitores VRR." ctx={ctx} />
              <SettingSelect label="V-Sync" name="video_vsync" options={[
                { label: "Não", value: "false" }, { label: "Sim", value: "true" }, { label: "Adaptativo", value: "adaptative" }
              ]} ctx={ctx} />

              <SettingGroup label="Redução de Latência" />
              <SettingSlider label="Quadros de Run-Ahead" name="runahead" min={0} max={12} step={1} suffix=" f" ctx={ctx} />
              <SettingToggle label="Usar Preemptive Frames" name="preemptive_frames" desc="Usa quadros preventivos em vez de run-ahead." ctx={ctx} />
              <SettingToggle label="Run-Ahead Segunda Instância" name="secondinstance" ctx={ctx} />
              <SettingToggle label="Frame Delay Automático" name="video_frame_delay_auto" desc="Diminui frame delay para evitar quedas." ctx={ctx} />

              <SettingGroup label="Vídeo Avançado" />
              <SettingSelect label="Orientação de Tela" name="RotateScreen" desc="Rotaciona a área de trabalho." options={[
                { label: "Normal", value: "0" }, { label: "90°", value: "1" }, { label: "180°", value: "2" }, { label: "270°", value: "3" }
              ]} ctx={ctx} />
              <SettingSelect label="Monitor" name="MonitorIndex" options={Array.from({ length: 5 }, (_, i) => ({ label: String(i), value: String(i) }))} ctx={ctx} />
              <SettingToggle label="HDR" name="enable_hdr" desc="Ativa HDR para telas compatíveis." ctx={ctx} />

              <SettingGroup label="Opções de Desenvolvedor" />
              <SettingSlider label="Limite de VRAM" name="MaxVRAM" min={40} max={1000} step={10} suffix=" Mb" ctx={ctx} />
              <SettingToggle label="Exibir FPS" name="DrawFramerate" ctx={ctx} />
              <SettingToggle label="V-Sync do Frontend" name="VSync" ctx={ctx} />
              <SettingSelect label="Nível de Log" name="LogLevel" options={[
                { label: "Padrão", value: "" }, { label: "Desativado", value: "disabled" },
                { label: "Aviso", value: "warning" }, { label: "Erro", value: "error" }, { label: "Debug", value: "debug" }
              ]} ctx={ctx} />

              <SettingGroup label="Gerenciamento de Dados" />
              <SettingToggle label="Ignorar Multi-Disco (CUE/GDI/M3U)" name="RemoveMultiDiskContent" ctx={ctx} />
              <SettingToggle label="Filtragem de Jogos" name="ForceDisableFilters" ctx={ctx} />
              <SettingToggle label="Salvar Metadados ao Sair" name="SaveGamelistsOnExit" ctx={ctx} />
              <SettingToggle label="Processar Apenas Gamelists" name="ParseGamelistOnly" desc="Debug: não verifica se ROMs existem." ctx={ctx} />
              <SettingToggle label="Buscar Artes Locais" name="LocalArt" desc="Busca mídia com o mesmo nome do arquivo." ctx={ctx} />

              <SettingGroup label="Interface do Frontend" />
              <SettingToggle label="Transições do Carrossel" name="MoveCarousel" ctx={ctx} />
              <SettingToggle label="Seleção Rápida de Sistema" name="QuickSystemSelect" ctx={ctx} />
              <SettingToggle label="Salto Rápido por Letra" name="QuickJumpLetter" ctx={ctx} />
              <SettingToggle label="Teclado Virtual" name="UseOSK" ctx={ctx} />
              <SettingToggle label="Ocultar ao Rodar Jogo" name="HideWindow" ctx={ctx} />
              <SettingSelect label="Menu do RetroArch" name="global.retroarch.menu_driver" options={[
                { label: "Automático", value: "" }, { label: "RGUI", value: "rgui" },
                { label: "XMB", value: "xmb" }, { label: "Ozone", value: "ozone" }
              ]} ctx={ctx} />

              <SettingGroup label="Otimizações" />
              <SettingToggle label="Pré-carregar UI ao Iniciar" name="PreloadUI" ctx={ctx} />
              <SettingToggle label="Pré-carregar Mídias ao Iniciar" name="PreloadMedias" ctx={ctx} />
              <SettingToggle label="Carregamento em Segundo Plano" name="ThreadedLoading" ctx={ctx} />
              <SettingToggle label="Imagens Assíncronas" name="AsyncImages" ctx={ctx} />
              <SettingToggle label="Otimizar VRAM de Imagens" name="OptimizeVRAM" ctx={ctx} />
              <SettingToggle label="Otimizar VRAM de Vídeos" name="OptimizeVideo" ctx={ctx} />
              <SettingToggle label="Cache do Sistema de Arquivos" name="UseFileCache" ctx={ctx} />

              <SettingGroup label="Contas do Scraper" />
              <SettingInput label="ScreenScraper Usuário" name="ScreenScraperUser" ctx={ctx} />
              <SettingInput label="ScreenScraper Senha" name="ScreenScraperPass" isPassword ctx={ctx} />
              <SettingInput label="IGDB Client ID" name="IGDBClientID" ctx={ctx} />
              <SettingInput label="IGDB Secret" name="IGDBSecret" isPassword ctx={ctx} />
            </div>
          )}

          {/* ===== TAB: SOBRE ===== */}
          {activeSettingsTab === "sobre" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 space-y-2">
              <h2 className="text-lg font-bold mb-1">Sobre o Sistema</h2>
              <p className="text-xs text-white/50 mb-4">Informações do RIESCADE OS e hardware.</p>

              <SettingGroup label="Sistema" />
              <SettingInfo label="Versão" value="RIESCADE OS v2.0.0-Beta" />
              <SettingInfo label="Motor" value="Electron + React + Vite" />
              <SettingInfo label="Idioma" value={getSetting("Language", "pt_BR")} />
              <SettingInfo label="Tema Ativo" value={getSetting("RIESCADE.ThemeSet", "default")} />

              <SettingGroup label="Atualizações" />
              <SettingSelect label="Canal de Atualização" name="updates.type" options={[
                { label: "Estável", value: "stable" }, { label: "Beta", value: "beta" },
                { label: "Beta (Butterfly)", value: "butterfly" }, { label: "Instável", value: "unstable" }
              ]} ctx={ctx} />

              <SettingGroup label="Tradução por IA" />
              <SettingToggle label="Ativar Tradução por IA" name="ai_service_enabled" ctx={ctx} />
              <SettingSelect label="Idioma de Destino" name="ai_target_lang" options={[
                { label: "Português", value: "Pt" }, { label: "English", value: "En" }, { label: "Español", value: "Es" },
                { label: "Français", value: "Fr" }, { label: "Deutsch", value: "De" }, { label: "Italiano", value: "It" },
                { label: "日本語", value: "Ja" }, { label: "한국어", value: "Ko" }, { label: "中文", value: "Zh" }
              ]} ctx={ctx} />
              <SettingInput label="URL do Serviço" name="ai_service_url" ctx={ctx} />
              <SettingToggle label="Pausar na Tela Traduzida" name="ai_service_pause" ctx={ctx} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (appId === "files") {
    const folders = ["roms", "saves", "screenshots", "bios", "downloads"];
    return (
      <div className="flex h-full text-white">
        <aside className="w-48 bg-black/25 border-r border-white/5 p-2 text-xs flex flex-col gap-1 select-none">
          <div className="px-3 py-2 rounded-lg bg-white/10 text-white font-medium">Início</div>
          <div className="px-3 py-2 rounded-lg text-white/60 hover:bg-white/5 cursor-pointer">Favoritos</div>
          <div className="px-3 py-2 rounded-lg text-white/60 hover:bg-white/5 cursor-pointer">Armazenamento</div>
        </aside>
        
        <div className="flex-1 p-4 flex flex-col overflow-hidden">
          <div className="text-[10px] text-white/40 font-mono mb-3">/home/riescade/desktop/</div>
          <div className="grid grid-cols-4 gap-3 overflow-y-auto scrollbar-thin pr-1">
            {folders.map(f => (
              <div key={f} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition select-none">
                <Folder className="w-12 h-12 text-sky-400" />
                <span className="text-xs font-medium text-white/90 truncate w-full text-center">{f}/</span>
              </div>
            ))}
          </div>
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
      <div className="p-5 h-full overflow-y-auto scrollbar-thin text-white space-y-2">
        <h2 className="text-lg font-bold mb-1">Conquistas</h2>
        <p className="text-xs text-white/50 mb-4">Seu progresso acumulado através do RetroAchievements</p>
        
        {list.map((a, i) => (
          <div key={a} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl p-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-md">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-white/95">{a}</div>
              <div className="text-[10px] text-white/40">Desbloqueado há {i + 1} dias atrás</div>
            </div>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
