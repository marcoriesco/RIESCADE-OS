import React, { useState, useEffect } from "react";
import { ChevronRight, Search, Folder, Star, User, Shield, Settings, Palette, Gamepad2, Volume2, Cpu, Info, Database, Trash2, Edit3, X, ChevronLeft, Filter, HardDrive, RefreshCw, Eye, EyeOff, Check, ChevronDown, Save, Trophy, Loader2, Sliders, CheckCircle, Circle } from "lucide-react";
import { System, SettingsCtx } from "../types";
import { TOOL_APPS, getSystemTheme } from "../constants";
import {
  SettingGroup, SettingToggle, SettingSelect, SettingSlider, SettingInput, SettingInfo
} from "./SettingsComponents";
import { ScrollArea } from "./ScrollArea";
import * as Select from "@radix-ui/react-select";

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
  { id: "interface", name: "Interface", icon: Settings },
  { id: "personalizacao", name: "Personalização", icon: Palette },
  { id: "controles", name: "Controles", icon: Gamepad2 },
  { id: "audio", name: "Áudio", icon: Volume2 },
  { id: "scraper", name: "Scraper", icon: Cpu },
  { id: "avancado", name: "Avançado", icon: Cpu },
  { id: "sobre", name: "Sobre", icon: Info }
];

const EMULATOR_NAMES: Record<string, string> = {
  global: "Geral / Globais",
  retroarch: "RetroArch",
  ares: "Ares",
  xenia: "Xenia",
  pcsx2: "PCSX2",
  pcsx2x6: "PCSX2X6",
  teknoparrot: "TeknoParrot",
  mame64: "MAME64",
  dolphin: "Dolphin",
  ryujinx: "Ryujinx",
  rpcs3: "RPCS3",
  cemu: "Cemu",
  duckstation: "DuckStation",
  ppsspp: "PPSSPP",
  flycast: "Flycast",
  xemu: "Xemu",
  bigpemu: "BigPEmu",
  model2: "Model 2 Emulator",
  model3: "Supermodel (Model 3)",
  redream: "Redream",
  shadps4: "shadPS4",
  vita3k: "Vita3K"
};

const EMULATOR_DESCRIPTIONS: Record<string, string> = {
  global: "Configure opções gerais aplicadas a todos os emuladores.",
  retroarch: "Configurações globais de emulação, vídeo, shaders e mais.",
  ares: "Ajuste os parâmetros específicos do emulador Ares.",
  xenia: "Ajuste os parâmetros específicos do emulador Xenia e Xenia Canary.",
  pcsx2: "Ajuste os parâmetros específicos do emulador PCSX2.",
  pcsx2x6: "Ajuste os parâmetros específicos do emulador PCSX2X6.",
  teknoparrot: "Ajuste os parâmetros específicos do emulador TeknoParrot.",
  mame64: "Ajuste os parâmetros específicos do emulador MAME64.",
  dolphin: "Ajuste os parâmetros específicos do emulador Dolphin.",
  ryujinx: "Ajuste os parâmetros específicos do emulador Ryujinx.",
  rpcs3: "Ajuste os parâmetros específicos do emulador RPCS3.",
  cemu: "Ajuste os parâmetros específicos do emulador Cemu.",
  duckstation: "Ajuste os parâmetros específicos do emulador DuckStation.",
  ppsspp: "Ajuste os parâmetros específicos do emulador PPSSPP.",
  flycast: "Ajuste os parâmetros específicos do emulador Flycast.",
  xemu: "Ajuste os parâmetros específicos do emulador Xemu.",
  bigpemu: "Ajuste os parâmetros específicos do emulador BigPEmu.",
  model2: "Ajuste os parâmetros específicos do emulador Model 2.",
  model3: "Ajuste os parâmetros específicos do emulador Supermodel.",
  redream: "Ajuste os parâmetros específicos do emulador Redream.",
  shadps4: "Ajuste os parâmetros específicos do emulador shadPS4.",
  vita3k: "Ajuste os parâmetros específicos do emulador Vita3K."
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

  const [features, setFeatures] = useState<any>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Gamepad Control States
  const [controllers, setControllers] = useState<any[]>([]);
  const [selectedController, setSelectedController] = useState<any | null>(null);
  const [controllerConfigs, setControllerConfigs] = useState<Record<string, any>>({});
  const [gamepadState, setGamepadState] = useState<{ buttons: any[]; axes: number[] } | null>(null);
  const [scanningControllers, setScanningControllers] = useState(false);

  useEffect(() => {
    if (activeSettingsTab === "controles") {
      // 1. Initial load
      window.api.detectControllers().then((data: any[]) => {
        setControllers(data || []);
      });

      // 2. Load configurations
      window.api.getControllerConfigs().then((configs: any) => {
        setControllerConfigs(configs || {});
      });

      // 3. Listen to updates
      const unsubscribe = window.api.on('controllers-updated', (_, data: any[]) => {
        setControllers(data || []);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [activeSettingsTab]);

  useEffect(() => {
    if (!selectedController) {
      setGamepadState(null);
      return;
    }

    let animationId: number;

    const findAndPollGamepad = () => {
      const gps = navigator.getGamepads();
      let matchIdx: number | null = null;

      // 1. Match by exact or partial name
      for (let i = 0; i < gps.length; i++) {
        const gp = gps[i];
        if (gp && gp.id.toLowerCase().includes(selectedController.name.split('(')[0].trim().toLowerCase())) {
          matchIdx = i;
          break;
        }
      }

      // 2. Fallback to matching index
      if (matchIdx === null && selectedController.xinputIndex !== undefined) {
        if (gps[selectedController.xinputIndex]) {
          matchIdx = selectedController.xinputIndex;
        }
      }

      if (matchIdx !== null) {
        const gp = gps[matchIdx];
        if (gp) {
          setGamepadState({
            buttons: gp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
            axes: [...gp.axes]
          });
        }
      } else {
        setGamepadState(null);
      }

      animationId = requestAnimationFrame(findAndPollGamepad);
    };

    animationId = requestAnimationFrame(findAndPollGamepad);
    return () => cancelAnimationFrame(animationId);
  }, [selectedController]);

  useEffect(() => {
    window.api.getFeatures().then(res => {
      setFeatures(res);
    }).catch(err => {
      console.error("Failed to load features.json:", err);
    });
  }, []);

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
      const defaultValue = (name === "RIESCADE.ShowDesktopIcons" || name === "RIESCADE.DynamicBackground") ? "true" : "false";
      const v = getSetting(name, defaultValue);
      return v === "true" || v === "1";
    };

    const saveSetting = (name: string, value: any, type: "string" | "bool" | "int" | "float" = "string") => {
      if (onSaveSetting) onSaveSetting(name, value, type);
    };

    // Build settings context object to pass to stable module-level components
    const ctx: SettingsCtx = { getSetting, isBoolOn, saveSetting };

    // Build emulator settings context
    const getEmuSetting = (name: string, fallback: any = ""): string => {
      const val = emulatorSettings?.[activeEmuSubmenu]?.[name] ?? emulatorSettings?.[activeEmuSubmenu]?.[`${activeEmuSubmenu}_${name}`];
      console.log('[getEmuSetting] Emu:', activeEmuSubmenu, 'Key:', name, 'RawValue:', val, 'Type:', typeof val);
      if (val !== undefined && val !== null) return String(val);
      return String(fallback);
    };

    const isEmuBoolOn = (name: string) => {
      const v = getEmuSetting(name, "false");
      const res = v === "true" || v === "1";
      console.log('[isEmuBoolOn] Emu:', activeEmuSubmenu, 'Key:', name, 'Result:', res);
      return res;
    };

    const saveEmuSetting = (name: string, value: any, type: "string" | "bool" | "int" | "float" = "string") => {
      console.log('[saveEmuSetting] Toggle clicked. Emu:', activeEmuSubmenu, 'Name:', name, 'Value:', value, 'Type:', type);
      if (onSaveEmulatorSetting) {
        onSaveEmulatorSetting(activeEmuSubmenu, name, value);
      }
    };

    const emuCtx: SettingsCtx = {
      getSetting: getEmuSetting,
      isBoolOn: isEmuBoolOn,
      saveSetting: saveEmuSetting
    };

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

    const renderDynamicEmulatorSettings = () => {
      if (!features) {
        return (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <RefreshCw className="w-6 h-6 text-accent animate-spin" />
            <span className="text-xs text-white/40 font-medium">Carregando esquemas de configurações...</span>
          </div>
        );
      }

      const nameAliases: Record<string, string> = {
        "pcsx2x6": "pcsx2",
        "model2": "m2emulator",
        "model3": "supermodel"
      };

      const targetName = nameAliases[activeEmuSubmenu] || activeEmuSubmenu;
      const emuData = features.emulators?.find((e: any) => {
        if (!e.name) return false;
        const names = e.name.split(',').map((n: string) => n.trim().toLowerCase());
        const targetNames = targetName.split(',').map((n: string) => n.trim().toLowerCase());
        return names.some((n: string) => targetNames.includes(n));
      });

      if (!emuData) {
        return (
          <div className="text-sm text-white/40 text-center py-12">
            Nenhum esquema de configuração dinâmica encontrado para "{activeEmuSubmenu}".
          </div>
        );
      }

      let coreData = emuData;
      if (emuData.cores && emuData.cores.length > 0) {
        coreData = emuData.cores[0];
      }

      const rawShared = coreData.sharedFeatures || [];
      const rawFeatures = coreData.featuresList || [];

      const resolvedFeatures: any[] = [];

      // Resolve shared features
      rawShared.forEach((ref: any) => {
        const found = features.sharedFeatures?.featuresList?.find((f: any) => f.value === ref.value);
        if (found) {
          resolvedFeatures.push({
            ...found,
            group: ref.group || found.group || "Geral",
            submenu: ref.submenu || found.submenu || "",
            order: ref.order !== undefined ? ref.order : (found.order || 999)
          });
        }
      });

      // Add custom features
      rawFeatures.forEach((f: any) => {
        resolvedFeatures.push({
          ...f,
          group: f.group || "Geral",
          submenu: f.submenu || "",
          order: f.order !== undefined ? f.order : 999
        });
      });

      // Remove duplicates
      const uniqueFeaturesMap = new Map<string, any>();
      resolvedFeatures.forEach(f => {
        uniqueFeaturesMap.set(f.value, f);
      });
      const finalFeatures = Array.from(uniqueFeaturesMap.values());

      // Sort by order
      finalFeatures.sort((a, b) => (a.order || 999) - (b.order || 999));

      // Group by group
      const groups: Record<string, any[]> = {};
      finalFeatures.forEach(f => {
        const gName = f.group || "Configurações";
        if (!groups[gName]) {
          groups[gName] = [];
        }
        groups[gName].push(f);
      });

      return (
        <div className="space-y-6 animate-in fade-in duration-150">
          {Object.entries(groups).map(([groupLabel, items]) => (
            <div key={groupLabel} className="space-y-2">
              <SettingGroup label={groupLabel} />
              {items.map((item: any) => {
                if (item.choices && item.choices.length > 0) {
                  const options = item.choices.map((c: any) => ({
                    label: String(c.name),
                    value: String(c.value)
                  }));
                  return (
                    <SettingSelect
                      key={item.value}
                      label={item.name}
                      name={item.value}
                      desc={item.description}
                      options={options}
                      ctx={emuCtx}
                    />
                  );
                } else if (item.preset === "slider" || item.preset === "sliderauto") {
                  return (
                    <SettingSlider
                      key={item.value}
                      label={item.name}
                      name={item.value}
                      desc={item.description}
                      min={item.min !== undefined ? item.min : 0}
                      max={item.max !== undefined ? item.max : 100}
                      step={item.step !== undefined ? item.step : 1}
                      ctx={emuCtx}
                    />
                  );
                } else {
                  return (
                    <SettingToggle
                      key={item.value}
                      label={item.name}
                      name={item.value}
                      desc={item.description}
                      ctx={emuCtx}
                    />
                  );
                }
              })}
            </div>
          ))}
        </div>
      );
    };

    // --- Settings tabs definition ---
    const settingsTabs = SETTINGS_TABS;

    return (
      <div className="flex h-full text-white">
        {/* Discord-like Sidebar - extends to top, merges with titlebar */}
        <aside className="w-[240px] bg-black/40 border-r border-white/5 flex flex-col shrink-0 select-none">
          {/* Branding Section - top padding accounts for drag region */}
          <div className="pt-8 px-4 pb-3 shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent-color), rgb(79, 70, 229))' }}
              >
                R
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white tracking-wide">RIESCADE OS</span>
                <span className="text-[10px] text-white/40 font-medium">v2.0.0-Beta</span>
              </div>
            </div>
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 group-focus-within:text-accent transition duration-200" />
              <input 
                placeholder="Buscar configurações..."
                className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent hover:border-accent focus:bg-white/[0.07] transition duration-200"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-[10px] font-bold uppercase text-white/25 tracking-widest px-3.5 py-2 mt-1">Configurações</div>
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
                      className={`cursor-pointer font-medium w-full text-left px-3.5 py-2.5 rounded-md text-xs flex items-center justify-between transition ${
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
                        {Object.entries(EMULATOR_NAMES).map(([emuKey, emuName]) => (
                          <button
                            key={emuKey}
                            onClick={() => {
                              setActiveSettingsTab("emuladores");
                              setActiveEmuSubmenu(emuKey);
                            }}
                            className={`cursor-pointer w-full text-left py-1.5 px-2 rounded-md text-[11px] font-medium transition ${
                              activeSettingsTab === "emuladores" && activeEmuSubmenu === emuKey
                                ? "text-accent font-bold bg-white/[0.04]"
                                : "text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
                            }`}
                          >
                            {emuName}
                          </button>
                        ))}
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
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-color))' }}
              >
                RC
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white/90 truncate">RIESCADE Player</span>
                <span className="text-[10px] text-white/35">Online</span>
              </div>
            </div>
          </div>
        </aside>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-black/10">

          {/* ===== TAB: CONTA (Account - Static) ===== */}
          {activeSettingsTab === "conta" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-8 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Minha Conta</h2>
                <p className="text-sm text-white/40">Gerencie suas informações pessoais e configurações de conta.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px]">
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
              <div className="shrink-0 px-6 pt-8 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Interface</h2>
                <p className="text-sm text-white/40">Aparência, ícones do desktop/taskbar, tema e idioma.</p>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-2">
                  <SettingGroup label="Ícones do Desktop e Taskbar" />

                  {/* Search & Category Filter */}
                  <div className="flex items-center gap-3 mb-4 select-none">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 group-focus-within:text-accent transition duration-200" />
                      <input 
                        value={settingsSearch} 
                        onChange={(e) => setSettingsSearch(e.target.value)} 
                        placeholder="Pesquisar ferramentas ou sistemas..."
                        className="w-full bg-[#121212] border border-white/10 rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent hover:border-accent transition duration-200" 
                      />
                    </div>
                    <div className="flex bg-black/25 p-1 rounded-md border border-white/5 text-[10px] items-center shrink-0">
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
                            <span className="text-[10px] text-white/50 font-medium">Desktop</span>
                            <input 
                              type="checkbox" 
                              checked={isDesk}
                              onChange={e => { e.stopPropagation(); handleToggleDesktop(item.key); }}
                              className="w-4 h-4 cursor-pointer accent-range" 
                            />
                          </label>
                          <div className="w-px h-6 bg-white/10" />
                          <label className="flex items-center gap-2 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                            <span className="text-[10px] text-white/50 font-medium">Taskbar</span>
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
              <div className="shrink-0 px-6 pt-8 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Personalização</h2>
                <p className="text-sm text-white/40">Escolha a cor de destaque para os menus, botões e barras do sistema.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-2">
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
                            <span className="text-[10px] text-white/60 font-medium text-center truncate w-full">{preset.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="h-px bg-white/5 my-1" />

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-xs text-white/90">Cor Customizada</span>
                        <span className="text-[10px] text-white/40">Defina uma cor hexadecimal personalizada para a interface.</span>
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

                  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs hover:bg-white/5 transition">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
                      <span className="font-medium text-white/90">Background Personalizado</span>
                      <span className="text-[10px] text-white/45 leading-relaxed font-sans">
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
                            console.log('[Personalização] Clear background button clicked');
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
                          console.log('[Personalização] Browse background button clicked');
                          window.api.selectBgImage().then((filePath) => {
                            console.log('[Personalização] selectBgImage returned path:', filePath);
                            if (filePath) {
                              ctx.saveSetting("RIESCADE.CustomBackground", filePath, "string");
                            }
                          }).catch((err) => {
                            console.error('[Personalização] selectBgImage error:', err);
                          });
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

                  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs hover:bg-white/5 transition">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
                      <span className="font-medium text-white/90">Vídeo de Fundo Personalizado</span>
                      <span className="text-[10px] text-white/45 leading-relaxed font-sans">
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
                            console.log('[Personalização] Clear background video button clicked');
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
                          console.log('[Personalização] Browse background video button clicked');
                          window.api.selectBgVideo().then((filePath) => {
                            console.log('[Personalização] selectBgVideo returned path:', filePath);
                            if (filePath) {
                              ctx.saveSetting("RIESCADE.BackgroundVideoPath", filePath, "string");
                            }
                          }).catch((err) => {
                            console.error('[Personalização] selectBgVideo error:', err);
                          });
                        }}
                        className="px-3 py-1.5 rounded-md bg-white/10 border border-white/10 hover:bg-white/15 hover:border-white/20 text-white font-semibold transition cursor-pointer"
                      >
                        Procurar...
                      </button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: CONTROLES ===== */}
          {activeSettingsTab === "controles" && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[740px] flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Controles</h2>
                  <p className="text-sm text-white/40">Configuração nativa de gamepads, slots de jogadores e calibração.</p>
                </div>
                <button
                  type="button"
                  disabled={scanningControllers}
                  onClick={async () => {
                    setScanningControllers(true);
                    const list = await window.api.detectControllers();
                    setControllers(list || []);
                    setScanningControllers(false);
                    window.dispatchEvent(
                      new CustomEvent("show-toast", {
                        detail: {
                          title: "Busca de Controles",
                          description: `Detecção concluída. ${list.length} controle(s) encontrados.`,
                          type: "controller"
                        }
                      })
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-accent text-white/80 hover:text-white transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanningControllers ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-semibold">Buscar</span>
                </button>
              </div>

              {/* Grid content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-6">
                  {/* Connected Controllers List */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white/60">Controles Conectados</h3>
                    {controllers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 bg-white/2 border border-dashed border-white/10 rounded-xl text-center">
                        <Gamepad2 className="w-8 h-8 text-white/10 mb-2 animate-pulse" />
                        <p className="text-xs text-white/40">Nenhum controle detectado automaticamente no momento.</p>
                        <p className="text-[10px] text-white/20 mt-1">Conecte um controle USB/Bluetooth ou clique em "Buscar" acima.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {controllers.map((c, idx) => {
                          const isSelected = selectedController?.guid === c.guid;
                          return (
                            <div
                              key={c.guid + idx}
                              onClick={() => setSelectedController(c)}
                              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-28 select-none ${
                                isSelected
                                  ? "bg-accent/10 border-accent shadow-lg shadow-accent/5"
                                  : "bg-white/5 border-white/5 hover:bg-white/8 hover:border-white/10"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/60'}`}>
                                    <Gamepad2 className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-white truncate max-w-[150px]">{c.name}</h4>
                                    <p className="text-[9px] text-white/30 truncate max-w-[130px] font-mono">{c.guid.substring(0, 16)}...</p>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span className={`px-2 py-0.5 text-[8px] font-bold rounded-full ${c.type === 'xinput' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {c.type === 'xinput' ? 'XInput' : 'DirectInput'}
                                  </span>
                                  {c.isVirtual && (
                                    <span className="px-2 py-0.5 text-[8px] font-bold bg-amber-500/20 text-amber-400 rounded-full">
                                      Virtual ({c.virtualSource || 'Desconhecido'})
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-t border-white/5 pt-2">
                                <span className="text-[9px] text-white/40 font-semibold">
                                  Configurado para:
                                </span>
                                <span className="text-xs font-bold text-accent">
                                  Jogador {c.playerIndex + 1} (P{c.playerIndex + 1})
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Controller Customizations & Visual Test */}
                  {selectedController && (() => {
                    const config = controllerConfigs[selectedController.guid] || {};
                    const leftStickX = gamepadState?.axes[0] ?? 0;
                    const leftStickY = gamepadState?.axes[1] ?? 0;
                    const rightStickX = gamepadState?.axes[2] ?? 0;
                    const rightStickY = gamepadState?.axes[3] ?? 0;

                    return (
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <Sliders className="w-3.5 h-3.5 text-accent" />
                          <h3 className="text-xs font-bold text-white/80">Configurações: {selectedController.name}</h3>
                        </div>

                        <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4">
                          {/* Slot Preference */}
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-white">Preferência de Jogador</h4>
                              <p className="text-[10px] text-white/40">Selecione o slot preferido deste controle.</p>
                            </div>
                            <RadixSelect
                              value={String(config.preferredPlayer || "auto")}
                              onValueChange={(val) => {
                                const newConfig = {
                                  ...config,
                                  preferredPlayer: val === "auto" ? undefined : parseInt(val, 10)
                                };
                                window.api.saveControllerConfig(selectedController.guid, newConfig);
                                setControllerConfigs(prev => ({
                                  ...prev,
                                  [selectedController.guid]: newConfig
                                }));
                              }}
                              options={[
                                { label: "Automático", value: "auto" },
                                { label: "Jogador 1 (P1)", value: "1" },
                                { label: "Jogador 2 (P2)", value: "2" },
                                { label: "Jogador 3 (P3)", value: "3" },
                                { label: "Jogador 4 (P4)", value: "4" }
                              ]}
                            />
                          </div>

                          {/* Deadzone Slider */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="text-xs font-bold text-white">Deadzone do Analógico</h4>
                                <p className="text-[10px] text-white/40">Regula a sensibilidade física de ponto morto dos sticks.</p>
                              </div>
                              <span className="text-xs font-bold text-accent">
                                {Math.round((config.deadzone ?? 0.15) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              step="1"
                              value={Math.round((config.deadzone ?? 0.15) * 100)}
                              onChange={(e) => {
                                const newConfig = {
                                  ...config,
                                  deadzone: parseFloat(e.target.value) / 100
                                };
                                window.api.saveControllerConfig(selectedController.guid, newConfig);
                                setControllerConfigs(prev => ({
                                  ...prev,
                                  [selectedController.guid]: newConfig
                                }));
                              }}
                              className="w-full h-1 bg-[#121620] accent-accent rounded-lg cursor-pointer hover:accent-accent/80 transition"
                            />
                          </div>

                          {/* Invert Axis Y toggles */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-white">Inverter Eixo Y Esquerdo</h4>
                                <p className="text-[10px] text-white/40">Inverte a direção para cima/baixo.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newConfig = {
                                    ...config,
                                    invertLeftY: !config.invertLeftY
                                  };
                                  window.api.saveControllerConfig(selectedController.guid, newConfig);
                                  setControllerConfigs(prev => ({
                                    ...prev,
                                    [selectedController.guid]: newConfig
                                  }));
                                }}
                                className={`w-8 h-5 rounded-full p-0.5 transition cursor-pointer flex items-center ${config.invertLeftY ? 'bg-accent justify-end' : 'bg-white/10 justify-start'}`}
                              >
                                <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-white">Inverter Eixo Y Direito</h4>
                                <p className="text-[10px] text-white/40">Inverte o stick analógico da câmera.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newConfig = {
                                    ...config,
                                    invertRightY: !config.invertRightY
                                  };
                                  window.api.saveControllerConfig(selectedController.guid, newConfig);
                                  setControllerConfigs(prev => ({
                                    ...prev,
                                    [selectedController.guid]: newConfig
                                  }));
                                }}
                                className={`w-8 h-5 rounded-full p-0.5 transition cursor-pointer flex items-center ${config.invertRightY ? 'bg-accent justify-end' : 'bg-white/10 justify-start'}`}
                              >
                                <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Visual Test */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-white/60">Teste de Hardware em Tempo Real</h4>
                          <div className="p-4 bg-white/2 border border-white/5 rounded-xl flex flex-col md:flex-row items-center justify-around gap-6">
                            
                            {/* Visual sticks */}
                            <div className="flex gap-8">
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="text-[9px] font-semibold text-white/30">Stick Esquerdo</span>
                                <div className="relative w-20 h-20 rounded-full bg-[#121620] border border-white/10 flex items-center justify-center">
                                  <div className="absolute w-px h-full bg-white/5" />
                                  <div className="absolute h-px w-full bg-white/5" />
                                  <div 
                                    className="absolute w-3.5 h-3.5 rounded-full bg-accent shadow-lg shadow-accent/50 transition-all duration-75"
                                    style={{
                                      transform: `translate(${leftStickX * 30}px, ${leftStickY * 30}px)`
                                    }}
                                  />
                                </div>
                                <span className="text-[8px] font-mono text-white/40">X: {leftStickX.toFixed(2)} Y: {leftStickY.toFixed(2)}</span>
                              </div>

                              <div className="flex flex-col items-center gap-1.5">
                                <span className="text-[9px] font-semibold text-white/30">Stick Direito</span>
                                <div className="relative w-20 h-20 rounded-full bg-[#121620] border border-white/10 flex items-center justify-center">
                                  <div className="absolute w-px h-full bg-white/5" />
                                  <div className="absolute h-px w-full bg-white/5" />
                                  <div 
                                    className="absolute w-3.5 h-3.5 rounded-full bg-accent shadow-lg shadow-accent/50 transition-all duration-75"
                                    style={{
                                      transform: `translate(${rightStickX * 30}px, ${rightStickY * 30}px)`
                                    }}
                                  />
                                </div>
                                <span className="text-[8px] font-mono text-white/40">X: {rightStickX.toFixed(2)} Y: {rightStickY.toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Buttons indicator */}
                            <div className="flex-1 min-w-0 space-y-2">
                              {gamepadState ? (
                                <>
                                  <span className="text-[9px] font-semibold text-white/30 block mb-1">Botões Detectados</span>
                                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                                    {gamepadState.buttons.map((b, btnIdx) => (
                                      <span
                                        key={btnIdx}
                                        className={`px-1.5 py-0.5 text-[8px] font-bold rounded font-mono transition-all ${
                                          b.pressed 
                                            ? 'bg-accent text-white scale-105 shadow-md shadow-accent/20' 
                                            : 'bg-white/5 text-white/30 border border-white/5'
                                        }`}
                                      >
                                        B{btnIdx}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-col items-center justify-center p-4 border border-dashed border-white/10 rounded-lg text-center h-20 bg-black/10 flex-1">
                                  <Info className="w-3.5 h-3.5 text-white/20 mb-1" />
                                  <p className="text-[9px] text-white/40">Pressione um botão no controle para ativar o teste visual.</p>
                                </div>
                              )}
                            </div>

                          </div>
                        </div>

                      </div>
                    );
                  })()}

                  {/* Global settings */}
                  <div className="space-y-3 pt-2 border-t border-white/5">
                    <h3 className="text-sm font-semibold text-white/60">Configurações Globais</h3>
                    <SettingToggle label="Mostrar Notificações de Controle" name="ShowControllerNotifications" ctx={ctx} />
                    <SettingToggle label="Mostrar Atividade do Controle" name="ShowControllerActivity" ctx={ctx} />
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: ÁUDIO ===== */}
          {activeSettingsTab === "audio" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Áudio</h2>
                <p className="text-sm text-white/40">Volume, música de fundo e sons de navegação.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-2">
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


                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: SCRAPER ===== */}
          {activeSettingsTab === "scraper" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Configurações de Scraper</h2>
                <p className="text-sm text-white/40">Download de Fanarts, capas, logos, manuais e vídeos.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-2">
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
                  <SettingToggle label="Capa Padrão (Cover - Sempre 2D)" name="ScrapperDownloadCover" ctx={ctx} />
                  <SettingToggle label="Capa 2D" name="ScrapperDownloadCover2D" ctx={ctx} />
                  <SettingToggle label="Capa 3D" name="ScrapperDownloadCover3D" ctx={ctx} />
                  <SettingToggle label="Verso da Capa (Cover Back)" name="ScrapperDownloadCoverBack" ctx={ctx} />
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
          {activeSettingsTab === "emuladores" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-8 pb-4 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">
                  Configurações dos Emuladores - {EMULATOR_NAMES[activeEmuSubmenu] || (activeEmuSubmenu.charAt(0).toUpperCase() + activeEmuSubmenu.slice(1))}
                </h2>
                <p className="text-sm text-white/40">
                  {EMULATOR_DESCRIPTIONS[activeEmuSubmenu] || `Ajuste os parâmetros específicos do emulador ${EMULATOR_NAMES[activeEmuSubmenu] || activeEmuSubmenu}.`}
                </p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px]">
                  {renderDynamicEmulatorSettings()}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: AVANÇADO ===== */}
          {activeSettingsTab === "avancado" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Configurações Avançadas</h2>
                <p className="text-sm text-white/40">Drivers, latência, opções de desenvolvedor e otimizações.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-2">


                  <SettingGroup label="Opções de Desenvolvedor" />
                  <SettingSelect 
                    label="Aceleração Gráfica do Frontend" 
                    name="RIESCADE.GpuDriver" 
                    defaultValue="default" 
                    desc="Define a API gráfica para aceleração de vídeo da interface do RIESCADE (necessita reiniciar o app)." 
                    options={[
                      { label: "Padrão (Direct3D 11)", value: "default" },
                      { label: "Direct3D 12", value: "d3d12" },
                      { label: "OpenGL", value: "opengl" },
                      { label: "Vulkan", value: "vulkan" },
                      { label: "Desativado (Software)", value: "software" }
                    ]} 
                    ctx={ctx} 
                  />
                  <SettingSlider label="Limite de VRAM" name="MaxVRAM" min={40} max={1000} step={10} suffix=" Mb" ctx={ctx} />
                  <SettingToggle label="Exibir FPS" name="DrawFramerate" ctx={ctx} />
                  <SettingToggle label="V-Sync do Frontend" name="VSync" ctx={ctx} />
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
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[740px]">
                <h2 className="text-xl font-bold text-white mb-1">Sobre o Sistema</h2>
                <p className="text-sm text-white/40">Informações do RIESCADE OS e hardware.</p>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[740px] space-y-2">
                  <SettingGroup label="Sistema" />
                  <SettingInfo label="Versão" value="RIESCADE OS v2.0.0-Beta" />
                  <SettingInfo label="Motor" value="Electron + React + Vite" />
                  <SettingInfo label="Idioma" value={getSetting("Language", "pt_BR")} />
                  <SettingInfo label="Tema Ativo" value={getSetting("RIESCADE.ThemeSet", "default")} />



                  <div className="bg-black/15 border border-white/5 rounded-md px-4 py-3.5 text-xs hover:bg-white/[0.03] transition duration-200 space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-white/90">Verificar Atualizações</span>
                        <span className="text-[10px] text-white/40 font-sans">
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
                        <div className="font-semibold text-[10px] text-white/60 uppercase tracking-wider">Notas de Lançamento:</div>
                        <pre className="text-[10px] text-white/50 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto pr-1">
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
              <div className="text-[10px] text-white/40">Desbloqueado há {i + 1} dias atrás</div>
            </div>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
        ))}
        </div>
      </ScrollArea>
    );
  }

  if (appId === "database") {
    const [tab, setTab] = useState<"games" | "systems" | "stats">("games");
    
    // Games Table states
    const [dbGames, setDbGames] = useState<any[]>([]);
    const [dbTotalGames, setDbTotalGames] = useState(0);
    const [dbPages, setDbPages] = useState(1);
    const [dbPage, setDbPage] = useState(1);
    const [dbSearch, setDbSearch] = useState("");
    const [dbSystemFilter, setDbSystemFilter] = useState("all");
    const [dbSortBy, setDbSortBy] = useState("name");
    const [dbSortDir, setDbSortDir] = useState("ASC");
    const [isLoadingGames, setIsLoadingGames] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // System Info state
    const [dbSystems, setDbSystems] = useState<any[]>([]);
    
    // Statistics state
    const [dbStats, setDbStats] = useState<any>(null);
    const [maintenanceMsg, setMaintenanceMsg] = useState("");
    const [isRebuilding, setIsRebuilding] = useState(false);
    
    // Edit Form state
    const [selectedGame, setSelectedGame] = useState<any | null>(null);
    const [editForm, setEditForm] = useState<any>(null);
    const [editTab, setEditTab] = useState<"basics" | "emulation" | "files" | "media">("basics");
    const [deleteConfirmGame, setDeleteConfirmGame] = useState<any | null>(null);
    const [deletePhysicalFile, setDeletePhysicalFile] = useState(false);

    // Fetch games function
    const fetchGames = () => {
      setIsLoadingGames(true);
      return window.api.dbGetGamesPaginated(dbSystemFilter, dbPage, 15, dbSearch, dbSortBy, dbSortDir)
        .then((res: any) => {
          setDbGames(res.games || []);
          setDbTotalGames(res.total || 0);
          setDbPages(res.pages || 1);
          setIsLoadingGames(false);
        })
        .catch(() => setIsLoadingGames(false));
    };

    // Fetch systems function
    const fetchSystems = () => {
      return window.api.dbGetSystemsInfo()
        .then((res: any) => setDbSystems(res || []));
    };

    // Fetch stats function
    const fetchStats = () => {
      return window.api.dbGetStats()
        .then((res: any) => setDbStats(res));
    };

    // Initial fetch at mount
    useEffect(() => {
      setIsInitialLoading(true);
      Promise.all([
        window.api.dbGetSystemsInfo().then((res: any) => setDbSystems(res || [])),
        window.api.dbGetGamesPaginated(dbSystemFilter, dbPage, 15, dbSearch, dbSortBy, dbSortDir).then((res: any) => {
          setDbGames(res.games || []);
          setDbTotalGames(res.total || 0);
          setDbPages(res.pages || 1);
        })
      ]).finally(() => {
        setIsInitialLoading(false);
      });
    }, []);

    // Subsequent loads (skip if initial loading is still active)
    useEffect(() => {
      if (isInitialLoading) return;
      if (tab === "games") {
        fetchGames();
      } else if (tab === "systems") {
        fetchSystems();
      } else if (tab === "stats") {
        fetchStats();
      }
    }, [tab, dbPage, dbSystemFilter, dbSortBy, dbSortDir]);

    // Handle search input enter or click
    const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setDbPage(1);
      fetchGames();
    };

    // Clear search
    const handleClearSearch = () => {
      setDbSearch("");
      setDbPage(1);
      window.api.dbGetGamesPaginated(dbSystemFilter, 1, 15, "", dbSortBy, dbSortDir)
        .then((res: any) => {
          setDbGames(res.games || []);
          setDbTotalGames(res.total || 0);
          setDbPages(res.pages || 1);
        });
    };

    // Open Edit panel
    const handleEditGame = (game: any) => {
      setSelectedGame(game);
      setEditForm({ ...game });
      setEditTab("basics");
    };

    // Save edited game
    const handleSaveGame = () => {
      if (!editForm) return;
      setIsSaving(true);
      window.api.dbUpdateGame(editForm)
        .then(() => {
          setSelectedGame(null);
          setEditForm(null);
          return Promise.all([fetchGames(), fetchStats()]);
        })
        .finally(() => {
          setIsSaving(false);
        });
    };

    // Delete game
    const handleDeleteGame = () => {
      if (!deleteConfirmGame) return;
      setIsDeleting(true);
      window.api.dbDeleteGames([{ system: deleteConfirmGame.system, path: deleteConfirmGame.path, deletePhysical: deletePhysicalFile }])
        .then(() => {
          setDeleteConfirmGame(null);
          setDeletePhysicalFile(false);
          return Promise.all([fetchGames(), fetchStats()]);
        })
        .finally(() => {
          setIsDeleting(false);
        });
    };

    // Vacuum operation
    const handleVacuum = () => {
      setMaintenanceMsg("Compactando banco de dados...");
      window.api.dbVacuum()
        .then(() => {
          setMaintenanceMsg("Banco de dados compactado com sucesso!");
          fetchStats();
          setTimeout(() => setMaintenanceMsg(""), 3000);
        })
        .catch((err: any) => setMaintenanceMsg(`Erro: ${err.message}`));
    };

    // Rebuild operation
    const handleRebuild = () => {
      setIsRebuilding(true);
      setMaintenanceMsg("Reconstruindo o banco de dados... Por favor, aguarde.");
      window.api.dbRebuild()
        .then(() => {
          setIsRebuilding(false);
          setMaintenanceMsg("Banco de dados reconstruído com sucesso!");
          fetchStats();
          fetchSystems();
          setTimeout(() => setMaintenanceMsg(""), 4000);
        })
        .catch((err: any) => {
          setIsRebuilding(false);
          setMaintenanceMsg(`Erro na reconstrução: ${err.message}`);
        });
    };

    return (
      <div className="flex h-full text-white bg-[#0e1118]/90 backdrop-blur-md">
        {/* Navigation Sidebar */}
        <aside className="w-[200px] bg-black/30 border-r border-white/5 flex flex-col shrink-0 select-none">
          <div className="p-5 border-b border-white/5">
            <div className="flex items-center gap-2 text-accent font-bold text-sm">
              <Database className="w-5 h-5" />
              <span>DB MANAGER</span>
            </div>
            <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">RIESCADE OS</div>
          </div>
          
          <nav className="p-3 flex-1 flex flex-col gap-1">
            <button
              onClick={() => { setTab("games"); setDbPage(1); }}
              className={`cursor-pointer font-medium w-full text-left px-3.5 py-2.5 rounded-md text-xs flex items-center gap-2.5 transition ${
                tab === "games" 
                  ? "bg-white/5" 
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Gamepad2 className={`w-4 h-4 ${tab === "games" && 'text-accent'}`} />
              <span>Jogos Catalogados</span>
            </button>
            <button
              onClick={() => setTab("systems")}
              className={`cursor-pointer font-medium w-full text-left px-3.5 py-2.5 rounded-md text-xs flex items-center gap-2.5 transition ${
                tab === "systems" 
                  ? "bg-white/5" 
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Folder className={`w-4 h-4 ${tab === "systems" && 'text-accent'}`} />
              <span>Sistemas Ativos</span>
            </button>
            <button
              onClick={() => setTab("stats")}
              className={`cursor-pointer font-medium w-full text-left px-3.5 py-2.5 rounded-md text-xs flex items-center gap-2.5 transition ${
                tab === "stats" 
                  ? "bg-white/5" 
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Cpu className={`w-4 h-4 ${tab === "stats" && 'text-accent'}`} />
              <span>Manutenção & Info</span>
            </button>
          </nav>
        </aside>

        {/* Main Panel */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {isInitialLoading && (
            <div className="absolute inset-0 bg-[#0e1118]/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <Database className="w-8 h-8 text-emerald-400 animate-pulse" />
                <div className="absolute inset-0 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
              </div>
              <div className="flex flex-col items-center gap-1 text-center select-none font-sans">
                <span className="font-bold text-sm text-white/90">Inicializando Gerenciador</span>
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-mono">Carregando Tabelas e Metadados...</span>
              </div>
            </div>
          )}
          
          {/* TAB: GAMES LIST */}
          {tab === "games" && (
            <div className="flex-1 flex flex-col overflow-hidden pt-10 p-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">Jogos Catalogados</h2>
                  <p className="text-[10px] text-white/40">Total: {dbTotalGames} jogos encontrados</p>
                </div>

                {/* Filters/Actions Bar */}
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 w-[280px] hover:border-accent focus-within:border-accent transition duration-200">
                  <Search className="w-3.5 h-3.5 text-white/40" />
                  <input
                    type="text"
                    value={dbSearch}
                    onChange={(e) => setDbSearch(e.target.value)}
                    placeholder="Buscar jogo..."
                    className="bg-transparent border-none text-xs focus:outline-none w-full text-white"
                  />
                  {dbSearch && (
                    <button type="button" onClick={handleClearSearch} className="text-white/40 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>
              </div>

              {/* Filter controls row */}
              <div className="flex items-center gap-3 mb-4 bg-white/[0.02] border border-white/5 rounded-md p-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-white/50 font-medium">Sistema:</span>
                  <RadixSelect
                    value={dbSystemFilter}
                    onValueChange={(val) => { setDbSystemFilter(val); setDbPage(1); }}
                    options={[
                      { label: "Todos os Sistemas", value: "all" },
                      ...dbSystems.map(s => ({ label: s.fullname || s.name, value: s.name }))
                    ]}
                  />
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-white/50 font-medium">Ordenar por:</span>
                  <RadixSelect
                    value={dbSortBy}
                    onValueChange={(val) => { setDbSortBy(val); setDbPage(1); }}
                    options={[
                      { label: "Nome", value: "name" },
                      { label: "Sistema", value: "system" },
                      { label: "Avaliação", value: "rating" },
                      { label: "Lançamento", value: "releasedate" },
                      { label: "Vezes Jogado", value: "playcount" },
                      { label: "Última Vez Jogado", value: "lastplayed" }
                    ]}
                  />
                  <button
                    onClick={() => { setDbSortDir(dbSortDir === "ASC" ? "DESC" : "ASC"); setDbPage(1); }}
                    className="bg-white/5 hover:bg-white/10 hover:border-accent border border-white/10 rounded-md px-2.5 py-1 text-accent transition duration-200 cursor-pointer"
                  >
                    {dbSortDir}
                  </button>
                </div>
              </div>

              {/* Grid / Table */}
              <div className="flex-1 overflow-y-auto border border-white/5 rounded-md bg-black/10">
                {isLoadingGames ? (
                  <div className="h-full flex items-center justify-center text-xs text-white/40 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                    <span>Carregando dados...</span>
                  </div>
                ) : dbGames.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-white/30">
                    Nenhum jogo encontrado para estes filtros.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-white/5 text-white/50 border-b border-white/5 font-semibold">
                        <th className="p-3">Nome</th>
                        <th className="p-3 w-[120px]">Sistema</th>
                        <th className="p-3 w-[150px]">Gênero</th>
                        <th className="p-3 w-[80px] text-center">Favorito</th>
                        <th className="p-3 w-[80px] text-center">Visível</th>
                        <th className="p-3 w-[100px] text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbGames.map(game => (
                        <tr key={`${game.system}-${game.path}`} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                          <td className="p-3 truncate max-w-[250px] font-medium text-white/90">
                            {game.name}
                            <span className="block text-[10px] text-white/30 truncate">{game.path}</span>
                          </td>
                          <td className="p-3 text-white/60 truncate uppercase">{game.system}</td>
                          <td className="p-3 text-white/40 truncate">{game.genre || "N/A"}</td>
                          <td className="p-3 text-center">
                            {game.favorite ? (
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 mx-auto" />
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {game.hidden ? (
                              <EyeOff className="w-4 h-4 text-red-400 mx-auto" />
                            ) : (
                              <Eye className="w-4 h-4 text-accent mx-auto" />
                            )}
                          </td>
                          <td className="p-3 text-center flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleEditGame(game)}
                              className="p-1.5 rounded-md bg-white/5 hover:bg-accent-light hover:text-accent text-white/60 transition cursor-pointer"
                              title="Editar Metadados"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmGame(game)}
                              className="p-1.5 rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/60 transition cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between mt-4 bg-white/[0.01] border border-white/5 rounded-md p-3 text-xs">
                <button
                  disabled={dbPage <= 1}
                  onClick={() => setDbPage(p => Math.max(1, p - 1))}
                  className="px-3.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>
                <span className="text-white/60 font-medium">Página {dbPage} de {dbPages}</span>
                <button
                  disabled={dbPage >= dbPages}
                  onClick={() => setDbPage(p => Math.min(dbPages, p + 1))}
                  className="px-3.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition flex items-center gap-1 cursor-pointer"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB: SYSTEMS INDEXED */}
          {tab === "systems" && (
            <div className="flex-1 flex flex-col overflow-hidden pt-10 p-6">
              <div className="shrink-0 mb-5">
                <h2 className="text-lg font-bold mb-1">Sistemas Ativos</h2>
                <p className="text-xs text-white/50">Sistemas e consoles catalogados no banco de dados SQLite</p>
              </div>

              <div className="flex-1 overflow-y-auto border border-white/5 rounded-md bg-black/10">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-white/5 text-white/50 border-b border-white/5 font-semibold">
                      <th className="p-3">Nome Técnico</th>
                      <th className="p-3">Nome de Exibição</th>
                      <th className="p-3">Última Indexação</th>
                      <th className="p-3 w-[100px] text-center">Jogos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbSystems.filter(s => s.name !== '__es_systems.cfg').map(sys => (
                      <tr key={sys.name} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                        <td className="p-3 font-semibold text-accent">{sys.name}</td>
                        <td className="p-3 text-white/80">{sys.fullname}</td>
                        <td className="p-3 text-white/40">
                          {sys.lastScanAt ? new Date(sys.lastScanAt).toLocaleString('pt-BR') : "Nunca"}
                        </td>
                        <td className="p-3 text-center text-white/70 font-semibold">{sys.gameCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: MAINTENANCE & INFO */}
          {tab === "stats" && (
            <div className="flex-1 flex flex-col overflow-hidden pt-10 p-6">
              <div className="shrink-0 mb-5">
                <h2 className="text-lg font-bold mb-1">Manutenção e Informações</h2>
                <p className="text-xs text-white/50">Métricas gerais e ferramentas de manutenção do banco SQLite</p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6">
                {/* Statistics Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-white/40">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Jogos Catalogados</span>
                      <Gamepad2 className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-2xl font-black mt-2 text-white">{dbStats?.totalGames || 0}</span>
                    <span className="text-[9px] text-white/30">ROMs indexadas no total</span>
                  </div>
                  <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-white/40">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Sistemas Ativos</span>
                      <Folder className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-2xl font-black mt-2 text-white">{dbStats?.totalSystems || 0}</span>
                    <span className="text-[9px] text-white/30">Consoles catalogados</span>
                  </div>
                  <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-white/40">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Tamanho do Banco</span>
                      <HardDrive className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-2xl font-black mt-2 text-white">
                      {dbStats?.dbSize ? `${(dbStats.dbSize / 1024 / 1024).toFixed(2)} MB` : "0.00 MB"}
                    </span>
                    <span className="text-[9px] text-white/30">Arquivo riescade.db</span>
                  </div>
                  <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-white/40">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Último Sync</span>
                      <RefreshCw className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-xs font-bold mt-4 text-white truncate">
                      {dbStats?.lastSyncAt ? new Date(dbStats.lastSyncAt).toLocaleDateString('pt-BR') + ' ' + new Date(dbStats.lastSyncAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : "Nenhum"}
                    </span>
                    <span className="text-[9px] text-white/30">Data do último escaneamento</span>
                  </div>
                </div>

                {/* Maintenance tools block */}
                <div className="rounded-md border border-white/5 bg-white/5 p-5 space-y-4">
                  <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider">Ferramentas de Manutenção</h3>
                  
                  <div className="flex flex-col gap-3 max-w-[600px] text-xs">
                    <div className="flex items-center justify-between p-3.5 bg-black/20 rounded-md border border-white/5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-white/90">Vacuum (Compactar Banco)</span>
                        <span className="text-[10px] text-white/40">Executa a limpeza física e compacta o arquivo do SQLite. Recomendado se você editou ou removeu muitos jogos.</span>
                      </div>
                      <button
                        onClick={handleVacuum}
                        className="px-3.5 py-1.5 rounded-md bg-accent text-white font-semibold hover:bg-accent-hover transition shrink-0 cursor-pointer text-[10px]"
                      >
                        Executar Vacuum
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-black/20 rounded-md border border-white/5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-white/90 text-red-400">Reconstruir Banco (Rebuild)</span>
                        <span className="text-[10px] text-white/40">Limpa todas as tabelas do banco de dados e reconstrói do zero varrendo os arquivos físicos e importando arquivos XML novamente.</span>
                      </div>
                      <button
                        disabled={isRebuilding}
                        onClick={handleRebuild}
                        className="px-3.5 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-semibold transition shrink-0 cursor-pointer disabled:opacity-30 text-[10px]"
                      >
                        {isRebuilding ? "Reconstruindo..." : "Reconstruir Banco"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EDIT GAMES SLIDEOVER PANEL */}
          {selectedGame && editForm && (
            <div className="absolute inset-0 bg-[#07090eff]/80 backdrop-blur-sm z-50 flex justify-end">
              <div className="w-[520px] bg-[#0e1118] border-l border-white/10 h-full flex flex-col shadow-2xl relative">
                
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/10 shrink-0">
                  <div className="truncate max-w-[80%]">
                    <span className="text-[10px] text-accent uppercase tracking-widest font-black block">{editForm.system}</span>
                    <h3 className="font-bold text-sm text-white truncate">{editForm.name}</h3>
                  </div>
                  <button onClick={() => { setSelectedGame(null); setEditForm(null); }} className="p-1 rounded-md hover:bg-white/5 text-white/50 hover:text-white transition cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Edit Section Tabs */}
                <div className="flex border-b border-white/5 text-xs bg-black/5 shrink-0 select-none">
                  {[
                    { id: "basics", name: "Básicos" },
                    { id: "emulation", name: "Emulação" },
                    { id: "files", name: "Dados/Arquivos" },
                    { id: "media", name: "Imagens/Vídeos" }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setEditTab(t.id as any)}
                      className={`flex-1 py-3 text-center border-b font-semibold transition cursor-pointer ${
                        editTab === t.id ? "border-accent text-accent" : "border-transparent text-white/50 hover:text-white"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>

                {/* Edit Form Fields */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* BASICS TAB */}
                  {editTab === "basics" && (
                    <div className="space-y-3 text-xs">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Nome do Jogo</label>
                        <input
                          type="text"
                          value={editForm.name || ""}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Descrição</label>
                        <textarea
                          rows={4}
                          value={editForm.desc || ""}
                          onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
                          className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200 leading-normal"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Desenvolvedora</label>
                          <input
                            type="text"
                            value={editForm.developer || ""}
                            onChange={(e) => setEditForm({ ...editForm, developer: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Distribuidora</label>
                          <input
                            type="text"
                            value={editForm.publisher || ""}
                            onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Gênero</label>
                          <input
                            type="text"
                            value={editForm.genre || ""}
                            onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Jogadores</label>
                          <input
                            type="text"
                            value={editForm.players || ""}
                            onChange={(e) => setEditForm({ ...editForm, players: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Ano</label>
                          <input
                            type="text"
                            value={editForm.releasedate || ""}
                            onChange={(e) => setEditForm({ ...editForm, releasedate: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 pt-2">
                        <label className="flex items-center gap-2 bg-black/20 p-2 border border-white/5 rounded-md cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editForm.favorite === true}
                            onChange={(e) => setEditForm({ ...editForm, favorite: e.target.checked })}
                            className="accent-range"
                          />
                          <span>Favorito</span>
                        </label>
                        <label className="flex items-center gap-2 bg-black/20 p-2 border border-white/5 rounded-md cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editForm.hidden === true}
                            onChange={(e) => setEditForm({ ...editForm, hidden: e.target.checked })}
                            className="accent-range"
                          />
                          <span>Oculto</span>
                        </label>
                        <label className="flex items-center gap-2 bg-black/20 p-2 border border-white/5 rounded-md cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editForm.kidgame === true}
                            onChange={(e) => setEditForm({ ...editForm, kidgame: e.target.checked })}
                            className="accent-range"
                          />
                          <span>Modo Criança</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* EMULATION TAB */}
                  {editTab === "emulation" && (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Emulador</label>
                          <input
                            type="text"
                            value={editForm.emulator || "auto"}
                            onChange={(e) => setEditForm({ ...editForm, emulator: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Core / Núcleo</label>
                          <input
                            type="text"
                            value={editForm.core || "auto"}
                            onChange={(e) => setEditForm({ ...editForm, core: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Placa de Arcade</label>
                          <input
                            type="text"
                            value={editForm.arcadesystem || ""}
                            onChange={(e) => setEditForm({ ...editForm, arcadesystem: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Família do Jogo</label>
                          <input
                            type="text"
                            value={editForm.gamefamily || ""}
                            onChange={(e) => setEditForm({ ...editForm, gamefamily: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* FILES TAB */}
                  {editTab === "files" && (
                    <div className="space-y-3 text-xs">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Caminho Relativo da ROM</label>
                        <input
                          type="text"
                          readOnly
                          value={editForm.path || ""}
                          className="bg-white/5 border border-white/5 rounded-md p-2 text-white/50 cursor-not-allowed select-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">MD5 Hash</label>
                          <input
                            type="text"
                            value={editForm.md5 || ""}
                            onChange={(e) => setEditForm({ ...editForm, md5: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">CRC32</label>
                          <input
                            type="text"
                            value={editForm.crc32 || ""}
                            onChange={(e) => setEditForm({ ...editForm, crc32: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Tempo de Jogo (Segundos)</label>
                          <input
                            type="number"
                            value={editForm.gametime || 0}
                            onChange={(e) => setEditForm({ ...editForm, gametime: parseInt(e.target.value) || 0 })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Vezes Jogado (Playcount)</label>
                          <input
                            type="number"
                            value={editForm.playcount || 0}
                            onChange={(e) => setEditForm({ ...editForm, playcount: parseInt(e.target.value) || 0 })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Scraper Nome</label>
                          <input
                            type="text"
                            value={editForm.scrapName || ""}
                            onChange={(e) => setEditForm({ ...editForm, scrapName: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Scraper Data</label>
                          <input
                            type="text"
                            value={editForm.scrapDate || ""}
                            onChange={(e) => setEditForm({ ...editForm, scrapDate: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MEDIA TAB */}
                  {editTab === "media" && (
                    <div className="space-y-3 text-xs">
                      {[
                        { field: "image", name: "Capa do Jogo (Image/Cover)" },
                        { field: "video", name: "Vídeo Demonstrativo (Video)" },
                        { field: "marquee", name: "Logotipo / Marquee" },
                        { field: "thumbnail", name: "Capa 3D / Miniatura (Thumbnail)" },
                        { field: "fanart", name: "Arte de Fundo (Fanart)" },
                        { field: "titleshot", name: "Captura de Tela do Título (Titleshot)" },
                        { field: "wheel", name: "Logotipo Redondo (Wheel)" },
                        { field: "mix", name: "Imagem Composta (Mix)" },
                        { field: "boxback", name: "Capa Traseira (Boxback)" },
                        { field: "bezel", name: "Moldura Decorativa (Bezel)" },
                        { field: "manual", name: "Manual de Instruções" },
                        { field: "magazine", name: "Revista Escaneada (Magazine)" },
                        { field: "map", name: "Mapa do Jogo" }
                      ].map(m => (
                        <div key={m.field} className="flex flex-col gap-1">
                          <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">{m.name}</label>
                          <input
                            type="text"
                            value={(editForm as any)[m.field] || ""}
                            onChange={(e) => setEditForm({ ...editForm, [m.field]: e.target.value })}
                            placeholder="Caminho do arquivo ou link URL"
                            className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-white/5 bg-black/10 flex items-center justify-between shrink-0 font-semibold text-xs select-none">
                  <button
                    onClick={() => { setSelectedGame(null); setEditForm(null); }}
                    disabled={isSaving}
                    className="px-4 py-2 border border-white/10 rounded-md hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition cursor-pointer text-white/70 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveGame}
                    disabled={isSaving}
                    className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed rounded-md transition flex items-center gap-1.5 cursor-pointer text-white"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Salvar Metadados</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* DELETE CONFIRMATION MODAL */}
          {deleteConfirmGame && (
            <div className="absolute inset-0 bg-[#000000bb] backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-[380px] bg-[#121620] border border-white/10 rounded-md p-6 space-y-4 shadow-2xl">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-red-400">Excluir Jogo</h3>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Você tem certeza de que deseja remover <span className="font-bold text-white/90">{deleteConfirmGame.name}</span> da sua biblioteca?
                  </p>
                </div>

                <div className="bg-black/20 p-3.5 border border-white/5 rounded-md text-xs space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deletePhysicalFile}
                      onChange={(e) => setDeletePhysicalFile(e.target.checked)}
                      className="accent-red-500"
                    />
                    <span className="font-semibold text-white/80">Excluir arquivo ROM físico</span>
                  </label>
                  <p className="text-[10px] text-white/40 leading-normal pl-5">
                    Se desmarcado, o jogo será apenas removido da interface (banco de dados), mas o arquivo em disco continuará intacto.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 text-xs font-semibold select-none pt-2">
                  <button
                    onClick={() => { setDeleteConfirmGame(null); setDeletePhysicalFile(false); }}
                    disabled={isDeleting}
                    className="px-4 py-2 border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition cursor-pointer text-white/70"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteGame}
                    disabled={isDeleting}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed rounded-md transition cursor-pointer text-white flex items-center gap-1.5"
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Excluindo...</span>
                      </>
                    ) : (
                      <span>Excluir</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    );
  }

  return null;
}
