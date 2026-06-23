import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Search, Power, X, Minus, Square, Gamepad2, Monitor,
  Folder, Grid3x3, Wifi, Volume2, Battery, Loader2,
  MoreHorizontal, Heart
} from "lucide-react";
import * as Toast from '@radix-ui/react-toast';
import { System, Game, WinState } from "./types";
import { TOOL_APPS, getSystemTheme } from "./constants";
import SystemAppContent from "./components/SystemAppContent";
import ToolAppContent from "./components/ToolAppContent";
import { ScrollArea } from "./components/ScrollArea";

const DEFAULT_SYSTEM_BG = "radial-gradient(1200px 800px at 20% 10%, rgb(35 35 35) 0%, transparent 60%), radial-gradient(1000px 700px at 85% 90%, rgb(12 12 12) 0%, transparent 55%), linear-gradient(rgb(4 4 4) 0%, rgb(22 22 22) 100%)";

export default function App() {
  const [systems, setSystems] = useState<System[]>([]);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(new Date());
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<Game | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [nativeWins, setNativeWins] = useState<{ type: string; appId: string; minimized: boolean }[]>([]);
  const [overlaySystemUrl, setOverlaySystemUrl] = useState<string>("");
  const [riescadeLogoUrl, setRiescadeLogoUrl] = useState<string>("");
  const [activeSubWindowId, setActiveSubWindowId] = useState<string | null>(null);
  const [activeGameArt, setActiveGameArt] = useState<string | null>(null);
  const [controllers, setControllers] = useState<any[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; title: string; description: string; type: "favorite" | "controller"; favorite?: boolean; open: boolean }[]>([]);

  useEffect(() => {
    const handleShowToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = Math.random().toString(36).substring(2, 9);
      
      // Add the toast
      setToasts((prev) => [...prev, { id, ...detail, open: true }]);
      
      // Auto-dismiss after 3 seconds, independent of window focus/blur/hover
      setTimeout(() => {
        setToasts((prev) => {
          const exists = prev.find((t) => t.id === id);
          if (exists && exists.open) {
            setTimeout(() => {
              setToasts((current) => current.filter((t) => t.id !== id));
            }, 400); // Wait for exit animation
            return prev.map((t) => t.id === id ? { ...t, open: false } : t);
          }
          return prev;
        });
      }, 3000);
    };
    window.addEventListener('show-toast', handleShowToast);
    return () => window.removeEventListener('show-toast', handleShowToast);
  }, []);

  const renderToasts = () => (
    <>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          open={toast.open}
          className="toast-root glass-strong border border-white/10 rounded-xl p-3.5 shadow-2xl flex items-center gap-3 w-80 select-none"
          onOpenChange={(open) => {
            if (!open) {
              setToasts((prev) => {
                const exists = prev.find((t) => t.id === toast.id);
                if (exists && exists.open) {
                  setTimeout(() => {
                    setToasts((current) => current.filter((t) => t.id !== toast.id));
                  }, 400); // Wait for exit animation
                  return prev.map((t) => t.id === toast.id ? { ...t, open: false } : t);
                }
                return prev;
              });
            }
          }}
        >
          <div className="shrink-0">
            {toast.type === "controller" ? (
              <Gamepad2 className="w-5 h-5 text-accent animate-pulse" />
            ) : toast.favorite ? (
              <Heart className="w-5 h-5 fill-[var(--accent-color)] text-[var(--accent-color)]" />
            ) : (
              <Heart className="w-5 h-5 text-white/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <Toast.Title className="text-xs font-bold text-white truncate">
              {toast.title}
            </Toast.Title>
            <Toast.Description className="text-[10px] text-white/50 truncate mt-0.5">
              {toast.description}
            </Toast.Description>
          </div>
          <Toast.Close className="text-white/30 hover:text-white transition-colors cursor-pointer shrink-0 ml-2">
            <X className="w-3.5 h-3.5" />
          </Toast.Close>
        </Toast.Root>
      ))}
    </>
  );

  useEffect(() => {
    window.api.getOverlayPath("overlay-system.png").then((url: string) => {
      setOverlaySystemUrl(url);
    });
    window.api.getRiescadeLogoPath().then((url: string) => {
      setRiescadeLogoUrl(url);
    });
  }, []);

  // Dynamically apply accent color CSS variables
  useEffect(() => {
    const color = settings["RIESCADE.AccentColor"]?.value || "#8b5cf6";
    const root = document.documentElement;
    root.style.setProperty("--accent-color", color);
    
    // Parse color to hex and calculate derived colors
    let hex = color.replace("#", "");
    if (!/^[0-9A-F]{6}$/i.test(hex)) {
      hex = "8b5cf6";
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    const hoverColor = `#${Math.max(0, Math.floor(r * 0.8)).toString(16).padStart(2, '0')}${Math.max(0, Math.floor(g * 0.8)).toString(16).padStart(2, '0')}${Math.max(0, Math.floor(b * 0.8)).toString(16).padStart(2, '0')}`;
    const lightColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
    const focusColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
    const glassColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
    
    root.style.setProperty("--accent-color-hover", hoverColor);
    root.style.setProperty("--accent-color-light", lightColor);
    root.style.setProperty("--accent-color-focus", focusColor);
    root.style.setProperty("--accent-color-glass", glassColor);
  }, [settings]);

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

    const handleGamepadConnected = (e: GamepadEvent) => {
      updateControllers();
      const gpName = e.gamepad.id.split('(')[0].trim();
      window.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: {
            title: "Controle Conectado",
            description: gpName,
            type: "controller"
          }
        })
      );
    };

    const handleGamepadDisconnected = (e: GamepadEvent) => {
      updateControllers();
      const gpName = e.gamepad.id.split('(')[0].trim();
      window.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: {
            title: "Controle Desconectado",
            description: gpName,
            type: "controller"
          }
        })
      );
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
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
    return ["tool:library", "tool:saves", "tool:achievements"];
  }, [settings]);

  const getTaskbarIcons = useCallback(() => {
    const raw = settings["Taskbar.Icons"]?.value;
    if (raw !== undefined) {
      return String(raw).split(",").filter(Boolean);
    }
    return ["tool:library", "tool:saves", "tool:achievements", "tool:settings"];
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

  // Open App - Natively opens platforms and tools
  const openApp = useCallback((type: "system" | "tool", appId: string) => {
    setLauncherOpen(false);
    window.api.openAppWindow(type, appId);
  }, []);

  // Determine Dynamic Background
  const activeBg = useMemo(() => {
    const isDynamic = settings["RIESCADE.DynamicBackground"]?.value !== "false";
    const customBg = settings["RIESCADE.CustomBackground"]?.value;

    if (isDynamic) {
      if (windowType === "system" && systemName) {
        return getSystemTheme(systemName).bg;
      }
      if (activeSubWindowId && systems.some(s => s.name === activeSubWindowId)) {
        return getSystemTheme(activeSubWindowId).bg;
      }
    }

    if (customBg) {
      return `url("${customBg}")`;
    }

    return DEFAULT_SYSTEM_BG;
  }, [windowType, systemName, activeSubWindowId, settings, systems]);

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
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
            <span className="text-xs font-semibold text-white/60 animate-pulse">{loadingMessage}</span>
          </div>

          {/* Progresso Dinâmico */}
          {loadingProgress > 0 && (
            <div className="w-full mt-5">
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r rounded-full transition-all duration-300" 
                  style={{ width: `${loadingProgress}%`, backgroundImage: 'linear-gradient(to right, var(--accent-color), rgb(34, 211, 238))' }}
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

    // Desktop and Taskbar helper variables
    const desktopIcons = getDesktopIcons();
    const taskbarIcons = getTaskbarIcons();
    const isDesktop = desktopIcons.includes(`system:${systemName}`);
    const isTaskbar = taskbarIcons.includes(`system:${systemName}`);

    const handleToggleDesktop = () => {
      const current = getDesktopIcons();
      const itemKey = `system:${systemName}`;
      const next = current.includes(itemKey) ? current.filter(x => x !== itemKey) : [...current, itemKey];
      handleSaveSetting("Desktop.Icons", next.join(","), "string");
    };

    const handleToggleTaskbar = () => {
      const current = getTaskbarIcons();
      const itemKey = `system:${systemName}`;
      const next = current.includes(itemKey) ? current.filter(x => x !== itemKey) : [...current, itemKey];
      handleSaveSetting("Taskbar.Icons", next.join(","), "string");
    };

    return (
      <Toast.Provider swipeDirection="up" duration={Infinity}>
        <div 
          key={`system-${systemName}`} 
          className="w-screen h-screen overflow-hidden select-none flex relative" 
          style={{ 
            background: theme.bg
          }}
        >
        {platformBackgroundArt && settings["RIESCADE.DynamicBackground"]?.value !== "false" && (
          <div 
            key={platformBackgroundArt}
            className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-20 animate-in fade-in duration-1000 z-0"
            style={{ backgroundImage: `url("${platformBackgroundArt}")` }}
          />
        )}

        {/* Draggable region at top - merged with sidebar */}
        <div 
          className="absolute top-0 left-0 right-0 h-8 z-10"
          style={{ WebkitAppRegion: 'drag' } as any}
        />

        {/* Three-dot Menu Overlay (top-left) */}
        <div 
          className="absolute top-0 left-0 z-20 flex items-center h-8 px-2"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              className={`text-white/60 hover:text-white transition cursor-pointer flex items-center justify-center p-1 rounded ${menuOpen ? "text-white bg-white/10" : ""}`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 mt-2 w-64 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-2 z-50 text-white animate-in fade-in slide-in-from-top-2 duration-150">
                  <button 
                    onClick={() => { handleToggleDesktop(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition"
                  >
                    <Monitor className="w-4 h-4 text-accent" />
                    <span>{isDesktop ? "Remover do Desktop" : "Adicionar ao Desktop"}</span>
                  </button>

                  <button 
                    onClick={() => { handleToggleTaskbar(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition"
                  >
                    <Grid3x3 className="w-4 h-4 text-cyan-400" />
                    <span>{isTaskbar ? "Remover da Taskbar" : "Adicionar à Taskbar"}</span>
                  </button>

                  <div className="h-px bg-white/10 my-1.5" />

                  <div className="px-3 py-1 text-[10px] text-white/40 uppercase font-semibold tracking-wider">
                    Emuladores
                  </div>

                  <button
                    onClick={() => {
                      handleSaveSetting(`${systemName}.emulator`, "auto", "string");
                      handleSaveSetting(`${systemName}.core`, "auto", "string");
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs hover:bg-white/10 text-left transition ${
                      (settings[`${systemName}.emulator`]?.value === "auto" || !settings[`${systemName}.emulator`]?.value)
                        ? "text-accent font-semibold"
                        : "text-white/80"
                    }`}
                  >
                    <span>Padrão (Auto)</span>
                    {(settings[`${systemName}.emulator`]?.value === "auto" || !settings[`${systemName}.emulator`]?.value) && <span className="text-[10px]">●</span>}
                  </button>

                  {system?.emulators?.map((emu: any) => {
                    if (emu.cores && emu.cores.length > 0) {
                      return emu.cores.map((core: string) => {
                        const isSelected = settings[`${systemName}.emulator`]?.value === emu.name && settings[`${systemName}.core`]?.value === core;
                        return (
                          <button
                            key={`${emu.name}:${core}`}
                            onClick={() => {
                              handleSaveSetting(`${systemName}.emulator`, emu.name, "string");
                              handleSaveSetting(`${systemName}.core`, core, "string");
                              setMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs hover:bg-white/10 text-left transition ${
                              isSelected ? "text-accent font-semibold" : "text-white/80"
                            }`}
                          >
                            <span className="truncate uppercase">{emu.name} ({core})</span>
                            {isSelected && <span className="text-[10px]">●</span>}
                          </button>
                        );
                      });
                    } else {
                      const isSelected = settings[`${systemName}.emulator`]?.value === emu.name && (!settings[`${systemName}.core`]?.value || settings[`${systemName}.core`]?.value === "auto");
                      return (
                        <button
                          key={emu.name}
                          onClick={() => {
                            handleSaveSetting(`${systemName}.emulator`, emu.name, "string");
                            handleSaveSetting(`${systemName}.core`, "", "string");
                            setMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs hover:bg-white/10 text-left transition ${
                            isSelected ? "text-accent font-semibold" : "text-white/80"
                          }`}
                        >
                          <span className="truncate uppercase">{emu.name}</span>
                          {isSelected && <span className="text-[10px]">●</span>}
                        </button>
                      );
                    }
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Window Controls Overlay (top-right) */}
        <div 
          className="absolute top-0 right-0 z-20 flex items-center h-8"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button 
            onClick={() => window.api.minimizeWindow()} 
            className="w-11 h-8 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={() => window.api.maximizeWindow()} 
            className="w-11 h-8 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button 
            onClick={() => window.api.closeWindow()} 
            className="w-11 h-8 hover:bg-red-600 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - fills entire window, sidebar merges with titlebar */}
        <div className="flex-1 overflow-hidden relative z-0">
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
              <div 
                className="relative w-36 h-36 rounded-full flex items-center justify-center shadow-2xl mb-8 animate-pulse"
                style={{ backgroundColor: 'var(--accent-color-light)', borderColor: 'var(--accent-color-light)', borderWidth: 1 }}
              >
                <Loader2 className="w-16 h-16 text-accent animate-spin" />
              </div>
              <h2 className="text-2xl font-bold tracking-wider text-white/90 mb-2">INICIANDO</h2>
              <p className="text-xl font-medium text-white/70">{launchingGame.name}</p>
              <p className="text-xs text-white/40 uppercase tracking-widest mt-2">{launchingGame.system}</p>
            </div>
          </div>
        )}
        </div>
        {renderToasts()}
        <Toast.Viewport className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 w-80 max-w-full m-0 list-none outline-none items-center" />
      </Toast.Provider>
    );
  }

  // Standalone Tool Window
  if (windowType === "tool" && toolId) {
    return (
      <Toast.Provider swipeDirection="up" duration={Infinity}>
        <div 
          key={`tool-${toolId}`} 
          className="w-screen h-screen overflow-hidden select-none flex relative" 
          style={{ background: DEFAULT_SYSTEM_BG }}
        >
        {/* Draggable region at top - merged with sidebar */}
        <div 
          className="absolute top-0 left-0 right-0 h-8 z-10"
          style={{ WebkitAppRegion: 'drag' } as any}
        />

        {/* Window Controls Overlay (top-right) */}
        <div 
          className="absolute top-0 right-0 z-20 flex items-center h-8"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button 
            onClick={() => window.api.minimizeWindow()} 
            className="w-11 h-8 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={() => window.api.maximizeWindow()} 
            className="w-11 h-8 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button 
            onClick={() => window.api.closeWindow()} 
            className="w-11 h-8 hover:bg-red-600 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - fills entire window, sidebar merges with titlebar */}
        <div className="flex-1 overflow-hidden relative z-0">
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
        </div>
        {renderToasts()}
        <Toast.Viewport className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 w-80 max-w-full m-0 list-none outline-none items-center" />
      </Toast.Provider>
    );
  }

  // Default Desktop Window
  return (
    <Toast.Provider swipeDirection="up" duration={Infinity}>
      <div key="desktop-container" className="w-screen h-screen flex flex-col overflow-hidden select-none">
      {/* Draggable custom titlebar */}
      <div 
        className="h-14 px-4 pr-0 flex items-center justify-between select-none shrink-0 z-80 fixed top-0 w-full" 
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Left Side: App Title/Logo */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {riescadeLogoUrl ? (
            <img src={riescadeLogoUrl} alt="RIESCADE OS" className="w-5 h-5 object-contain" />
          ) : (
            <Gamepad2 className="w-5 h-5 text-accent" />
          )}
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
        style={{ 
          background: activeBg, 
          backgroundSize: activeBg.startsWith('url') ? 'cover' : undefined,
          backgroundPosition: activeBg.startsWith('url') ? 'center' : undefined,
          backgroundRepeat: activeBg.startsWith('url') ? 'no-repeat' : undefined,
          transition: "background 0.8s ease" 
        }}
        onClick={() => setLauncherOpen(false)}
      >
        {/* Desktop Active System Background Art Overlay with Fade-in */}
        {activeSubWindowArt && settings["RIESCADE.DynamicBackground"]?.value !== "false" && (
          <div 
            key={activeSubWindowArt}
            className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-80 animate-in fade-in duration-1000 z-0"
            style={{ backgroundImage: `url("${activeSubWindowArt}")` }}
          />
        )}
      {/* Floating orbs wallpaper */}
      <div className="pointer-events-none absolute inset-0">
        <div 
          className="absolute top-20 left-40 w-72 h-72 rounded-full blur-3xl animate-float" 
          style={{ backgroundColor: 'var(--accent-color)', opacity: 0.1 }}
        />
        <div className="absolute bottom-40 right-32 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl animate-float" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-cyan-500/5 blur-3xl animate-float" style={{ animationDelay: "4s" }} />
      </div>

      {/* Desktop shortcuts */}
      {settings["RIESCADE.ShowDesktopIcons"]?.value !== "false" && (
        <div className="pt-10 absolute top-6 left-6 flex flex-col gap-4 z-30">
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
      )}



      {/* App Launcher Start Menu */}
      {launcherOpen && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center pt-16 pb-32"
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
                className="w-full bg-white/10 border border-white/15 rounded-full pl-11 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus-border-accent"
              />
            </div>
            
            <ScrollArea className="flex-1 pr-2">
              <div className="text-xs uppercase text-white/40 tracking-wider mb-3">Ferramentas do Sistema</div>
              <div className="grid grid-cols-5 gap-3 mb-6">
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

              <div className="text-xs uppercase text-white/40 tracking-wider mb-3">Plataformas de Jogos</div>
              <div className="grid grid-cols-5 gap-3">
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
                        <div className="w-20 h-20 flex items-center justify-center">
                          {sys.logo ? (
                            <img src={sys.logo} alt={sys.fullname} className="h-full object-contain max-w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-all" />
                          ) : (
                            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${theme.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition`}>
                              <SysIcon className="w-6 h-6 text-white" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-white/90 text-center leading-tight truncate w-full">{sys.fullname}</span>
                      </button>
                    );
                  })}
              </div>
            </ScrollArea>
            
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md"
                  style={{ background: 'linear-gradient(135deg, var(--accent-color), rgb(79, 70, 229))' }}
                >R</div>
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[90]" onClick={(e) => e.stopPropagation()}>
        <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-2 shadow-2xl">
          
          {/* Start Menu button */}
          <button
            onClick={() => setLauncherOpen(v => !v)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${launcherOpen ? "bg-accent-glass" : "hover:scale-105"}`}
            style={!launcherOpen ? { background: 'linear-gradient(135deg, var(--accent-color), rgb(67, 56, 202))' } : {}}
            title="RIESCADE OS"
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
              const isOpen = nativeWins.some(w => w.appId === item.appId && w.type === item.type);
              const isMinimized = nativeWins.find(w => w.appId === item.appId && w.type === item.type)?.minimized ?? false;

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
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all ${isMinimized ? "w-1 bg-white/40" : "w-5 bg-accent"}`} />
                  )}
                </button>
              );
            })}

          {/* Dynamic Running Apps Separator & Icons */}
          {(() => {
            const pinnedKeys = getTaskbarIcons();
            const runningTools = nativeWins
              .filter(w => w.type === "tool" && !pinnedKeys.includes(`tool:${w.appId}`))
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
                      <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all ${item.isMinimized ? "w-1 bg-white/40" : "w-5 bg-accent"}`} />
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
              <span title={`${controllers.length} controle(s) conectado(s)`} className="flex items-center">
                <Gamepad2 className="w-4 h-4 text-accent mr-1 animate-pulse" />
              </span>
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
      {renderToasts()}
      <Toast.Viewport className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 w-80 max-w-full m-0 list-none outline-none items-center" />
    </Toast.Provider>
  );
}
