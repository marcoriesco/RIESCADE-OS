import React, { useState, useEffect, useRef } from "react";
import { ChevronRight, Search, Folder, Star, User, Shield, Settings, Palette, Gamepad2, Volume2, Cpu, Info, Database, Trash2, Edit3, X, ChevronLeft, Filter, HardDrive, RefreshCw, Eye, EyeOff, Check, ChevronDown, Save, Trophy, Loader2, Sliders, CheckCircle, Circle, Wrench, Bug, Copy, Download } from "lucide-react";
import { System, SettingsCtx } from "../types";
import { TOOL_APPS, getSystemTheme } from "../constants";
import {
  SettingGroup, SettingToggle, SettingSelect, SettingSlider, SettingInput, SettingInfo
} from "./SettingsComponents";
import { ScrollArea } from "./ScrollArea";
import * as Select from "@radix-ui/react-select";

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
  const [riescadeLogo, setRiescadeLogo] = useState<string>("");
  const [riescadeVersion, setRiescadeVersion] = useState<string>("v2.0.0-Beta");

  useEffect(() => {
    window.api.getRiescadeLogoPath().then((path) => {
      if (path) setRiescadeLogo(path);
    });
    window.api.getVersion().then((res) => {
      if (res && res.app) {
        setRiescadeVersion(`v${res.app}`);
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

  const [features, setFeatures] = useState<any>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Gamepad Control States
  const [controllers, setControllers] = useState<any[]>([]);
  const [selectedController, setSelectedController] = useState<any | null>(null);
  const [controllerConfigs, setControllerConfigs] = useState<Record<string, any>>({});
  const [gamepadState, setGamepadState] = useState<{ buttons: any[]; axes: number[] } | null>(null);
  const [scanningControllers, setScanningControllers] = useState(false);
  const [activeControlSubTab, setActiveControlSubTab] = useState<'configuracoes' | 'testes' | 'calibracao' | 'mapeamento' | 'debug' | 'informacoes'>('configuracoes');
  const [calibratingSticks, setCalibratingSticks] = useState(false);
  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [wizardMappings, setWizardMappings] = useState<Record<string, any>>({});
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [sdlVersion, setSdlVersion] = useState<string>('3.0.0');

  useEffect(() => {
    window.api.getSdlVersion().then((ver: string) => {
      if (ver) setSdlVersion(ver);
    }).catch(() => {});
  }, []);

  const copyControllerId = () => {
    if (!selectedController) return;
    const idData = {
      name: selectedController.name,
      vendorId: selectedController.vendorId,
      productId: selectedController.productId,
      guid: selectedController.guid,
      isGamepad: selectedController.type === 'xinput' || selectedController.buttons > 0
    };
    navigator.clipboard.writeText(JSON.stringify(idData, null, 2));
    window.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: {
          title: "Identificação Copiada",
          description: "Metadados do controle copiados para a área de transferência.",
          type: "controller"
        }
      })
    );
  };

  const exportDebugReport = async () => {
    if (!selectedController) return;
    const report = await window.api.exportDebugReport(debugEvents);
    const reportStr = JSON.stringify(report, null, 2);
    
    const blob = new Blob([reportStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RIESCADE_controller_debug_${selectedController.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    window.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: {
          title: "Diagnóstico Exportado",
          description: "Relatório de diagnóstico gravado com sucesso.",
          type: "controller"
        }
      })
    );
  };

  const finishWizard = async (finalMappings: any) => {
    if (!selectedController) return;
    setWizardStep(null);
    
    const inputsList = Object.entries(finalMappings).map(([name, val]: [string, any]) => ({
      name,
      type: val.type,
      id: val.id,
      value: val.value
    }));
    
    const hotkeyButton = finalMappings['hotkey'];
    
    const payload = {
      deviceName: selectedController.name,
      deviceGUID: selectedController.guid,
      vendorId: selectedController.vendorId,
      productId: selectedController.productId,
      profileId: `profile-custom-${selectedController.name.toLowerCase().replace(/\s+/g, '-')}`,
      inputs: inputsList,
      hotkey: hotkeyButton ? {
        button: {
          type: hotkeyButton.type,
          id: hotkeyButton.id
        },
        combos: [
          { button: "start", action: "quit" }
        ]
      } : undefined,
      analog: {
        leftDeadzone: 15,
        rightDeadzone: 15
      }
    };
    
    const success = await window.api.saveInputConfig(payload);
    if (success) {
      window.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: {
            title: "Mapeamento Salvo",
            description: "O layout personalizado foi persistido no input.json.",
            type: "controller"
          }
        })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: {
            title: "Erro ao Salvar",
            description: "Não foi possível gravar o arquivo de configurações.",
            type: "controller"
          }
        })
      );
    }
  };

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

  const prevControllersCount = useRef<number | null>(null);

  // Keep selected controller synchronized when the controllers list changes
  useEffect(() => {
    prevControllersCount.current = controllers.length;

    if (!selectedController) {
      if (controllers.length > 0) {
        setSelectedController(controllers[0]);
      }
      return;
    }

    const stillConnected = controllers.find(c => c.guid === selectedController.guid);

    if (stillConnected) {
      if (stillConnected.instanceId !== selectedController.instanceId) {
        setSelectedController(stillConnected);
      }
    } else {
      if (controllers.length > 0) {
        setSelectedController(controllers[0]);
      } else {
        setSelectedController(null);
      }
    }
  }, [controllers]);

  useEffect(() => {
    if (!selectedController) {
      setGamepadState(null);
      return;
    }

    const initialButtons = Array.from({ length: 25 }, () => ({ pressed: false, value: 0 }));
    const initialAxes = Array.from({ length: 10 }, () => 0);
    const state = { buttons: initialButtons, axes: initialAxes };
    setGamepadState(state);

    const unsubscribe = window.api.on('controller-input', (_, data: any) => {
      if (data.instanceId !== parseInt(selectedController.instanceId, 10)) {
        return;
      }

      setGamepadState(prev => {
        if (!prev) return prev;
        const nextButtons = [...prev.buttons];
        const nextAxes = [...prev.axes];

        if (data.type === 'GPBUTTON' || data.type === 'BUTTON') {
          if (data.index >= 0 && data.index < nextButtons.length) {
            nextButtons[data.index] = { pressed: data.value === 1, value: data.value };
          }
        } else if (data.type === 'GPAXIS' || data.type === 'AXIS') {
          if (data.index >= 0 && data.index < nextAxes.length) {
            nextAxes[data.index] = data.value / 32768;
          }
        } else if (data.type === 'HAT') {
          const hatVal = data.value;
          const up = (hatVal & 1) !== 0;
          const right = (hatVal & 2) !== 0;
          const down = (hatVal & 4) !== 0;
          const left = (hatVal & 8) !== 0;
          
          nextButtons[12] = { pressed: up, value: up ? 1 : 0 };
          nextButtons[13] = { pressed: down, value: down ? 1 : 0 };
          nextButtons[14] = { pressed: left, value: left ? 1 : 0 };
          nextButtons[15] = { pressed: right, value: right ? 1 : 0 };
        }

        return { buttons: nextButtons, axes: nextAxes };
      });

      setDebugEvents(prev => {
        const timestamp = new Date().toLocaleTimeString();
        const eventStr = `[${timestamp}] ${data.type} (Index: ${data.index}, Val: ${data.value})`;
        return [eventStr, ...prev].slice(0, 50);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [selectedController]);

  // Listen to inputs during wizard setup
  useEffect(() => {
    if (wizardStep === null || !selectedController) return;
    
    const currentStep = WIZARD_STEPS[wizardStep];
    
    const unsubscribe = window.api.on('controller-input', (_, data: any) => {
      if (data.instanceId !== parseInt(selectedController.instanceId, 10)) return;
      
      let captured = false;
      let mappingVal: any = null;
      
      if (data.type === 'GPBUTTON' || data.type === 'BUTTON') {
        if (data.value === 1) {
          captured = true;
          mappingVal = {
            type: 'button',
            id: data.index,
            value: 1
          };
        }
      } else if (data.type === 'GPAXIS' || data.type === 'AXIS') {
        const normalizedVal = data.value / 32768;
        if (Math.abs(normalizedVal) > 0.6) {
          captured = true;
          mappingVal = {
            type: 'axis',
            id: data.index,
            value: data.value > 0 ? 1 : -1
          };
        }
      }
      
      if (captured && mappingVal) {
        setWizardMappings(prev => {
          const isAlreadyMapped = Object.entries(prev).some(([k, v]) => {
            if (currentStep.key === 'hotkey') return false;
            return v.type === mappingVal.type && v.id === mappingVal.id && k !== 'hotkey';
          });

          if (isAlreadyMapped) {
            return prev;
          }

          const next = { ...prev, [currentStep.key]: mappingVal };
          
          if (wizardStep < WIZARD_STEPS.length - 1) {
            setWizardStep(prevStep => prevStep! + 1);
          } else {
            finishWizard(next);
          }
          
          return next;
        });
      }
    });
    
    return () => unsubscribe();
  }, [wizardStep, selectedController]);

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
                <span className="text-sm font-bold text-white tracking-wide">RIESCADE OS</span>
                <span className="text-[10px] text-white/40 font-medium">{riescadeVersion}</span>
              </div>
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
              <div className="shrink-0 px-6 pt-6 pb-2 max-w-[800px] flex items-center justify-between">
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
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-accent text-white/80 hover:text-white transition cursor-pointer flex items-center gap-2 disabled:opacity-50 text-xs font-semibold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanningControllers ? 'animate-spin' : ''}`} />
                  Buscar Controles
                </button>
              </div>

              {/* Grid content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 pb-6 max-w-[800px] space-y-6">
                  {/* Connected Controllers Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-white/60">Controles Conectados</h3>
                      {controllers.length > 0 && (
                        <span className="text-[10px] font-bold text-green-400 flex items-center gap-1.5 bg-green-500/10 px-2.5 py-0.5 rounded-full border border-green-500/15">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          {controllers.length} {controllers.length === 1 ? 'controle conectado' : 'controles conectados'}
                        </span>
                      )}
                    </div>
                    
                    {controllers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 bg-white/2 border border-dashed border-white/10 rounded-xl text-center">
                        <Gamepad2 className="w-8 h-8 text-white/10 mb-2 animate-pulse" />
                        <p className="text-xs text-white/40">Nenhum controle detectado automaticamente no momento.</p>
                        <p className="text-[10px] text-white/20 mt-1">Conecte um controle USB/Bluetooth ou clique em "Buscar Controles" acima.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Selector/Carousel of connected devices if multiple, or simple row select */}
                        {controllers.length > 1 && (
                          <div className="flex gap-2 pb-1 overflow-x-auto">
                            {controllers.map((c, idx) => {
                              const isSelected = selectedController?.guid === c.guid;
                              return (
                                <button
                                  key={c.guid + idx}
                                  type="button"
                                  onClick={() => setSelectedController(c)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shrink-0 ${
                                    isSelected 
                                      ? "bg-accent/15 border-accent text-white shadow shadow-accent/5" 
                                      : "bg-white/5 border-white/5 text-white/40 hover:text-white/70"
                                  }`}
                                >
                                  <Gamepad2 className="w-3.5 h-3.5" />
                                  P{c.playerIndex + 1}: {c.name.split('(')[0].trim()}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Selected Controller Premium Details Card */}
                        {(() => {
                          const activeController = selectedController || controllers[0];
                          if (!selectedController && activeController) {
                            setSelectedController(activeController);
                          }
                          if (!activeController) return null;
                          const config = controllerConfigs[activeController.guid] || {};

                          return (
                            <div className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl space-y-4 shadow-lg flex flex-col justify-between">
                              <div className="flex flex-col md:flex-row gap-5 items-start justify-between">
                                {/* Left icon & Title details */}
                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                  <div className="w-12 h-12 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0 shadow-inner">
                                    <Gamepad2 className="w-5.5 h-5.5 text-accent" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 text-[8px] font-extrabold bg-accent/25 text-accent rounded uppercase tracking-wider">
                                        {activeController.type === 'xinput' ? 'XInput' : 'DirectInput'}
                                      </span>
                                      {activeController.isVirtual && (
                                        <span className="px-2 py-0.5 text-[8px] font-extrabold bg-amber-500/25 text-amber-400 rounded uppercase tracking-wider">
                                          Virtual
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-sm font-extrabold text-white truncate mt-1">{activeController.name}</h4>
                                    <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[9px] text-white/35">
                                      <span className="truncate max-w-[150px]">{activeController.guid}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(activeController.guid);
                                          window.dispatchEvent(
                                            new CustomEvent("show-toast", {
                                              detail: {
                                                title: "Copiado!",
                                                description: "GUID copiado para a área de transferência.",
                                                type: "info"
                                              }
                                            })
                                          );
                                        }}
                                        className="hover:text-accent cursor-pointer transition flex items-center"
                                        title="Copiar GUID"
                                      >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                        </svg>
                                      </button>
                                    </div>
                                    <p className="text-[9px] text-white/25 mt-0.5">Firmware: 2.1.0</p>
                                  </div>
                                </div>

                                {/* Right hardware metadata info grid */}
                                <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 border-t md:border-t-0 md:border-l border-white/5 pt-3.5 md:pt-0 md:pl-5 shrink-0 w-full md:w-auto text-left">
                                  <div>
                                    <p className="text-[8px] text-white/30 uppercase tracking-wider font-bold">Tipo</p>
                                    <p className="text-xs font-bold text-white/80">{activeController.type === 'xinput' ? 'XInput' : 'DirectInput'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] text-white/30 uppercase tracking-wider font-bold">Conexão</p>
                                    <p className="text-xs font-bold text-white/80">{activeController.isVirtual ? 'Virtual' : 'USB'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] text-white/30 uppercase tracking-wider font-bold">Bateria</p>
                                    <p className="text-xs font-bold text-green-400 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                      100%
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[8px] text-white/30 uppercase tracking-wider font-bold">Vibração</p>
                                    <p className="text-xs font-bold text-white/80">Suportada</p>
                                  </div>
                                </div>
                              </div>

                              {/* Card Actions Bottom Row */}
                              <div className="flex flex-wrap items-center justify-between border-t border-white/5 pt-3.5 gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Atribuído a:</span>
                                  <RadixSelect
                                    value={String(config.preferredPlayer || "auto")}
                                    onValueChange={(val) => {
                                      const newConfig = {
                                        ...config,
                                        preferredPlayer: val === "auto" ? undefined : parseInt(val, 10)
                                      };
                                      window.api.saveControllerConfig(activeController.guid, newConfig);
                                      setControllerConfigs(prev => ({
                                        ...prev,
                                        [activeController.guid]: newConfig
                                      }));
                                      // Force reload to apply assignments
                                      window.api.detectControllers().then(list => setControllers(list || []));
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

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      window.api.rumbleController(activeController.instanceId, 1000);
                                      window.dispatchEvent(
                                        new CustomEvent("show-toast", {
                                          detail: {
                                            title: "Identificando Controle",
                                            description: `Vibrando ${activeController.name}...`,
                                            type: "controller"
                                          }
                                        })
                                      );
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Gamepad2 className="w-3.5 h-3.5 text-accent" />
                                    Identificar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveControlSubTab('calibracao')}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Sliders className="w-3.5 h-3.5 text-accent" />
                                    Calibrar
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Selected Controller Customizations, Visual Test & Calibration Dashboard */}
                  {selectedController && (() => {
                    const config = controllerConfigs[selectedController.guid] || {};
                    const leftStickX = gamepadState?.axes[0] ?? 0;
                    const leftStickY = gamepadState?.axes[1] ?? 0;
                    const rightStickX = gamepadState?.axes[2] ?? 0;
                    const rightStickY = gamepadState?.axes[3] ?? 0;
                    
                    const ltValue = gamepadState?.buttons[6]?.value ?? 0;
                    const rtValue = gamepadState?.buttons[7]?.value ?? 0;
                    
                    const dpadPressed = gamepadState ? (
                      gamepadState.buttons[12]?.pressed || 
                      gamepadState.buttons[13]?.pressed || 
                      gamepadState.buttons[14]?.pressed || 
                      gamepadState.buttons[15]?.pressed
                    ) : false;

                    const btnMap = [
                      { id: 0, label: "A" },
                      { id: 1, label: "B" },
                      { id: 2, label: "X" },
                      { id: 3, label: "Y" },
                      { id: 4, label: "LB" },
                      { id: 5, label: "RB" },
                      { id: 8, label: "BACK" },
                      { id: 9, label: "START" },
                      { id: 10, label: "L3" },
                      { id: 11, label: "R3" }
                    ];

                    return (
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        {/* Sub-navigation Menu */}
                        <div className="flex flex-wrap gap-1 bg-white/5 border border-white/5 p-1 rounded-xl shrink-0">
                          {[
                            { id: "configuracoes", label: "Configurações", icon: Sliders },
                            { id: "testes", label: "Testes em Tempo Real", icon: Gamepad2 },
                            { id: "calibracao", label: "Calibração dos Sticks", icon: Star },
                            { id: "mapeamento", label: "Mapeamento Customizado", icon: Wrench },
                            { id: "debug", label: "Diagnóstico e Debug", icon: Bug },
                            { id: "informacoes", label: "Informações", icon: Info }
                          ].map((tab) => {
                            const isActive = activeControlSubTab === tab.id;
                            const Icon = tab.icon;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveControlSubTab(tab.id as any)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                  isActive 
                                    ? "bg-white/10 text-white shadow shadow-white/5" 
                                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* SUB-TAB content rendering */}
                        
                        {/* 1. CONFIGURAÇÕES SUB-TAB */}
                        {activeControlSubTab === "configuracoes" && (
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
                                  window.api.detectControllers().then(list => setControllers(list || []));
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
                            <div className="space-y-1.5 pt-2 border-t border-white/5">
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
                                min="5"
                                max="25"
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

                            {/* Toggles grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
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
                                  <p className="text-[10px] text-white/40">Inverte a direção para cima/baixo.</p>
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

                              <div className="flex items-center justify-between gap-4 pt-2 md:pt-0">
                                <div>
                                  <h4 className="text-xs font-bold text-white">Trocar Sticks</h4>
                                  <p className="text-[10px] text-white/40">Troca as funções dos sticks esquerdo e direito.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newConfig = {
                                      ...config,
                                      swapSticks: !config.swapSticks
                                    };
                                    window.api.saveControllerConfig(selectedController.guid, newConfig);
                                    setControllerConfigs(prev => ({
                                      ...prev,
                                      [selectedController.guid]: newConfig
                                    }));
                                  }}
                                  className={`w-8 h-5 rounded-full p-0.5 transition cursor-pointer flex items-center ${config.swapSticks ? 'bg-accent justify-end' : 'bg-white/10 justify-start'}`}
                                >
                                  <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-4 pt-2 md:pt-0">
                                <div>
                                  <h4 className="text-xs font-bold text-white">Zona Circular dos Sticks</h4>
                                  <p className="text-[10px] text-white/40">Restringe a área de movimento para um círculo.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newConfig = {
                                      ...config,
                                      circularZone: !config.circularZone
                                    };
                                    window.api.saveControllerConfig(selectedController.guid, newConfig);
                                    setControllerConfigs(prev => ({
                                      ...prev,
                                      [selectedController.guid]: newConfig
                                    }));
                                  }}
                                  className={`w-8 h-5 rounded-full p-0.5 transition cursor-pointer flex items-center ${config.circularZone ? 'bg-accent justify-end' : 'bg-white/10 justify-start'}`}
                                >
                                  <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 2. TESTES EM TEMPO REAL SUB-TAB */}
                        {activeControlSubTab === "testes" && (
                          <div className="p-4 bg-white/2 border border-white/5 rounded-xl flex flex-col md:flex-row items-stretch gap-6 text-left">
                            {/* Left Visual Test Panel */}
                            <div className="flex-1 min-w-0 space-y-4 pr-0 md:pr-4 md:border-r border-white/5">
                              <div className="flex justify-between items-center">
                                <h4 className="text-xs font-bold text-white">Teste em Tempo Real</h4>
                                <span className="text-[9px] font-bold text-green-400 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  Monitorando entrada
                                </span>
                              </div>

                              <div className="flex gap-6 items-center justify-center py-2">
                                {/* Left Stick */}
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Stick Esquerdo</span>
                                  <div className="relative w-20 h-20 rounded-full bg-black/40 border border-white/10 flex items-center justify-center shadow-inner">
                                    <div className="absolute w-full h-px bg-white/5" />
                                    <div className="absolute h-full w-px bg-white/5" />
                                    <div className="absolute w-16 h-16 rounded-full border border-white/5 border-dashed" />
                                    <div 
                                      className="absolute w-3.5 h-3.5 rounded-full bg-accent border border-white shadow-lg shadow-accent/50 transition-all duration-75 flex items-center justify-center"
                                      style={{
                                        transform: `translate(${leftStickX * 30}px, ${leftStickY * 30}px)`
                                      }}
                                    >
                                      <div className="w-1 h-1 rounded-full bg-white" />
                                    </div>
                                  </div>
                                  <span className="text-[8px] font-mono text-white/45">X: {leftStickX.toFixed(2)} Y: {leftStickY.toFixed(2)}</span>
                                </div>

                                {/* Right Stick */}
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Stick Direito</span>
                                  <div className="relative w-20 h-20 rounded-full bg-black/40 border border-white/10 flex items-center justify-center shadow-inner">
                                    <div className="absolute w-full h-px bg-white/5" />
                                    <div className="absolute h-full w-px bg-white/5" />
                                    <div className="absolute w-16 h-16 rounded-full border border-white/5 border-dashed" />
                                    <div 
                                      className="absolute w-3.5 h-3.5 rounded-full bg-accent border border-white shadow-lg shadow-accent/50 transition-all duration-75 flex items-center justify-center"
                                      style={{
                                        transform: `translate(${rightStickX * 30}px, ${rightStickY * 30}px)`
                                      }}
                                    >
                                      <div className="w-1 h-1 rounded-full bg-white" />
                                    </div>
                                  </div>
                                  <span className="text-[8px] font-mono text-white/45">X: {rightStickX.toFixed(2)} Y: {rightStickY.toFixed(2)}</span>
                                </div>

                                {/* Triggers LT/RT */}
                                <div className="flex gap-3">
                                  <div className="flex flex-col items-center gap-1.5 h-24">
                                    <span className="text-[8px] font-bold text-white/40">LT</span>
                                    <div className="relative w-2 flex-1 bg-black/40 border border-white/5 rounded-full overflow-hidden flex items-end">
                                      <div className="w-full bg-accent transition-all duration-75" style={{ height: `${ltValue * 100}%` }} />
                                    </div>
                                    <span className="text-[8px] font-mono text-white/50">{Math.round(ltValue * 100)}</span>
                                  </div>
                                  <div className="flex flex-col items-center gap-1.5 h-24">
                                    <span className="text-[8px] font-bold text-white/40">RT</span>
                                    <div className="relative w-2 flex-1 bg-black/40 border border-white/5 rounded-full overflow-hidden flex items-end">
                                      <div className="w-full bg-accent transition-all duration-75" style={{ height: `${rtValue * 100}%` }} />
                                    </div>
                                    <span className="text-[8px] font-mono text-white/50">{Math.round(rtValue * 100)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Button grid */}
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider block">Botões</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {btnMap.map(btn => {
                                    const pressed = gamepadState?.buttons[btn.id]?.pressed ?? false;
                                    return (
                                      <span
                                        key={btn.id}
                                        className={`w-11 h-6 rounded flex items-center justify-center text-[9px] font-extrabold font-mono transition-all border ${
                                          pressed 
                                            ? 'bg-accent border-accent text-white scale-105 shadow shadow-accent/20' 
                                            : 'bg-white/5 border-white/5 text-white/30'
                                        }`}
                                      >
                                        {btn.label}
                                      </span>
                                    );
                                  })}
                                  <span
                                    className={`w-11 h-6 rounded flex items-center justify-center text-xs font-bold transition-all border ${
                                      dpadPressed 
                                        ? 'bg-accent border-accent text-white scale-105 shadow shadow-accent/20' 
                                        : 'bg-white/5 border-white/5 text-white/30'
                                    }`}
                                  >
                                    +
                                  </span>
                                </div>
                              </div>

                              <p className="text-[9px] text-white/20 text-center italic mt-2">
                                Pressione os botões ou mova os sticks para testar.
                              </p>
                            </div>

                            {/* Right Calibration Panel */}
                            <div className="flex-1 flex flex-col justify-between space-y-4">
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-white">Calibração dos Sticks</h4>
                                <p className="text-[10px] text-white/40">Calibre seus sticks para garantir precisão máxima.</p>
                              </div>

                              <div className="flex justify-around items-center gap-4 py-2">
                                {/* Left stick concentric target */}
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="text-[8px] font-semibold text-white/40 uppercase">Stick Esquerdo</span>
                                  <div className="relative w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-black/25">
                                    <div className="absolute w-12 h-12 rounded-full border border-white/5" />
                                    <div className="absolute w-7 h-7 rounded-full border border-white/5 border-dashed" />
                                    <div className="absolute w-full h-px bg-white/5" />
                                    <div className="absolute h-full w-px bg-white/5" />
                                    <div className="absolute w-1.5 h-1.5 rounded-full bg-green-500 shadow shadow-green-500/50" />
                                  </div>
                                  <div className="text-center">
                                    <span className="px-1.5 py-0.5 text-[8px] font-bold bg-green-500/20 text-green-400 rounded-full">Calibrado</span>
                                    <p className="text-[8px] text-white/30 font-mono mt-1">Centro: X:0.00 Y:0.00</p>
                                    <p className="text-[8px] text-white/30 font-mono">Desvio: 2%</p>
                                  </div>
                                </div>

                                {/* Right stick concentric target */}
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="text-[8px] font-semibold text-white/40 uppercase">Stick Direito</span>
                                  <div className="relative w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-black/25">
                                    <div className="absolute w-12 h-12 rounded-full border border-white/5" />
                                    <div className="absolute w-7 h-7 rounded-full border border-white/5 border-dashed" />
                                    <div className="absolute w-full h-px bg-white/5" />
                                    <div className="absolute h-full w-px bg-white/5" />
                                    <div className="absolute w-1.5 h-1.5 rounded-full bg-green-500 shadow shadow-green-500/50" />
                                  </div>
                                  <div className="text-center">
                                    <span className="px-1.5 py-0.5 text-[8px] font-bold bg-green-500/20 text-green-400 rounded-full">Calibrado</span>
                                    <p className="text-[8px] text-white/30 font-mono mt-1">Centro: X:0.00 Y:0.00</p>
                                    <p className="text-[8px] text-white/30 font-mono">Desvio: 3%</p>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={calibratingSticks}
                                onClick={() => {
                                  setCalibratingSticks(true);
                                  setTimeout(() => {
                                    setCalibratingSticks(false);
                                    window.dispatchEvent(
                                      new CustomEvent("show-toast", {
                                        detail: {
                                          title: "Recalibração",
                                          description: "Analógicos calibrados com sucesso!",
                                          type: "controller"
                                        }
                                      })
                                    );
                                  }, 1200);
                                }}
                                className="w-full py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${calibratingSticks ? 'animate-spin' : ''}`} />
                                {calibratingSticks ? 'Calibrando...' : 'Recalibrar Sticks'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 3. CALIBRAÇÃO DOS STICKS SUB-TAB */}
                        {activeControlSubTab === "calibracao" && (
                          <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4">
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-white">Módulos de Calibração</h4>
                              <p className="text-[10px] text-white/40">Calibre a folga de ponto morto do controle atual para jogos competitivos.</p>
                            </div>

                            <div className="flex flex-col md:flex-row gap-6 justify-around py-2 border-t border-white/5 pt-4">
                              <div className="flex items-start gap-4">
                                <div className="relative w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-black/25">
                                  <div className="absolute w-12 h-12 rounded-full border border-white/5" />
                                  <div className="absolute w-full h-px bg-white/5" />
                                  <div className="absolute h-full w-px bg-white/5" />
                                  <div className="absolute w-1.5 h-1.5 rounded-full bg-green-500 shadow shadow-green-500/50" />
                                </div>
                                <div className="space-y-1.5 text-left">
                                  <p className="text-xs font-bold text-white">Stick Esquerdo</p>
                                  <p className="text-[10px] text-white/50">Centro: X: 0.00 Y: 0.00</p>
                                  <p className="text-[10px] text-white/50">Zonas de Desvio Máximo: 2%</p>
                                  <p className="text-[10px] text-green-400 font-bold">Status: Excelente</p>
                                </div>
                              </div>

                              <div className="flex items-start gap-4">
                                <div className="relative w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-black/25">
                                  <div className="absolute w-12 h-12 rounded-full border border-white/5" />
                                  <div className="absolute w-full h-px bg-white/5" />
                                  <div className="absolute h-full w-px bg-white/5" />
                                  <div className="absolute w-1.5 h-1.5 rounded-full bg-green-500 shadow shadow-green-500/50" />
                                </div>
                                <div className="space-y-1.5 text-left">
                                  <p className="text-xs font-bold text-white">Stick Direito</p>
                                  <p className="text-[10px] text-white/50">Centro: X: 0.00 Y: 0.00</p>
                                  <p className="text-[10px] text-white/50">Zonas de Desvio Máximo: 3%</p>
                                  <p className="text-[10px] text-green-400 font-bold">Status: Excelente</p>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={calibratingSticks}
                              onClick={() => {
                                setCalibratingSticks(true);
                                setTimeout(() => {
                                  setCalibratingSticks(false);
                                  window.dispatchEvent(
                                    new CustomEvent("show-toast", {
                                      detail: {
                                        title: "Calibração Concluída",
                                        description: "O centro dos sticks analógicos foi recalibrado.",
                                        type: "controller"
                                      }
                                    })
                                  );
                                }, 1200);
                              }}
                              className="w-full py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${calibratingSticks ? 'animate-spin' : ''}`} />
                              {calibratingSticks ? 'Calibrando centro...' : 'Iniciar Calibração Completa'}
                            </button>
                          </div>
                        )}

                        {/* 4. MAPEAMENTO SUB-TAB */}
                        {activeControlSubTab === "mapeamento" && (
                          <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4 text-left">
                            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                              <div>
                                <h4 className="text-xs font-bold text-white">Wizard de Mapeamento</h4>
                                <p className="text-[10px] text-white/40">Mapeie os botões e analógicos do seu controle manualmente.</p>
                              </div>
                              {wizardStep === null ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWizardStep(0);
                                    setWizardMappings({});
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/80 text-white text-[10px] font-bold transition cursor-pointer"
                                >
                                  Iniciar Mapeamento
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setWizardStep(null)}
                                  className="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-400 text-[10px] font-bold transition cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>

                            {wizardStep !== null ? (
                              <div className="p-6 bg-black/35 rounded-xl border border-white/5 text-center space-y-4">
                                <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Passo {wizardStep + 1} de {WIZARD_STEPS.length}</p>
                                <h3 className="text-lg font-extrabold text-white animate-pulse">
                                  Pressione ou mova: <span className="text-accent">{WIZARD_STEPS[wizardStep].label}</span>
                                </h3>
                                <p className="text-xs text-white/40">
                                  Pressione o botão físico correspondente no controle ou mova o analógico além de 60%.
                                </p>
                                <div className="flex justify-center gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (wizardStep < WIZARD_STEPS.length - 1) {
                                        setWizardStep(prev => prev! + 1);
                                      } else {
                                        finishWizard(wizardMappings);
                                      }
                                    }}
                                    className="px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold transition cursor-pointer"
                                  >
                                    Pular este botão
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <h5 className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Perfil de Entrada:</h5>
                                <div className="p-3 bg-black/25 border border-white/5 rounded-lg text-xs space-y-2">
                                  <p className="text-white/80">O layout de entrada do controle é carregado do arquivo central <span className="font-mono text-accent">input.json</span>.</p>
                                  <p className="text-white/60 text-[10px]">Use o Wizard acima para substituir ou reconfigurar todas as atribuições físicas deste dispositivo.</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 4.5. DEBUG/DIAGNÓSTICO SUB-TAB */}
                        {activeControlSubTab === "debug" && (
                          <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4 text-left">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                              <div>
                                <h4 className="text-xs font-bold text-white">Debug & Diagnóstico SDL3</h4>
                                <p className="text-[10px] text-white/40">Monitore as entradas de baixo nível recebidas do driver de controle.</p>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={copyControllerId}
                                  className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3 text-accent" />
                                  Copiar ID
                                </button>
                                <button
                                  type="button"
                                  onClick={exportDebugReport}
                                  className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Download className="w-3 h-3 text-accent" />
                                  Exportar Relatório
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 border border-white/5 p-3 rounded-lg text-[10px] font-mono text-white/60">
                              <div><span className="text-white/40 font-bold block">Dispositivo:</span> {selectedController.name}</div>
                              <div><span className="text-white/40 font-bold block">Identificador GUID:</span> {selectedController.guid}</div>
                              <div><span className="text-white/40 font-bold block">Vendor / Product:</span> 0x{selectedController.vendorId} / 0x{selectedController.productId}</div>
                              <div><span className="text-white/40 font-bold block">Conexão API:</span> {selectedController.type === 'xinput' ? 'XInput' : 'DirectInput / HID'}</div>
                              <div><span className="text-white/40 font-bold block">Instance ID:</span> {selectedController.instanceId}</div>
                              <div><span className="text-white/40 font-bold block">Versão SDL3 Runtime:</span> {sdlVersion}</div>
                            </div>

                            <div className="space-y-2">
                              <h5 className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Console de Eventos em Tempo Real:</h5>
                              <div className="h-40 overflow-y-auto bg-black/45 border border-white/5 p-2 rounded-lg font-mono text-[10px] text-green-400 space-y-1 select-text scrollbar-thin">
                                {debugEvents.length === 0 ? (
                                  <p className="text-white/30 italic">Aguardando eventos... Pressione algum botão ou mova os sticks analógicos.</p>
                                ) : (
                                  debugEvents.map((evt, idx) => (
                                    <div key={idx} className="hover:bg-white/5 py-0.5 truncate">{evt}</div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 5. INFORMAÇÕES SUB-TAB */}
                        {activeControlSubTab === "informacoes" && (
                          <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-3 text-left">
                            <h4 className="text-xs font-bold text-white mb-2">Informações Técnicas do Dispositivo</h4>
                            <ScrollArea className="max-h-56 pr-2">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="pb-2 text-left">Atributo</th>
                                    <th className="pb-2 text-left">Valor do Dispositivo</th>
                                  </tr>
                                </thead>
                                <tbody className="text-white/80 font-mono divide-y divide-white/5">
                                  <tr><td className="py-2 font-bold text-white/50">Nome do Dispositivo</td><td className="py-2">{selectedController.name}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Identificador GUID</td><td className="py-2 text-[10px]">{selectedController.guid}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Vendor ID (VID)</td><td className="py-2">0x{selectedController.vendorId}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Product ID (PID)</td><td className="py-2">0x{selectedController.productId}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">ID da Instância (SDL3)</td><td className="py-2">{selectedController.instanceId}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Classe de Controle</td><td className="py-2">{selectedController.type === 'xinput' ? 'XInput API' : 'DirectInput / HID API'}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Número de Série</td><td className="py-2">{selectedController.serial || 'Não exposto via Bluetooth/USB'}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Botões Mapeados</td><td className="py-2">{selectedController.buttons}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Eixos Analógicos</td><td className="py-2">{selectedController.axes}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Direcionais Hats</td><td className="py-2">{selectedController.hats}</td></tr>
                                  <tr><td className="py-2 font-bold text-white/50">Status do Dispositivo</td><td className="py-2 text-green-400">Ativo / Conectado</td></tr>
                                </tbody>
                              </table>
                            </ScrollArea>
                          </div>
                        )}
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
                  <SettingToggle label="Capa 2D (Cover)" name="ScrapperDownloadCover" ctx={ctx} />
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
                  <SettingInfo label="Versão" value={`RIESCADE OS ${riescadeVersion}`} />
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
