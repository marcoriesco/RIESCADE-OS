import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Search, Power, X, Minus, Square, Gamepad2, Monitor,
  Folder, Grid3x3, Wifi, Volume2, Battery, Loader2,
  MoreHorizontal, Heart, Download, Check, AlertTriangle, Play, Settings
} from "lucide-react";
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { System, Game, WinState, hasMultipleEmulators } from "./types";
import { TOOL_APPS, getSystemTheme } from "./constants";
import SystemAppContent from "./components/SystemAppContent";
import ToolAppContent from "./components/ToolAppContent";
import { ScrollArea } from "./components/ScrollArea";
import VirtualWindow from "./components/VirtualWindow";
import defaultBg from '../../main/resources/default.webp';
import defaultVideo from '../../main/resources/default.mp4';
import riescadeLogo from '../../main/resources/riescade.webp';
import { playUISound, setAppMuted } from "./utils/audioManager";


const DEFAULT_SYSTEM_BG = "radial-gradient(1200px 800px at 20% 10%, rgb(35 35 35) 0%, transparent 60%), radial-gradient(1000px 700px at 85% 90%, rgb(12 12 12) 0%, transparent 55%), linear-gradient(rgb(4 4 4) 0%, rgb(22 22 22) 100%)";
// Synchronously apply accent color from localStorage if present to prevent any layout/color flash
try {
  const savedColor = localStorage.getItem("accentColor");
  if (savedColor) {
    const root = document.documentElement;
    root.style.setProperty("--accent-color", savedColor);
    let hex = savedColor.replace("#", "");
    if (/^[0-9A-F]{6}$/i.test(hex)) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      root.style.setProperty("--accent-color-hover", `#${Math.max(0, Math.floor(r * 0.8)).toString(16).padStart(2, '0')}${Math.max(0, Math.floor(g * 0.8)).toString(16).padStart(2, '0')}${Math.max(0, Math.floor(b * 0.8)).toString(16).padStart(2, '0')}`);
      root.style.setProperty("--accent-color-light", `rgba(${r}, ${g}, ${b}, 0.2)`);
      root.style.setProperty("--accent-color-focus", `rgba(${r}, ${g}, ${b}, 0.6)`);
      root.style.setProperty("--accent-color-glass", `rgba(${r}, ${g}, ${b}, 0.4)`);
    }
  }
} catch (e) {
  // Ignore localStorage error
}

export default function App() {
  const [systems, setSystems] = useState<System[]>([]);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [startMenuSearch, setStartMenuSearch] = useState("");
  const [now, setNow] = useState(new Date());
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<Game | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [emulatorSettings, setEmulatorSettings] = useState<any>({});
  const [appVersion, setAppVersion] = useState("2.0.2");
  const [taskbarContextMenu, setTaskbarContextMenu] = useState<{
    x: number;
    y: number;
    item: { id: string; type: "system" | "tool"; appId: string; name: string; icon: any; logo?: string; color?: string };
    isPinned: boolean;
  } | null>(null);
  const [startMenuContextMenu, setStartMenuContextMenu] = useState<{
    x: number;
    y: number;
    type: "system" | "tool";
    appId: string;
    name: string;
  } | null>(null);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [batteryState, setBatteryState] = useState<{ level: number; charging: boolean; hasBattery: boolean } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem("riescade_volume");
    return saved !== null ? parseInt(saved, 10) : 80;
  });

  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    localStorage.setItem("riescade_volume", String(newVal));
    handleSaveSetting("Volume", newVal, "int");
  };

  // Audio & Background Music State & Logic
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<{ name: string; relativePath: string; url: string }[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isVideoDucked, setIsVideoDucked] = useState(false);

  // Sync Audio Settings
  const masterVolume = useMemo(() => {
    const sVal = settings["Volume"]?.value;
    if (sVal !== undefined && sVal !== null && sVal !== "") {
      const parsed = parseInt(String(sVal), 10);
      if (!isNaN(parsed)) return parsed;
    }
    return volume;
  }, [settings, volume]);

  const musicVolume = useMemo(() => {
    const sVal = settings["MusicVolume"]?.value;
    if (sVal !== undefined && sVal !== null && sVal !== "") {
      const parsed = parseInt(String(sVal), 10);
      if (!isNaN(parsed)) return parsed;
    }
    return 50;
  }, [settings]);

  const isMusicEnabled = useMemo(() => {
    return settings["audio.bgmusic"]?.value !== false && settings["audio.bgmusic"]?.value !== "false";
  }, [settings]);

  const displayTitles = useMemo(() => {
    return settings["audio.display_titles"]?.value !== false && settings["audio.display_titles"]?.value !== "false";
  }, [settings]);

  const perSystemMusic = useMemo(() => {
    return settings["audio.persystem"]?.value === true || settings["audio.persystem"]?.value === "true";
  }, [settings]);

  const useFavoriteMusic = useMemo(() => {
    return settings["audio.useFavoriteMusic"]?.value === true || settings["audio.useFavoriteMusic"]?.value === "true";
  }, [settings]);

  const videoLowersMusic = useMemo(() => {
    return settings["VideoLowersMusic"]?.value !== false && settings["VideoLowersMusic"]?.value !== "false";
  }, [settings]);

  const showVolumePopup = useMemo(() => {
    return settings["VolumePopup"]?.value !== false && settings["VolumePopup"]?.value !== "false";
  }, [settings]);

  const taskbarAutoHide = useMemo(() => {
    return settings["taskbar.autoHide"]?.value === true || settings["taskbar.autoHide"]?.value === "true";
  }, [settings]);

  const taskbarAutoHideTimeout = useMemo(() => {
    const parsed = parseInt(String(settings["taskbar.autoHideTimeout"]?.value || 3), 10);
    return isNaN(parsed) ? 3 : Math.max(1, Math.min(30, parsed));
  }, [settings]);

  const taskbarClockFormat = useMemo(() => {
    return String(settings["taskbar.clockFormat"]?.value || "default");
  }, [settings]);

  const taskbarShowWifi = useMemo(() => {
    return settings["taskbar.showWifi"]?.value !== false && settings["taskbar.showWifi"]?.value !== "false";
  }, [settings]);

  const taskbarShowVolume = useMemo(() => {
    return settings["taskbar.showVolume"]?.value !== false && settings["taskbar.showVolume"]?.value !== "false";
  }, [settings]);

  const taskbarShowBattery = useMemo(() => {
    return settings["taskbar.showBattery"]?.value !== false && settings["taskbar.showBattery"]?.value !== "false";
  }, [settings]);

  const taskbarShowControllers = useMemo(() => {
    return settings["taskbar.showControllers"]?.value !== false && settings["taskbar.showControllers"]?.value !== "false";
  }, [settings]);

  const [taskbarHidden, setTaskbarHidden] = useState(false);
  const isMouseNearBottomRef = useRef(false);

  useEffect(() => {
    if (!taskbarAutoHide) {
      setTaskbarHidden(false);
      return;
    }

    let hideTimer: NodeJS.Timeout | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const nearBottom = e.clientY >= window.innerHeight - 25;
      const insideTaskbarArea = e.clientY >= window.innerHeight - 90;

      if (nearBottom || insideTaskbarArea) {
        isMouseNearBottomRef.current = true;
        setTaskbarHidden(false);
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      } else {
        if (isMouseNearBottomRef.current || !hideTimer) {
          isMouseNearBottomRef.current = false;
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            setTaskbarHidden(true);
          }, taskbarAutoHideTimeout * 1000);
        }
      }
    };

    hideTimer = setTimeout(() => {
      if (!isMouseNearBottomRef.current) {
        setTaskbarHidden(true);
      }
    }, taskbarAutoHideTimeout * 1000);

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [taskbarAutoHide, taskbarAutoHideTimeout]);



  const [isGameRunning, setIsGameRunning] = useState(false);

  // Mute / pause all UI audio and background music when a game is launching or running
  useEffect(() => {
    if (!bgAudioRef.current) return;
    const isMuted = isGameRunning || isLaunching;
    let baseVol = isMuted ? 0 : (musicVolume / 100) * (masterVolume / 100);
    if (!isMuted && isVideoDucked && videoLowersMusic) {
      baseVol *= 0.15;
    }
    bgAudioRef.current.volume = Math.max(0, Math.min(1, baseVol));

    if (!isMusicEnabled || isMuted) {
      bgAudioRef.current.pause();
    } else if (bgAudioRef.current.paused && currentPlaylist.length > 0 && bgAudioRef.current.src) {
      bgAudioRef.current.play().catch(() => {});
    }
  }, [masterVolume, musicVolume, isMusicEnabled, isVideoDucked, videoLowersMusic, currentPlaylist, isGameRunning, isLaunching]);

  // Play track when track index or playlist changes
  useEffect(() => {
    if (!bgAudioRef.current) return;
    if (!isMusicEnabled || currentPlaylist.length === 0) {
      bgAudioRef.current.pause();
      return;
    }

    const track = currentPlaylist[currentTrackIndex % currentPlaylist.length];
    if (track) {
      bgAudioRef.current.src = track.url;
      let baseVol = (musicVolume / 100) * (masterVolume / 100);
      if (isVideoDucked && videoLowersMusic) {
        baseVol *= 0.15;
      }
      bgAudioRef.current.volume = Math.max(0, Math.min(1, baseVol));
      bgAudioRef.current.play().then(() => {
        if (displayTitles) {
          window.dispatchEvent(new CustomEvent("show-toast", {
            detail: {
              title: "🎵 Tocando Música",
              description: track.name,
              type: "info"
            }
          }));
        }
      }).catch(() => {});
    }
  }, [currentTrackIndex, currentPlaylist, isMusicEnabled]);

  const handleMusicEnded = () => {
    if (currentPlaylist.length > 0) {
      setCurrentTrackIndex(prev => (prev + 1) % currentPlaylist.length);
    }
  };

  // Listen to video-playback event from SystemAppContent
  useEffect(() => {
    const handleVideoPlayback = (e: any) => {
      if (e.detail) {
        setIsVideoDucked(Boolean(e.detail.playing));
      }
    };
    window.addEventListener("video-playback-changed", handleVideoPlayback);
    return () => {
      window.removeEventListener("video-playback-changed", handleVideoPlayback);
    };
  }, []);

  // Show volume popup toast when masterVolume changes
  const prevVolRef = useRef(masterVolume);
  useEffect(() => {
    if (prevVolRef.current !== masterVolume) {
      prevVolRef.current = masterVolume;
      if (showVolumePopup) {
        window.dispatchEvent(new CustomEvent("show-toast", {
          detail: {
            title: "Volume do Sistema",
            description: `${masterVolume}%`,
            type: "info"
          }
        }));
      }
    }
  }, [masterVolume, showVolumePopup]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    window.api.checkBatteryExists().then((exists) => {
      if (!active) return;
      if (!exists) {
        setBatteryState({ level: 100, charging: true, hasBattery: false });
        return;
      }
      
      if ('getBattery' in navigator) {
        (navigator as any).getBattery().then((batt: any) => {
          if (!active) return;
          const updateBattery = () => {
            setBatteryState({
              level: Math.round(batt.level * 100),
              charging: batt.charging,
              hasBattery: true
            });
          };
          updateBattery();
          batt.addEventListener('levelchange', updateBattery);
          batt.addEventListener('chargingchange', updateBattery);
          
          cleanup = () => {
            batt.removeEventListener('levelchange', updateBattery);
            batt.removeEventListener('chargingchange', updateBattery);
          };
        }).catch(() => {
          setBatteryState(null);
        });
      }
    });

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, []);



  const handleSaveSetting = useCallback((name: string, value: any, type: "string" | "bool" | "int" | "float") => {
    window.api.saveSetting(name, value, type).then(() => {
      setSettings((prev: any) => ({
        ...prev,
        [name]: { value }
      }));
    });
  }, []);

  const handleSaveEmulatorSetting = useCallback((emulator: string, name: string, value: any) => {
    window.api.saveEmulatorSetting(emulator, name, value).then(() => {
      setEmulatorSettings((prev: any) => ({
        ...prev,
        [emulator]: {
          ...(prev?.[emulator] || {}),
          [name]: value
        }
      }));
    });
  }, []);

  const getDesktopIcons = useCallback(() => {
    const raw = settings["Desktop.Icons"]?.value;
    if (raw !== undefined) {
      return String(raw).split(",").filter(Boolean);
    }
    return ["tool:all"];
  }, [settings]);

  const getTaskbarIcons = useCallback(() => {
    const raw = settings["Taskbar.Icons"]?.value;
    if (raw !== undefined) {
      return String(raw).split(",").filter(Boolean);
    }
    return ["tool:all", "tool:settings"];
  }, [settings]);

  interface VirtualWindow {
    id: string; // system-{id} or tool-{id}
    type: 'system' | 'tool';
    appId: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isMinimized: boolean;
    isMaximized: boolean;
    zIndex: number;
  }

  const [virtualWindows, setVirtualWindows] = useState<VirtualWindow[]>([]);
  const [openMenuSystemId, setOpenMenuSystemId] = useState<string | null>(null);
  const [activeGameArt, setActiveGameArt] = useState<string | null>(null);
  const [controllers, setControllers] = useState<any[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Installer states
  const [installerOpen, setInstallerOpen] = useState(false);
  const [installerStatus, setInstallerStatus] = useState<'prompt' | 'downloading' | 'extracting' | 'completed' | 'error'>('prompt');
  const [installerEmulator, setInstallerEmulator] = useState('');
  const [installerSourceUrl, setInstallerSourceUrl] = useState('');
  const [installerSystem, setInstallerSystem] = useState<System | null>(null);
  const [installerGame, setInstallerGame] = useState<Game | null>(null);
  const [installerProgress, setInstallerProgress] = useState(0);
  const [installerError, setInstallerError] = useState('');
  const [isUpdatePrompt, setIsUpdatePrompt] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; title: string; description: string; type: "favorite" | "controller"; favorite?: boolean; open: boolean }[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleShowToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = Math.random().toString(36).substring(2, 9);
      
      let added = false;
      setToasts((prev) => {
        // Prevent duplicate open toasts for same controller or same title/description
        const existingIdx = prev.findIndex((t) => t.open && (
          (t.title === detail.title && t.description === detail.description) ||
          (detail.type === "controller" && t.type === "controller" && t.title === detail.title)
        ));

        if (existingIdx !== -1) {
          return prev.map((t, idx) => idx === existingIdx ? { ...t, description: detail.description } : t);
        }

        added = true;
        return [...prev, { id, ...detail, open: true }];
      });
      
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
            <Toast.Title className="text-md font-bold text-white truncate">
              {toast.title}
            </Toast.Title>
            <Toast.Description className="text-[12px] text-white/50 truncate mt-0.5">
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
    window.api.getVersion().then((res: any) => {
      if (res && res.app) {
        setAppVersion(res.app);
      }
    });
  }, []);

  const [fps, setFps] = useState(60);
  const showFps = settings["DrawFramerate"]?.value === true;

  useEffect(() => {
    if (!showFps) return;

    let lastTime = performance.now();
    let frameCount = 0;
    let animationId: number;

    const tick = () => {
      frameCount++;
      const now = performance.now();
      if (now >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [showFps]);

  // Dynamically apply accent color CSS variables
  useEffect(() => {
    // Don't override localStorage with default color before settings have loaded from DB
    if (!settings["RIESCADE.AccentColor"]) return;

    const color = settings["RIESCADE.AccentColor"].value || "#8b5cf6";
    const root = document.documentElement;
    root.style.setProperty("--accent-color", color);
    localStorage.setItem("accentColor", color);
    
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

  const prevControllersRef = useRef<any[]>([]);

  // Listen for native controllers updates from Electron main process
  useEffect(() => {
    // 1. Load initial connected controllers
    window.api.detectControllers().then((initial: any[]) => {
      const list = initial || [];
      setControllers(list);
      prevControllersRef.current = list;
    });

    // 2. Listen to hot-plug updates
    const unsubscribe = window.api.on('controllers-updated', (_, newControllers: any[]) => {
      const updatedList = newControllers || [];
      const prevList = prevControllersRef.current;

      const prevGuids = prevList.map(c => c.guid || c.instanceId);
      const newGuids = updatedList.map(c => c.guid || c.instanceId);

      const showNotifications = settings["ShowControllerNotifications"]?.value !== false && settings["ShowControllerNotifications"]?.value !== "false";

      if (showNotifications) {
        // Find connected ones
        updatedList.forEach(c => {
          const key = c.guid || c.instanceId;
          if (!prevGuids.includes(key)) {
            window.dispatchEvent(
              new CustomEvent("show-toast", {
                detail: {
                  title: "Controle Conectado",
                  description: c.name,
                  type: "controller"
                }
              })
            );
          }
        });

        // Find disconnected ones
        prevList.forEach(c => {
          const key = c.guid || c.instanceId;
          if (!newGuids.includes(key)) {
            window.dispatchEvent(
              new CustomEvent("show-toast", {
                detail: {
                  title: "Controle Desconectado",
                  description: c.name,
                  type: "controller"
                }
              })
            );
          }
        });
      }

      prevControllersRef.current = updatedList;
      setControllers(updatedList);
    });

    return () => {
      unsubscribe();
    };
  }, [settings]);

  // Helper callbacks for virtual windows
  const focusVirtualWindow = useCallback((id: string) => {
    setVirtualWindows(prev => {
      const BASE_Z_INDEX = 50;
      const maxZ = prev.reduce((max, w) => Math.max(max, w.zIndex), BASE_Z_INDEX - 1);
      return prev.map(w => w.id === id ? { ...w, zIndex: maxZ + 1 } : w);
    });
  }, []);

  const closeVirtualWindow = useCallback((id: string) => {
    setVirtualWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const minimizeVirtualWindow = useCallback((id: string) => {
    setVirtualWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: true } : w));
  }, []);

  const toggleMaximizeVirtualWindow = useCallback((id: string) => {
    setVirtualWindows(prev => {
      const updated = prev.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w);
      const win = updated.find(w => w.id === id);
      if (win) {
        handleSaveSetting(`Window.${win.id}.Maximized`, win.isMaximized, 'bool');
      }
      return updated;
    });
  }, [handleSaveSetting]);

  const updateVirtualWindowBounds = useCallback((id: string, bounds: { x: number; y: number; width: number; height: number }) => {
    setVirtualWindows(prev => prev.map(w => w.id === id ? { ...w, ...bounds } : w));
    // Single IPC call: 1 file read + 1 file write instead of 4x each
    window.api.saveWindowBounds(id, bounds).then(() => {
      setSettings((prev: any) => ({
        ...prev,
        [`Window.${id}.X`]: { value: Math.round(bounds.x) },
        [`Window.${id}.Y`]: { value: Math.round(bounds.y) },
        [`Window.${id}.Width`]: { value: Math.round(bounds.width) },
        [`Window.${id}.Height`]: { value: Math.round(bounds.height) }
      }));
    });
  }, []);

  const togglePinDesktop = useCallback((type: "system" | "tool", appId: string) => {
    const current = getDesktopIcons();
    const itemKey = `${type}:${appId}`;
    const next = current.includes(itemKey) ? current.filter(x => x !== itemKey) : [...current, itemKey];
    handleSaveSetting("Desktop.Icons", next.join(","), "string");
  }, [getDesktopIcons, handleSaveSetting]);

  const togglePinTaskbar = useCallback((type: "system" | "tool", appId: string) => {
    const current = getTaskbarIcons();
    const itemKey = `${type}:${appId}`;
    const next = current.includes(itemKey) ? current.filter(x => x !== itemKey) : [...current, itemKey];
    handleSaveSetting("Taskbar.Icons", next.join(","), "string");
  }, [getTaskbarIcons, handleSaveSetting]);

  const handleTaskbarContextMenu = useCallback((e: React.MouseEvent, item: any, isPinned: boolean) => {
    e.preventDefault();
    setTaskbarContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      isPinned
    });
  }, []);

  const handleTogglePin = useCallback(() => {
    if (!taskbarContextMenu) return;
    const { type, appId } = taskbarContextMenu.item;
    togglePinTaskbar(type, appId);
    setTaskbarContextMenu(null);
  }, [taskbarContextMenu, togglePinTaskbar]);

  const handleCloseWindow = useCallback(() => {
    if (!taskbarContextMenu) return;
    const { type, appId } = taskbarContextMenu.item;
    const winKey = `${type}-${appId}`;
    closeVirtualWindow(winKey);
    setTaskbarContextMenu(null);
  }, [taskbarContextMenu, closeVirtualWindow]);

  const renderSystemMenu = (systemName: string) => {
    const system = systems.find(s => s.name === systemName);
    const isMenuOpen = openMenuSystemId === systemName;
    const matchingTool = TOOL_APPS.find(t => t.id === systemName);
    const theme = matchingTool ? { icon: matchingTool.icon } : getSystemTheme(systemName);
    const SystemIcon = theme.icon;
    
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
      <div className="relative flex items-center gap-2 w-full min-w-0">
        <div className="relative flex items-center no-drag shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setOpenMenuSystemId(isMenuOpen ? null : systemName); 
            }}
            className={`text-white/60 hover:text-white transition cursor-pointer flex items-center justify-center p-1 rounded ${isMenuOpen ? "text-white bg-white/10" : ""}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          
          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenMenuSystemId(null)} />
              <div className="absolute left-0 top-7 w-64 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-2 z-50 text-white animate-in fade-in slide-in-from-top-2 duration-150">
                <button 
                  onClick={() => { handleToggleDesktop(); setOpenMenuSystemId(null); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition"
                >
                  <Monitor className="w-4 h-4 text-accent" />
                  <span>{isDesktop ? "Remover do Desktop" : "Adicionar ao Desktop"}</span>
                </button>

                <button 
                  onClick={() => { handleToggleTaskbar(); setOpenMenuSystemId(null); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition"
                >
                  <Grid3x3 className="w-4 h-4 text-cyan-400" />
                  <span>{isTaskbar ? "Remover da Taskbar" : "Adicionar à Taskbar"}</span>
                </button>

                {hasMultipleEmulators(system) ? (
                  <>
                    <div className="h-px bg-white/10 my-1.5" />

                    <div className="px-3 py-1 text-[10px] text-white/40 uppercase font-semibold tracking-wider">
                      Emuladores
                    </div>

                    <button
                      onClick={() => {
                        handleSaveSetting(`${systemName}.emulator`, "auto", "string");
                        handleSaveSetting(`${systemName}.core`, "auto", "string");
                        setOpenMenuSystemId(null);
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
                                setOpenMenuSystemId(null);
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
                              setOpenMenuSystemId(null);
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
                  </>
                ) : (
                  system?.emulators && system.emulators.length > 0 && (() => {
                    const emu = system.emulators[0];
                    const emuName = emu.name === 'libretro' ? 'retroarch' : emu.name;
                    const emuLabel = (emu.name === 'libretro' ? 'RETROARCH' : emu.name.toUpperCase());
                    return (
                      <>
                        <div className="h-px bg-white/10 my-1.5" />
                        <button
                          onClick={() => {
                            openApp("tool", "settings", emuName);
                            setOpenMenuSystemId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer"
                        >
                          <Settings className="w-4 h-4 text-accent" />
                          <span>Configurar {emuLabel}</span>
                        </button>
                      </>
                    );
                  })()
                )}
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2 min-w-0 truncate pr-4">
          {SystemIcon && <SystemIcon className="w-4 h-4 text-accent shrink-0" />}
          <span className="text-sm font-bold text-white/95 truncate tracking-wide">
            {system?.fullname || (matchingTool ? matchingTool.name : systemName.toUpperCase())}
          </span>
        </div>
      </div>
    );
  };

  const openVirtualWindow = useCallback((type: "system" | "tool", appId: string) => {
    setLauncherOpen(false);
    const winKey = `${type}-${appId}`;
    
    setVirtualWindows(prev => {
      const existing = prev.find(w => w.id === winKey);
      const BASE_Z_INDEX = 50;
      const maxZ = prev.reduce((max, w) => Math.max(max, w.zIndex), BASE_Z_INDEX - 1);
      
      if (existing) {
        const visibleWins = prev.filter(w => !w.isMinimized);
        const topWin = visibleWins.length > 0 
          ? [...visibleWins].sort((a, b) => b.zIndex - a.zIndex)[0] 
          : null;
        const isCurrentlyActive = topWin && topWin.id === winKey;

        return prev.map(w => w.id === winKey 
          ? { 
              ...w, 
              isMinimized: isCurrentlyActive ? !w.isMinimized : false, 
              zIndex: maxZ + 1 
            } 
          : w
        );
      }
      
      const savedWidth = settings[`Window.${winKey}.Width`]?.value;
      const savedHeight = settings[`Window.${winKey}.Height`]?.value;
      const savedX = settings[`Window.${winKey}.X`]?.value;
      const savedY = settings[`Window.${winKey}.Y`]?.value;
      const savedMaximized = settings[`Window.${winKey}.Maximized`]?.value === "true" || settings[`Window.${winKey}.Maximized`]?.value === true;
      
      let width = 960;
      let height = 640;
      let title = appId.toUpperCase();
      
      if (type === 'tool') {
        if (appId === 'saves') { width = 760; height = 540; title = 'Gerenciador de Saves'; }
        else if (appId === 'achievements') { width = 720; height = 520; title = 'Conquistas'; }
        else if (appId === 'settings') { width = 820; height = 560; title = 'Configurações'; }
        else if (appId === 'database') { width = 1024; height = 680; title = 'Banco de Dados'; }
        else if (appId === 'all') { width = 1024; height = 680; title = 'Todos os Jogos'; }
        else if (appId === 'favorites') { width = 1024; height = 680; title = 'Favoritos'; }
        else if (appId === 'collections') { width = 1024; height = 680; title = 'Coleções'; }
      } else {
        const sys = systems.find(s => s.name.toLowerCase() === appId.toLowerCase());
        if (sys) title = sys.fullname;
      }
      
      const desktopWidth = window.innerWidth;
      const desktopHeight = window.innerHeight - 56;
      const defaultX = Math.max(20, Math.round((desktopWidth - width) / 2));
      const defaultY = Math.max(70, Math.round((desktopHeight - height) / 2));
      
      let initialX = savedX !== undefined ? parseInt(savedX, 10) : defaultX;
      let initialY = savedY !== undefined ? parseInt(savedY, 10) : defaultY;
      
      if (initialX < 0 || initialX > window.innerWidth - 100 || initialY < 0 || initialY > window.innerHeight - 100) {
        initialX = defaultX;
        initialY = defaultY;
      }
      
      const newWin: VirtualWindow = {
        id: winKey,
        type,
        appId,
        title,
        x: initialX,
        y: initialY,
        width: savedWidth !== undefined ? parseInt(savedWidth, 10) : width,
        height: savedHeight !== undefined ? parseInt(savedHeight, 10) : height,
        isMinimized: false,
        isMaximized: savedMaximized,
        zIndex: maxZ + 1
      };
      
      return [...prev, newWin];
    });
  }, [systems, settings, handleSaveSetting]);

  // Listen for IPC messages to open/show sub-windows
  useEffect(() => {
    const unsubscribe = window.api.on('open-app-window', (_event: any, type: 'system' | 'tool', id: string) => {
      openVirtualWindow(type, id);
    });
    return () => unsubscribe();
  }, [openVirtualWindow]);

  // Derive active sub-window id based on highest zIndex of visible windows
  const activeSubWindowId = useMemo(() => {
    const visibleWins = virtualWindows.filter(w => !w.isMinimized);
    if (visibleWins.length === 0) return null;
    const sorted = [...visibleWins].sort((a, b) => b.zIndex - a.zIndex);
    return sorted[0].appId; // Focus by appId
  }, [virtualWindows]);

  // Parse URL Search Parameters for Standalone mode
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const windowType = params.get("windowType");   // "system" | "tool" | null
  const systemName = params.get("systemName");   // ex: "snes"
  const toolId = params.get("toolId");           // ex: "settings"

  const toolApp = useMemo(() => {
    if (!toolId) return undefined;
    return TOOL_APPS.find(t => t.id === toolId);
  }, [toolId]);

  const virtualSystem = useMemo(() => {
    if (windowType !== "tool" || !toolId) return null;
    return {
      name: toolId,
      fullname: toolApp?.name || (toolId === "all" ? "Todos os Jogos" : toolId === "favorites" ? "Favoritos" : "Coleções"),
      path: `virtual://${toolId}`,
      extension: "",
      command: "",
      platform: "pc",
      theme: toolId === "all" ? "auto-allgames" : toolId === "favorites" ? "auto-favorites" : "custom-collections",
      hardware: toolId === "collections" ? "custom-collections" : "auto collection",
      emulators: []
    };
  }, [windowType, toolId, toolApp]);

  const virtualTheme = useMemo(() => {
    if (windowType !== "tool" || !toolId) return null;
    return {
      icon: toolApp?.icon || Gamepad2,
      color: toolApp?.color || "from-indigo-500 to-violet-600",
      bg: "radial-gradient(1200px at 50% 50%, #222222ff 0%, #030303ff 100%)"
    };
  }, [windowType, toolId, toolApp]);

  // Determine active system name if user is in a system window
  const activeSystemName = useMemo(() => {
    if (windowType === 'system' && systemName) {
      return systemName;
    }
    return null;
  }, [windowType, systemName]);

  // Load background music playlist based on active system and settings
  useEffect(() => {
    let cancelled = false;

    const fetchTracks = async () => {
      let rawTracks: any[] = [];
      if (perSystemMusic && activeSystemName) {
        rawTracks = await window.api.getMusicFiles(`systems/${activeSystemName}`);
        if (rawTracks.length === 0) {
          rawTracks = await window.api.getMusicFiles("systems");
        }
      }

      if (rawTracks.length === 0 && useFavoriteMusic) {
        rawTracks = await window.api.getMusicFiles("favorites");
      }

      const formatted = (rawTracks || []).map(item => {
        if (typeof item === 'string') {
          const parts = item.split('/');
          const fileName = parts[parts.length - 1];
          const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
          return {
            name: cleanName,
            relativePath: item,
            url: item.startsWith('http') || item.startsWith('file://') ? item : `file:///${item.replace(/\\/g, '/')}`
          };
        }
        return item;
      });

      if (!cancelled) {
        setCurrentPlaylist(formatted);
        setCurrentTrackIndex(0);
      }
    };

    fetchTracks();
    return () => { cancelled = true; };
  }, [activeSystemName, perSystemMusic, useFavoriteMusic]);

  // Fast boot: Skip overlay synchronized loader inside standalone windows
  const [libraryLoading, setLibraryLoading] = useState(windowType === null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Iniciando RIESCADE OS...");
  
  const desktopRef = useRef<HTMLDivElement>(null);
  const startMenuInputRef = useRef<HTMLInputElement>(null);



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
      setLoadingProgress(Math.min(100, Math.max(0, Math.round(progress))));
    });
    return () => unsubscribe();
  }, []);

  // Handle Start Menu focus/cleanup on opening/closing
  useEffect(() => {
    if (launcherOpen) {
      setTimeout(() => {
        startMenuInputRef.current?.focus();
      }, 50);
    } else {
      setStartMenuSearch("");
    }
  }, [launcherOpen]);

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

  useEffect(() => {
    const unsubscribe = window.api.on('emulator-setting-changed', (_event: any, data: { emulator: string; name: string; value: any }) => {
      setEmulatorSettings((prev: any) => ({
        ...prev,
        [data.emulator]: {
          ...(prev?.[data.emulator] || {}),
          [data.name]: data.value
        }
      }));
    });
    return () => unsubscribe();
  }, []);

  // Fetch Systems & Settings on Mount
  useEffect(() => {
    const initPromise = windowType !== null 
      ? Promise.resolve() 
      : window.api.preloadLibrary();

    setLoadingMessage("Carregando banco de dados...");
    initPromise.then(() => {
      setLoadingMessage("Sincronizando plataformas...");
      Promise.all([
        window.api.getSystems(),
        window.api.getSettings(),
        window.api.getEmulatorSettings ? window.api.getEmulatorSettings() : Promise.resolve({})
      ]).then(([sysList, appSettings, emuSettings]) => {
        setLoadingMessage("Carregando configurações de exibição...");
        setSystems(sysList || []);
        setSettings(appSettings || {});
        setEmulatorSettings(emuSettings || {});
        
        setTimeout(() => {
          setLibraryLoading(false);
        }, 800); // 0.8s smooth fade-out
      });
    }).catch((err) => {
      console.error("Failed to preload library:", err);
      setLibraryLoading(false);
    });
  }, []);

  // Open App - Opens virtual windows
  const openApp = useCallback((type: "system" | "tool", appId: string, subId?: string, coreId?: string) => {
    setLauncherOpen(false);
    
    if (windowType !== "desktop") {
      window.api.openAppWindow(type, appId);
    } else {
      openVirtualWindow(type, appId);
    }

    if (appId === "settings" && subId) {
      const targetSub = subId === "libretro" ? "retroarch" : subId;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("navigate-settings", { 
          detail: { 
            tab: "emuladores", 
            subTab: targetSub,
            initialGroup: targetSub === "retroarch" && coreId ? "cores" : undefined,
            initialCore: coreId
          } 
        }));
      }, 200);
    }
  }, [windowType, openVirtualWindow]);

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

    return `url(${defaultBg})`;
  }, [windowType, systemName, activeSubWindowId, settings, systems]);

  const backgroundVideoSrc = useMemo(() => {
    const isVideoEnabled = settings["RIESCADE.EnableBackgroundVideo"]?.value === true || settings["RIESCADE.EnableBackgroundVideo"]?.value === "true";
    if (!isVideoEnabled) return null;
    return settings["RIESCADE.BackgroundVideoPath"]?.value || defaultVideo;
  }, [settings]);

  const activeSubWindowArt = useMemo(() => {
    if (!activeSubWindowId) return null;
    const sys = systems.find(s => s.name === activeSubWindowId);
    return sys?.art || null;
  }, [activeSubWindowId, systems]);

  // Listen to emulator download progress
  useEffect(() => {
    const unsubscribe = window.api.on('emulator-download-progress', (_event: any, data: { emulatorName: string; pct: number }) => {
      setInstallerProgress(data.pct);
      if (data.pct >= 100) {
        setInstallerStatus('extracting');
      }
    });
    return unsubscribe;
  }, []);

  // Listen to launcher-status events (game loading, running, closed) to mute/unmute background audio & UI sounds
  useEffect(() => {
    const unsubscribe = window.api.on('launcher-status', (_event: any, data: { status: 'loading' | 'running' | 'closed' }) => {
      if (data.status === 'loading' || data.status === 'running') {
        setIsGameRunning(true);
        setAppMuted(true);
      } else if (data.status === 'closed') {
        setIsGameRunning(false);
        setIsLaunching(false);
        setLaunchingGame(null);
        setAppMuted(false);
      }
    });
    return unsubscribe;
  }, []);

  const launchDirectly = (game: Game, system: System, saveStateSlot?: number) => {
    setIsLaunching(true);
    setLaunchingGame(game);
    setIsGameRunning(true);
    setAppMuted(true);
    window.api.launchGame(game, system, saveStateSlot).then(() => {
      setIsLaunching(false);
      setLaunchingGame(null);
      setIsGameRunning(false);
      setAppMuted(false);
    }).catch(() => {
      setIsLaunching(false);
      setLaunchingGame(null);
      setIsGameRunning(false);
      setAppMuted(false);
    });
  };

  const handleStartInstall = () => {
    setInstallerStatus('downloading');
    setInstallerProgress(0);
    setInstallerError('');

    window.api.downloadAndInstallEmulator(installerEmulator, installerSourceUrl).then(() => {
      setInstallerStatus('completed');
      setTimeout(() => {
        setInstallerOpen(false);
        if (installerGame && installerSystem) {
          launchDirectly(installerGame, installerSystem);
        }
      }, 1200);
    }).catch((err: any) => {
      setInstallerStatus('error');
      setInstallerError(err.message || 'Erro durante o download ou extração.');
    });
  };

  // Launch Game Handler
  const handleLaunchGame = (game: Game, system: System, saveStateSlot?: number) => {
    let targetSystem = system;
    if (system.name === 'collections') {
      const realSystem = systems.find(s => s.name.toLowerCase() === game.system.toLowerCase());
      if (realSystem) targetSystem = realSystem;
    }

    let emulatorName = 'retroarch';
    if (game.emulator && game.emulator !== 'auto') {
      emulatorName = game.emulator;
    } else {
      const systemWideEmulator = settings[`${targetSystem.name}.emulator`]?.value;
      if (systemWideEmulator && systemWideEmulator !== 'auto') {
        emulatorName = systemWideEmulator;
      } else if (targetSystem.emulators?.[0]?.name) {
        emulatorName = targetSystem.emulators[0].name;
      }
    }

    if (emulatorName === 'libretro') {
      emulatorName = 'retroarch';
    }

    window.api.checkEmulatorStatus(emulatorName, targetSystem.name).then((status: any) => {
      if (!status.installed && status.sourceUrl) {
        setInstallerEmulator(emulatorName);
        setInstallerSourceUrl(status.sourceUrl);
        setInstallerSystem(targetSystem);
        setInstallerGame(game);
        setInstallerStatus('prompt');
        setIsUpdatePrompt(false);
        setInstallerOpen(true);
        return;
      }

      if (!status.installed && !status.sourceUrl) {
        setInstallerEmulator(emulatorName);
        setInstallerSourceUrl('');
        setInstallerSystem(targetSystem);
        setInstallerGame(game);
        setInstallerStatus('error');
        setInstallerError(`O emulador ${emulatorName.toUpperCase()} é necessário para jogar, mas não está instalado no seu sistema e não possui link de download automático cadastrado.`);
        setInstallerOpen(true);
        return;
      }

      if (status.updateAvailable && status.sourceUrl) {
        setInstallerEmulator(emulatorName);
        setInstallerSourceUrl(status.sourceUrl);
        setInstallerSystem(targetSystem);
        setInstallerGame(game);
        setInstallerStatus('prompt');
        setIsUpdatePrompt(true);
        setInstallerOpen(true);
        return;
      }

      launchDirectly(game, targetSystem, saveStateSlot);
    }).catch((err) => {
      console.error('Failed to check emulator status, launching fallback:', err);
      launchDirectly(game, targetSystem, saveStateSlot);
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
                  style={{ width: `${loadingProgress}%`, backgroundImage: 'linear-gradient(to right, var(--accent-color), var(--accent-color-hover))' }}
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
        <div key="system-not-found" className="w-screen h-screen flex items-center justify-center text-white bg-[#333333]">
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

                  {hasMultipleEmulators(system) ? (
                    <>
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
                    </>
                  ) : (
                    system?.emulators && system.emulators.length > 0 && (() => {
                      const emu = system.emulators[0];
                      const emuName = emu.name === 'libretro' ? 'retroarch' : emu.name;
                      const emuLabel = (emu.name === 'libretro' ? 'RETROARCH' : emu.name.toUpperCase());
                      return (
                        <>
                          <div className="h-px bg-white/10 my-1.5" />
                          <button
                            onClick={() => {
                              openApp("tool", "settings", emuName);
                              setMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer"
                          >
                            <Settings className="w-4 h-4 text-accent" />
                            <span>Configurar {emuLabel}</span>
                          </button>
                        </>
                      );
                    })()
                  )}
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
              onActiveGameArtChanged={setActiveGameArt}
              onOpenTool={(toolId, subId, coreId) => openApp('tool', toolId, subId, coreId)}
              settings={settings}
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
    if (["all", "favorites", "collections"].includes(toolId)) {
      const system = virtualSystem;
      const theme = virtualTheme;
      if (!system || !theme) return null;
      const platformBackgroundArt = activeGameArt || null;

      return (
        <Toast.Provider swipeDirection="up" duration={Infinity}>
          <div 
            key={`tool-${toolId}`} 
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
                systemName={toolId}
                system={system}
                color={theme.color}
                Icon={theme.icon}
                onLaunchGame={handleLaunchGame}
                onActiveGameArtChanged={setActiveGameArt}
                onOpenTool={(toolId, subId, coreId) => openApp('tool', toolId, subId, coreId)}
              settings={settings}
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
            emulatorSettings={emulatorSettings}
            onSaveEmulatorSetting={handleSaveEmulatorSetting}
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
        {backgroundVideoSrc && (
          <video
            key={backgroundVideoSrc}
            src={backgroundVideoSrc}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          />
        )}
        {/* Virtual Windows */}
        {virtualWindows.map(win => {
          if (win.type === 'system' && !systems.some(s => s.name === win.appId)) {
            return null;
          }
          const active = activeSubWindowId === win.appId;
          const isVirtualTool = ["all", "favorites", "collections"].includes(win.appId);
          const toolItem = TOOL_APPS.find(t => t.id === win.appId);
          
          const theme = isVirtualTool && toolItem
            ? { icon: toolItem.icon, color: toolItem.color, bg: "radial-gradient(1200px at 50% 50%, #222222ff 0%, #030303ff 100%)" }
            : getSystemTheme(win.appId);
            
          const Icon = theme.icon;
          const sys = systems.find(s => s.name === win.appId);
          const winIcon = toolItem ? toolItem.icon : Icon;

          return (
            <VirtualWindow
              key={win.id}
              id={win.id}
              type={win.type}
              appId={win.appId}
              title={win.title}
              icon={winIcon}
              initialX={win.x}
              initialY={win.y}
              initialWidth={win.width}
              initialHeight={win.height}
              isMinimized={win.isMinimized}
              isMaximized={win.isMaximized}
              zIndex={win.zIndex}
              active={active}
              headerLeft={win.type === 'system' ? renderSystemMenu(win.appId) : undefined}
              onFocus={focusVirtualWindow}
              onClose={closeVirtualWindow}
              onMinimize={minimizeVirtualWindow}
              onMaximize={toggleMaximizeVirtualWindow}
              onUpdateBounds={updateVirtualWindowBounds}
            >
              {win.type === 'system' || isVirtualTool ? (
                <SystemAppContent
                  systemName={win.appId}
                  system={win.type === 'system' ? sys! : {
                    name: win.appId,
                    fullname: win.title,
                    path: `virtual://${win.appId}`,
                    extension: "",
                    command: "",
                    platform: "pc",
                    theme: win.appId === "all" ? "auto-allgames" : win.appId === "favorites" ? "auto-favorites" : "custom-collections",
                    hardware: win.appId === "collections" ? "custom-collections" : "auto collection",
                    emulators: []
                  } as any}
                  color={theme.color}
                  Icon={Icon}
                  onLaunchGame={handleLaunchGame}
                  onActiveGameArtChanged={setActiveGameArt}
                  onOpenTool={(toolId, subId, coreId) => openApp('tool', toolId, subId, coreId)}
              settings={settings}
                />
              ) : (
                <ToolAppContent
                  appId={win.appId}
                  systems={systems}
                  onOpenSystem={(sysName) => openVirtualWindow('system', sysName)}
                  settings={settings}
                  onSaveSetting={handleSaveSetting}
                  emulatorSettings={emulatorSettings}
                  onSaveEmulatorSetting={handleSaveEmulatorSetting}
                />
              )}
            </VirtualWindow>
          );
        })}

        {/* Desktop Active System Background Art Overlay with Fade-in */}
        {activeSubWindowArt && settings["RIESCADE.DynamicBackground"]?.value !== "false" && (
          <div 
            key={activeSubWindowArt}
            className="absolute inset-0 bg-cover bg-center pointer-events-none animate-in fade-in duration-1000 z-0"
            style={{ backgroundImage: `url("${activeSubWindowArt}")` }}
          />
        )}
      {/* Floating orbs wallpaper */}
      <div className="pointer-events-none absolute inset-0" />

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
      <div
        className={`start-menu-overlay absolute inset-0 z-[100] flex items-center justify-center pt-16 pb-32 ${
          launcherOpen ? "open" : ""
        }`}
        onClick={(e) => { e.stopPropagation(); setLauncherOpen(false); }}
      >
        <div
          className={`start-menu-card glass-strong rounded-3xl w-[760px] max-w-[90%] h-[78%] p-6 flex flex-col ${
            launcherOpen ? "open" : ""
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative mb-5 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-accent transition duration-200" />
            <input
              ref={startMenuInputRef}
              value={startMenuSearch}
              onChange={(e) => setStartMenuSearch(e.target.value)}
              placeholder="Pesquisar plataformas ou ferramentas..."
              className="w-full bg-white/10 border border-white/15 rounded-full pl-11 pr-10 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-accent"
            />
            {startMenuSearch && (
              <button
                type="button"
                onClick={() => setStartMenuSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition p-1 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
            
            <ScrollArea className="flex-1 pr-2">
              <div className="text-xs uppercase text-white/40 tracking-wider mb-3">Ferramentas do Sistema</div>
              <div className="grid grid-cols-5 gap-3 mb-6">
                {TOOL_APPS
                  .filter(app => app.name.toLowerCase().includes(startMenuSearch.toLowerCase()))
                  .map(app => {
                    const ToolIcon = app.icon;
                    return (
                      <div key={app.id} className="relative group">
                        <button
                          onClick={() => openApp("tool", app.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setStartMenuContextMenu({ x: e.clientX, y: e.clientY, type: "tool", appId: app.id, name: app.name });
                          }}
                          className="w-full flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/10 transition group/btn relative cursor-pointer"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setStartMenuContextMenu({ x: rect.left, y: rect.bottom + 4, type: "tool", appId: app.id, name: app.name });
                            }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/40 hover:bg-white/20 opacity-0 group-hover/btn:opacity-100 flex items-center justify-center text-white/70 hover:text-white transition z-10 cursor-pointer"
                            title="Opções"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center shadow-lg group-hover/btn:scale-105 transition`}>
                            <ToolIcon className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-xs text-white/90 text-center leading-tight">{app.name}</span>
                        </button>
                      </div>
                    );
                  })}
              </div>

              <div className="text-xs uppercase text-white/40 tracking-wider mb-3">Plataformas de Jogos</div>
              <div className="grid grid-cols-5 gap-3">
                {systems
                  .filter(sys => sys.fullname.toLowerCase().includes(startMenuSearch.toLowerCase()) || sys.name.toLowerCase().includes(startMenuSearch.toLowerCase()))
                  .map(sys => {
                    const theme = getSystemTheme(sys.name);
                    const SysIcon = theme.icon;
                    return (
                      <div key={sys.name} className="relative group">
                        <button
                          onClick={() => openApp("system", sys.name)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setStartMenuContextMenu({ x: e.clientX, y: e.clientY, type: "system", appId: sys.name, name: sys.fullname });
                          }}
                          className="w-full flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/10 transition group/btn relative cursor-pointer"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setStartMenuContextMenu({ x: rect.left, y: rect.bottom + 4, type: "system", appId: sys.name, name: sys.fullname });
                            }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/40 hover:bg-white/20 opacity-0 group-hover/btn:opacity-100 flex items-center justify-center text-white/70 hover:text-white transition z-10 cursor-pointer"
                            title="Opções"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <div className="w-20 h-20 flex items-center justify-center">
                            {sys.logo ? (
                              <img src={sys.logo} alt={sys.fullname} className="h-full object-contain max-w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] group-hover/btn:scale-105 transition-all" />
                            ) : (
                              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${theme.color} flex items-center justify-center shadow-lg group-hover/btn:scale-105 transition`}>
                                <SysIcon className="w-6 h-6 text-white" />
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-white/90 text-center leading-tight truncate w-full">{sys.fullname}</span>
                        </button>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
            
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md"
                  style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-color-hover))' }}
                >R</div>
                <span className="text-sm font-medium text-white/80">RIESCADE Player</span>
              </div>
              <button 
                onClick={() => setShowExitConfirm(true)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-red-500/80 flex items-center justify-center transition"
                title="Desligar"
              >
                <Power className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {startMenuContextMenu && (
            <>
              <div 
                className="fixed inset-0 z-[9999]" 
                onClick={(e) => { e.stopPropagation(); setStartMenuContextMenu(null); }} 
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setStartMenuContextMenu(null); }}
              />
              <div 
                className="fixed z-[10000] w-56 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1.5 text-white animate-in fade-in zoom-in-95 duration-100"
                style={{ 
                  left: Math.min(startMenuContextMenu.x, window.innerWidth - 240), 
                  top: Math.min(startMenuContextMenu.y, window.innerHeight - 180) 
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-white/40 tracking-wider truncate border-b border-white/5 mb-1">
                  {startMenuContextMenu.name}
                </div>

                <button
                  onClick={() => {
                    openApp(startMenuContextMenu.type, startMenuContextMenu.appId);
                    setStartMenuContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer"
                >
                  <Play className="w-4 h-4 text-accent" />
                  <span>Abrir</span>
                </button>

                {(() => {
                  const desktopIcons = getDesktopIcons();
                  const taskbarIcons = getTaskbarIcons();
                  const itemKey = `${startMenuContextMenu.type}:${startMenuContextMenu.appId}`;
                  const isDesktop = desktopIcons.includes(itemKey);
                  const isTaskbar = taskbarIcons.includes(itemKey);
                  return (
                    <>
                      <button
                        onClick={() => {
                          togglePinDesktop(startMenuContextMenu.type, startMenuContextMenu.appId);
                          setStartMenuContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer"
                      >
                        <Monitor className="w-4 h-4 text-blue-400" />
                        <span>{isDesktop ? "Remover do Desktop" : "Fixar no Desktop"}</span>
                      </button>

                      <button
                        onClick={() => {
                          togglePinTaskbar(startMenuContextMenu.type, startMenuContextMenu.appId);
                          setStartMenuContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer"
                      >
                        <Grid3x3 className="w-4 h-4 text-cyan-400" />
                        <span>{isTaskbar ? "Remover da Taskbar" : "Fixar na Taskbar"}</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </div>

      {/* Overlay behind the taskbar */}

      {/* Windows-style Taskbar bottom edge hover trigger */}
      {taskbarAutoHide && (
        <div 
          className="fixed bottom-0 left-0 right-0 h-3 z-[89]" 
          onMouseEnter={() => setTaskbarHidden(false)}
        />
      )}

      {/* Taskbar inferior flutuante */}
      {(() => {
        const isTaskbarHidden = taskbarAutoHide && taskbarHidden && !launcherOpen && !showQuickSettings && !taskbarContextMenu;
        return (
          <Tooltip.Provider delayDuration={400}>
            <div 
              className={`taskbar-dock absolute bottom-4 left-1/2 -translate-x-1/2 z-[90] transition-all duration-300 ${
                isTaskbarHidden ? "translate-y-28 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
              }`} 
              onMouseEnter={() => setTaskbarHidden(false)}
              onClick={(e) => e.stopPropagation()}
            >
          <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-2 shadow-2xl">
            
            {/* Start Menu button */}
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => setLauncherOpen(v => !v)}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 overflow-visible relative"
                  style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-color-hover))' }}
                >
                  <img 
                    src={riescadeLogo} 
                    alt="Menu" 
                    className={`w-[46px] h-auto max-w-none absolute top-[-6px] object-contain ${launcherOpen ? "animate-start-menu-open" : "animate-start-menu-close"}`}
                  />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                  RIESCADE OS
                  <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <div className="w-px h-8 bg-white/15 mx-1" />

            {/* Pinned Apps */}
            {(() => {
              const pinnedList = getTaskbarIcons()
                .map(resolveIconItem)
                .filter((item): item is NonNullable<typeof item> => item !== null);

              return pinnedList.map((item, idx) => {
                const Icon = item.icon;
                const isOpen = virtualWindows.some(w => w.appId === item.appId && w.type === item.type);
                const isMinimized = virtualWindows.find(w => w.appId === item.appId && w.type === item.type)?.isMinimized ?? false;

                return (
                  <Tooltip.Root key={item.id} open={draggedIndex === null ? undefined : false}>
                    <Tooltip.Trigger asChild>
                      <button
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedIndex(idx);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDragEnter={() => {
                          setDragOverIndex(idx);
                        }}
                        onDragEnd={() => {
                          setDraggedIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedIndex !== null && draggedIndex !== idx) {
                            const list = getTaskbarIcons();
                            const resolvedList = list
                              .map(resolveIconItem)
                              .filter((x): x is NonNullable<typeof x> => x !== null);
                            
                            const draggedItem = resolvedList[draggedIndex];
                            const dropItem = resolvedList[idx];
                            if (draggedItem && dropItem) {
                              const nextList = [...list];
                              const dIndex = nextList.indexOf(draggedItem.id);
                              const tIndex = nextList.indexOf(dropItem.id);
                              if (dIndex !== -1 && tIndex !== -1) {
                                const [removed] = nextList.splice(dIndex, 1);
                                nextList.splice(tIndex, 0, removed);
                                handleSaveSetting("Taskbar.Icons", nextList.join(","), "string");
                              }
                            }
                          }
                          setDraggedIndex(null);
                          setDragOverIndex(null);
                        }}
                        onClick={() => openApp(item.type, item.appId)}
                        onContextMenu={(e) => handleTaskbarContextMenu(e, item, true)}
                        className={`relative w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all group cursor-pointer ${
                          draggedIndex === idx ? "opacity-40" : ""
                        } ${
                          dragOverIndex === idx && draggedIndex !== idx ? "border border-accent scale-105" : ""
                        }`}
                      >
                        <div className="w-7 h-7 flex items-center justify-center pointer-events-none">
                          {item.logo ? (
                            <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full" />
                          ) : (
                            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        {isOpen && (
                          <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all pointer-events-none ${isMinimized ? "w-1 bg-white/40" : "w-5 bg-accent"}`} />
                        )}
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                        {item.name}
                        <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              });
            })()}

            {/* Dynamic Running Apps Separator & Icons */}
            {(() => {
              const pinnedKeys = getTaskbarIcons();
              const runningTools = virtualWindows
                .filter(w => w.type === "tool" && !pinnedKeys.includes(`tool:${w.appId}`))
                .map(w => {
                  const resolved = resolveIconItem(`tool:${w.appId}`);
                  return resolved ? { ...resolved, isMinimized: w.isMinimized } : null;
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);

              const runningSystems = virtualWindows
                .filter(w => w.type === "system" && !pinnedKeys.includes(`system:${w.appId}`))
                .map(w => {
                  const resolved = resolveIconItem(`system:${w.appId}`);
                  return resolved ? { ...resolved, isMinimized: w.isMinimized } : null;
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
                      <Tooltip.Root key={item.id}>
                        <Tooltip.Trigger asChild>
                          <button
                            onClick={() => openApp(item.type, item.appId)}
                            onContextMenu={(e) => handleTaskbarContextMenu(e, item, false)}
                            className="relative w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition group animate-in zoom-in-95 duration-200 cursor-pointer"
                          >
                            <div className="w-7 h-7 flex items-center justify-center pointer-events-none">
                              {item.logo ? (
                                <img src={item.logo} alt={item.name} className="h-full object-contain max-w-full" />
                              ) : (
                                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                                  <Icon className="w-4 h-4 text-white" />
                                </div>
                              )}
                            </div>
                            <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all pointer-events-none ${item.isMinimized ? "w-1 bg-white/40" : "w-5 bg-accent"}`} />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                            {item.name}
                            <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    );
                  })}
                </>
              );
            })()}

            <div className="w-px h-8 bg-white/15 mx-1" />

            {/* System tray */}
            <div className="flex items-center gap-2 px-3 text-white/80">
              {taskbarShowWifi && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button 
                      onClick={() => setShowQuickSettings(prev => !prev)}
                      className="hover:scale-105 transition cursor-pointer flex items-center justify-center p-1 rounded hover:bg-white/10"
                    >
                      <Wifi className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                      {isOnline ? "Rede: Conectado" : "Rede: Desconectado"}
                      <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}

              {taskbarShowVolume && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button 
                      onClick={() => setShowQuickSettings(prev => !prev)}
                      className="hover:scale-105 transition cursor-pointer flex items-center justify-center p-1 rounded hover:bg-white/10"
                    >
                      <Volume2 className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                      {`Volume: ${volume}%`}
                      <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}

              {batteryState?.hasBattery && taskbarShowBattery && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button 
                      onClick={() => setShowQuickSettings(prev => !prev)}
                      className="hover:scale-105 transition cursor-pointer flex items-center justify-center p-1 rounded hover:bg-white/10"
                    >
                      <Battery className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                      {`Bateria: ${batteryState.level}% (${batteryState.charging ? 'Carregando' : 'Descarregando'})`}
                      <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}

              {showFps && (
                <span className="text-[10px] font-sans text-white/50 tracking-wide select-none ml-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 shrink-0">
                  FPS <span className="font-bold">{fps}</span>
                </span>
              )}

              {taskbarShowControllers && controllers.map((c, idx) => (
                <Tooltip.Root key={c.guid + idx}>
                  <Tooltip.Trigger asChild>
                    <span className="flex items-center cursor-help bg-white/5 border border-white/5 rounded px-1.5 py-0.5 select-none shrink-0 gap-1 text-[9px] hover:border-accent/40 transition">
                      <Gamepad2 className="w-3.5 h-3.5 text-accent animate-pulse" />
                      <span className="font-bold text-accent">P{c.playerIndex + 1}</span>
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                      {`${c.name} (Jogador ${c.playerIndex + 1})`}
                      <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ))}

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  {(() => {
                    let formattedTime = "";
                    let formattedDate = "";
                    if (taskbarClockFormat === "24h") {
                      formattedTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
                    } else if (taskbarClockFormat === "24h_sec") {
                      formattedTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
                    } else if (taskbarClockFormat === "12h") {
                      formattedTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: true });
                    } else if (taskbarClockFormat === "12h_sec") {
                      formattedTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
                    } else if (taskbarClockFormat === "full_24h") {
                      formattedDate = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " - ";
                      formattedTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
                    } else {
                      return (
                        <div className="text-xs leading-tight ml-1 flex text-right gap-1 pl-3 cursor-help">
                          <span className="font-semibold text-white capitalize">{now.toLocaleDateString("pt-BR", { month: "short" })}</span>
                          <span className="font-semibold text-white">{now.toLocaleDateString("pt-BR", { day: "2-digit" })}</span>
                          <span className="font-semibold text-white">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      );
                    }

                    return (
                      <div className="text-xs leading-tight ml-1 flex items-center text-right gap-1 pl-3 cursor-help font-mono font-semibold text-white">
                        {formattedDate && <span className="opacity-80">{formattedDate}</span>}
                        <span>{formattedTime}</span>
                      </div>
                    );
                  })()}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                    {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    <Tooltip.Arrow className="tooltip-arrow" width={10} height={5} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>

          </div>
        </div>
      </Tooltip.Provider>
    );
  })()}
      {/* Premium Full-screen Game Loading Backdrop */}
      {isLaunching && launchingGame && (
        <div className="absolute inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300">
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
      {/* Emulator Installer / Updater Modal */}
      {installerOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/65 backdrop-blur-md flex items-center justify-center select-none">
          <div 
            className="glass-strong rounded-3xl p-7 max-w-sm w-full mx-4 shadow-2xl border border-white/10 flex flex-col items-center select-none text-center animate-in zoom-in-95 duration-200"
          >
            {installerStatus === 'prompt' && (
              <>
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'var(--accent-color-light)' }}
                >
                  <Download className="w-6 h-6" style={{ color: 'var(--accent-color)' }} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-wide">
                  {isUpdatePrompt ? 'Atualização Disponível' : 'Emulador Não Encontrado'}
                </h3>
                <p className="text-xs text-white/60 mb-6 leading-relaxed">
                  {isUpdatePrompt 
                    ? `Uma nova versão do emulador ${installerEmulator.toUpperCase()} está disponível. Deseja atualizar agora?`
                    : `O emulador ${installerEmulator.toUpperCase()} é necessário para rodar este jogo, mas não está instalado. Deseja realizar a instalação automática?`
                  }
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => {
                      setInstallerOpen(false);
                      if (isUpdatePrompt && installerGame && installerSystem) {
                        launchDirectly(installerGame, installerSystem);
                      }
                    }}
                    className="flex-1 py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-xs transition cursor-pointer"
                  >
                    {isUpdatePrompt ? 'Pular e Jogar' : 'Cancelar'}
                  </button>
                  <button
                    onClick={handleStartInstall}
                    className="flex-1 py-2 px-4 rounded-xl text-white font-medium text-xs shadow-lg transition cursor-pointer hover:brightness-95"
                    style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-color-hover))' }}
                  >
                    {isUpdatePrompt ? 'Atualizar' : 'Baixar e Instalar'}
                  </button>
                </div>
              </>
            )}

            {(installerStatus === 'downloading' || installerStatus === 'extracting') && (
              <>
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-4 animate-bounce"
                  style={{ backgroundColor: 'var(--accent-color-light)' }}
                >
                  <Download className="w-6 h-6" style={{ color: 'var(--accent-color)' }} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-wide">
                  {installerStatus === 'downloading' ? 'Baixando Emulador' : 'Instalando Emulador'}
                </h3>
                <p className="text-xs text-white/60 mb-6 leading-relaxed">
                  {installerStatus === 'downloading' 
                    ? `Fazendo o download dos arquivos do ${installerEmulator.toUpperCase()}...`
                    : `Extraindo e configurando o ${installerEmulator.toUpperCase()} no sistema...`
                  }
                </p>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mb-2 relative">
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${installerStatus === 'downloading' ? installerProgress : 100}%`,
                      backgroundColor: 'var(--accent-color)'
                    }}
                  />
                </div>
                <span 
                  className="text-[10px] font-bold font-mono"
                  style={{ color: 'var(--accent-color)' }}
                >
                  {installerStatus === 'downloading' ? `${installerProgress}%` : 'Extraindo...'}
                </span>
              </>
            )}

            {installerStatus === 'completed' && (
              <>
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6 text-green-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-wide">Instalação Concluída!</h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  O emulador foi configurado com sucesso. O jogo iniciará em instantes...
                </p>
              </>
            )}

            {installerStatus === 'error' && (
              <>
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 tracking-wide">Falha na Instalação</h3>
                <p className="text-xs text-white/65 mb-6 leading-relaxed break-words max-w-full">
                  {installerError || 'Ocorreu um erro inesperado durante o download ou extração.'}
                </p>
                <button
                  onClick={() => setInstallerOpen(false)}
                  className="w-full py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-xs transition cursor-pointer"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal to Exit the System */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[9999] bg-black/65 backdrop-blur-md flex items-center justify-center select-none" onClick={() => setShowExitConfirm(false)}>
          <div 
            className="glass-strong rounded-3xl p-7 max-w-sm w-full mx-4 shadow-2xl border border-white/10 flex flex-col items-center select-none text-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <Power className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 tracking-wide">Sair do RIESCADE OS</h3>
            <p className="text-xs text-white/60 mb-6 leading-relaxed">
              Deseja realmente sair do RIESCADE OS?
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-xs transition cursor-pointer"
              >
                Não
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  window.api.executeCommand("exit-frontend");
                }}
                className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium text-xs shadow-lg transition cursor-pointer"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Version Info bottom right */}
      <div className="absolute bottom-2 right-2 z-30 pointer-events-none select-none text-right">
        <span className="text-[10px] font-bold tracking-widest text-white/35 font-mono drop-shadow-sm">
          RIESCADE OS {appVersion}
        </span>
      </div>
      </div>
      </div>
      {showQuickSettings && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setShowQuickSettings(false)} />
          <div className="fixed bottom-16 right-4 z-[85] glass-strong rounded-2xl border border-white/10 p-4 w-72 shadow-2xl animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider">Painel de Controle</span>
              <button onClick={() => setShowQuickSettings(false)} className="text-white/60 hover:text-white transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Network status */}
              <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-2.5 rounded-xl">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  <Wifi className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-white">{isOnline ? "Conectado" : "Desconectado"}</span>
                  <span className="text-[10px] text-white/40">{isOnline ? "Rede Wi-Fi ativa" : "Sem acesso à internet"}</span>
                </div>
              </div>

              {/* Battery status (if detected) */}
              {batteryState?.hasBattery && (
                <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-2.5 rounded-xl">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${batteryState.charging ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    <Battery className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-white">{batteryState.level}%</span>
                    <span className="text-[10px] text-white/40">{batteryState.charging ? "Carregando" : "Na bateria"}</span>
                  </div>
                </div>
              )}

              {/* Volume status */}
              <div className="flex flex-col gap-2 bg-white/5 border border-white/5 p-3 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white/60">Volume</span>
                  <span className="text-[11px] font-bold text-accent">{volume}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-white/55 animate-pulse" />
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                    className="flex-1 accent-range cursor-pointer h-1 rounded-lg bg-white/10 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {taskbarContextMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setTaskbarContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setTaskbarContextMenu(null); }} />
          <div 
            className="fixed z-[10000] bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1.5 min-w-[220px] animate-in zoom-in-95 duration-100"
            style={{ 
              bottom: `${window.innerHeight - taskbarContextMenu.y + 10}px`,
              left: `${Math.min(taskbarContextMenu.x, window.innerWidth - 240)}px`
            }}
          >
            <button
              onClick={handleTogglePin}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
            >
              <MoreHorizontal className="w-4 h-4 text-accent" />
              <span>{taskbarContextMenu.isPinned ? "Desafixar da Barra de tarefas" : "Fixar na barra de tarefas"}</span>
            </button>
            {virtualWindows.some(w => w.appId === taskbarContextMenu.item.appId && w.type === taskbarContextMenu.item.type) && (
              <button
                onClick={handleCloseWindow}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-red-500/20 text-left transition cursor-pointer text-red-400 hover:text-red-300"
              >
                <X className="w-4 h-4" />
                <span>Fechar janela</span>
              </button>
            )}
          </div>
        </>
      )}

      <audio ref={bgAudioRef} onEnded={handleMusicEnded} className="hidden" />
      {renderToasts()}
      <Toast.Viewport className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 w-80 max-w-full m-0 list-none outline-none items-center" />
    </Toast.Provider>
  );
}
