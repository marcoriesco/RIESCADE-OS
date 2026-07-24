import React, { useState, useEffect } from "react";
import { RefreshCw, Copy, Download, Sliders, CheckCircle, Circle, Wrench, Bug, Info, ChevronRight, Check, Crosshair, MousePointer, Target, ChevronDown, Gamepad2 } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { SettingsCtx } from "../../types";
import { SettingGroup, SettingToggle, SettingSelect } from "../SettingsComponents";
import { ScrollArea } from "../ScrollArea";

const WIZARD_STEPS = [
  { key: 'a', label: 'Botão A / Confirmação' },
  { key: 'b', label: 'Botão B / Voltar' },
  { key: 'x', label: 'Botão X' },
  { key: 'y', label: 'Botão Y' },
  { key: 'leftshoulder', label: 'Bumper Esquerdo (LB)' },
  { key: 'rightshoulder', label: 'Bumper Direito (RB)' },
  { key: 'lefttrigger', label: 'Gatilho Esquerdo (LT)', type: 'axis' },
  { key: 'righttrigger', label: 'Gatilho Direito (RT)', type: 'axis' },
  { key: 'back', label: 'Botão Select / Back' },
  { key: 'start', label: 'Botão Start' },
  { key: 'leftstick', label: 'Clique Analógico Esquerdo (L3)' },
  { key: 'rightstick', label: 'Clique Analógico Direito (R3)' },
  { key: 'dpup', label: 'D-Pad Para Cima' },
  { key: 'dpdown', label: 'D-Pad Para Baixo' },
  { key: 'dpleft', label: 'D-Pad Para Esquerda' },
  { key: 'dpright', label: 'D-Pad Para Direita' },
  { key: 'leftx', label: 'Analógico Esquerdo (Horizontal X)', type: 'axis' },
  { key: 'lefty', label: 'Analógico Esquerdo (Vertical Y)', type: 'axis' },
  { key: 'rightx', label: 'Analógico Direito (Horizontal X)', type: 'axis' },
  { key: 'righty', label: 'Analógico Direito (Vertical Y)', type: 'axis' },
  { key: 'hotkey', label: 'Botão Hotkey (Menu de Atalhos)' }
];

export interface SettingsControlsProps {
  ctx: SettingsCtx;
}

function SettingsControlsComponent({ ctx }: SettingsControlsProps) {
  const [controllers, setControllers] = useState<any[]>([]);
  const [selectedController, setSelectedController] = useState<any | null>(null);
  const [controllerConfigs, setControllerConfigs] = useState<Record<string, any>>({});
  const [gamepadState, setGamepadState] = useState<{ buttons: any[]; axes: number[] } | null>(null);
  const [scanningControllers, setScanningControllers] = useState(false);

  const [mainControlTab, setMainControlTab] = useState<'controles' | 'lightgun' | 'opcoes'>('controles');
  const [activeControlSubTab, setActiveControlSubTab] = useState<'configuracoes' | 'testes' | 'calibracao' | 'mapeamento' | 'informacoes'>('configuracoes');

  const [calibratingSticks, setCalibratingSticks] = useState(false);
  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [wizardMappings, setWizardMappings] = useState<Record<string, any>>({});
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [sdlVersion, setSdlVersion] = useState<string>('3.0.0');

  useEffect(() => {
    window.api.getSdlVersion?.().then((ver: string) => {
      if (ver) setSdlVersion(ver);
    }).catch(() => {});
  }, []);

  const [pointingDevices, setPointingDevices] = useState<any[]>([]);
  const [lastPointingScanTime, setLastPointingScanTime] = useState<number | null>(null);
  const [scanningPointing, setScanningPointing] = useState(false);

  const handleFetchPointingDevices = async (forceRefresh: boolean = false) => {
    setScanningPointing(true);
    try {
      const res = await window.api.getPointingDevices?.(forceRefresh);
      if (res) {
        setPointingDevices(res.devices || []);
        setLastPointingScanTime(res.lastScan || Date.now());
      }
    } catch (e) {
      console.error('Failed to fetch pointing devices:', e);
    } finally {
      setScanningPointing(false);
    }
  };

  useEffect(() => {
    handleFetchPointingDevices(false);
  }, []);

  useEffect(() => {
    // 1. Initial load
    window.api.detectControllers().then((data: any[]) => {
      setControllers(data || []);
    });

    // 2. Load configurations
    window.api.getControllerConfigs().then((configs: any) => {
      setControllerConfigs(configs || {});
    });

    // 3. Listen to updates
    const onControllerUpdated = (_: any, data: { controllers?: any[]; configs?: any }) => {
      if (data.controllers) setControllers(data.controllers);
      if (data.configs) setControllerConfigs(data.configs);
    };

    if ((window.api as any).onControllerUpdated) {
      (window.api as any).onControllerUpdated(onControllerUpdated);
    }

    // 4. Listen to Gamepad Input for Realtime test
    let animationFrameId: number;
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const activeGpad = Array.from(gamepads).find(g => g !== null);

      if (activeGpad) {
        setGamepadState({
          buttons: activeGpad.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
          axes: Array.from(activeGpad.axes)
        });
      } else {
        setGamepadState(null);
      }

      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    pollGamepad();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleSaveControllerConfig = (guid: string, newConfig: any) => {
    const updated = {
      ...controllerConfigs,
      [guid]: { ...(controllerConfigs[guid] || {}), ...newConfig }
    };
    setControllerConfigs(updated);
    window.api.saveControllerConfigs(updated);
  };

  const finishWizard = (mappings: Record<string, any>) => {
    if (!selectedController && controllers.length === 0) return;
    const activeGuid = selectedController?.guid || controllers[0]?.guid;

    const currentConf = controllerConfigs[activeGuid] || {};
    handleSaveControllerConfig(activeGuid, {
      ...currentConf,
      customMappings: mappings
    });

    setWizardStep(null);
    setWizardMappings({});

    window.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: {
          title: "Mapeamento Salvo",
          description: `Novo layout atribuído ao controle ${selectedController?.name || 'Padrão'}.`,
          type: "controller"
        }
      })
    );
  };

  const copyControllerId = () => {
    const active = selectedController || controllers[0];
    if (!active) return;
    navigator.clipboard.writeText(active.guid || active.instanceId || active.name);
    window.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: {
          title: "Copiado",
          description: "GUID do controle copiado para a área de transferência.",
          type: "controller"
        }
      })
    );
  };

  const exportDebugReport = () => {
    const active = selectedController || controllers[0];
    const report = {
      timestamp: new Date().toISOString(),
      activeController: active,
      sdlVersion,
      pointingDevicesCount: pointingDevices.length,
      pointingDevices,
      configs: controllerConfigs
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `control-debug-${active?.name || 'report'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAssignPlayerSlot = (slot: number, guid: string) => {
    ctx.saveSetting(`controllers.p${slot}`, guid, "string");
  };

  // Unique option generator for Radix UI Selects to prevent duplicate highlight bugs
  const buildDeviceOptions = (defaultLabel: string, devices: any[]) => {
    const options = [
      { label: defaultLabel, value: "auto" },
      { label: "Windows Mouse Cursor", value: "windows_mouse_cursor" }
    ];

    const filtered = devices.filter(d => d.id !== 'windows_mouse_cursor' && d.type !== 'keyboard');
    filtered.forEach((d, idx) => {
      const uniqueVal = d.devicePath
        ? `rawinput:${encodeURIComponent(d.devicePath)}`
        : `${d.name}::${d.instanceId || idx}`;
      options.push({
        label: `${d.friendlyName || d.name} (${d.type.toUpperCase()})`,
        value: uniqueVal
      });
    });

    return options;
  };

  const buildKeyboardOptions = (devices: any[]) => {
    const options = [{ label: "○ Auto (Teclado principal)", value: "auto" }];
    const keyboardLabel = (d: any) => {
      const name = String(d.friendlyName || d.name || '');
      const generic = !name || /dispositivo de teclado hid|hid keyboard device/i.test(name);
      if (!generic) return name;
      const vidPid = String(d.devicePath).match(/VID_[0-9A-F]{4}&PID_[0-9A-F]{4}/i)?.[0]?.replace('&', ' ') || '';
      const mi = String(d.devicePath).match(/&MI_[0-9A-F]{2}/i)?.[0]?.substring(1).toUpperCase() || '';
      return ['Teclado', vidPid, mi].filter(Boolean).join(' ');
    };
    const score = (d: any) => {
      const path = String(d.devicePath || '').toUpperCase();
      return (path.includes('&MI_00') ? 200 : 0)
        + (!path.includes('&COL') ? 100 : 0)
        + (path.includes('&MI_01') ? 20 : 0);
    };
    devices
      .filter(d => d.type === 'keyboard' && d.devicePath)
      .sort((a, b) => score(b) - score(a))
      .forEach((d: any) => {
      options.push({
        label: keyboardLabel(d),
        value: `rawinput:${encodeURIComponent(d.devicePath)}`
      });
    });
    return options;
  };

  const getSelectedDeviceValue = (settingKey: string, options: { label: string; value: string }[]) => {
    const stored = String(ctx.getSetting(settingKey, "auto") || "auto");
    if (!stored || stored === "auto") return "auto";
    if (stored === "windows_mouse_cursor") return "windows_mouse_cursor";
    const match = options.find(o => o.value === stored || o.value.startsWith(stored + "::") || o.label.includes(stored));
    return match ? match.value : "auto";
  };

  const handleSaveDeviceSetting = (settingKey: string, selectedVal: string) => {
    // Preserve the exact Raw Input path. TeknoParrot cannot bind a physical
    // mouse/lightgun reliably from its friendly PnP name.
    const persistedValue = selectedVal.startsWith("rawinput:")
      ? selectedVal
      : selectedVal.split("::")[0];
    ctx.saveSetting(settingKey, persistedValue, "string");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-2 max-w-[800px] flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Controles & Dispositivos</h2>
          <p className="text-sm text-white/40">Gerenciamento nativo de gamepads, pistolas Lightgun, mouses e calibração.</p>
        </div>
        {mainControlTab === 'controles' && (
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
        )}
        {mainControlTab === 'lightgun' && (
          <button
            type="button"
            onClick={() => handleFetchPointingDevices(true)}
            disabled={scanningPointing}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-white/80 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanningPointing ? 'animate-spin text-accent' : ''}`} />
            <span>{scanningPointing ? 'Escaneando...' : 'Reescanear Dispositivos'}</span>
          </button>
        )}
      </div>

      {/* Main 3 Navigation Tabs */}
      <div className="shrink-0 px-6 pb-3 max-w-[800px] flex border-b border-white/10 gap-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'controles', label: 'Controles & Joysticks', icon: Gamepad2 },
          { id: 'lightgun', label: 'Lightguns & Mouse', icon: Crosshair },
          { id: 'opcoes', label: 'Opções', icon: Sliders },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = mainControlTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMainControlTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-accent text-white shadow-lg shadow-accent/20'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Grid content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 pb-6 max-w-[800px] space-y-6 pt-4">
          
          {/* TAB 1: Controles & Joysticks */}
          {mainControlTab === 'controles' && (
            <>
              {/* Connected Controllers Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-white/60">Controles Conectados</h3>
                  <span className="text-xs text-white/40 font-mono">
                    {controllers.length} dispositivo(s) detectado(s)
                  </span>
                </div>

                {controllers.length === 0 ? (
                  <div className="p-8 text-center bg-white/5 border border-white/5 rounded-xl space-y-2">
                    <p className="text-sm text-white/60">Nenhum controle físico conectado.</p>
                    <p className="text-xs text-white/40">Conecte um gamepad via USB ou Bluetooth. Suporte a XInput, DualShock, DualSense, Joy-Cons e genéricos.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {controllers.map((c, i) => {
                      const isSelected = selectedController?.guid === c.guid || (!selectedController && i === 0);
                      const player1Guid = ctx.getSetting("controllers.p1");
                      const player2Guid = ctx.getSetting("controllers.p2");

                      let slotLabel = null;
                      if (player1Guid === c.guid) slotLabel = "P1";
                      else if (player2Guid === c.guid) slotLabel = "P2";

                      return (
                        <div
                          key={c.guid || c.instanceId}
                          onClick={() => setSelectedController(c)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected 
                              ? 'bg-accent/10 border-accent text-white shadow-lg shadow-accent/10' 
                              : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/80'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              isSelected ? 'bg-accent text-white' : 'bg-white/10 text-white/60'
                            }`}>
                              {slotLabel || `C${i + 1}`}
                            </div>
                            <div className="truncate">
                              <h4 className="text-xs font-bold text-white truncate">{c.name}</h4>
                              <p className="text-[10px] text-white/40 font-mono truncate">
                                {c.type === 'xinput' ? 'XInput' : 'DirectInput / HID'} • {c.buttons} Bts
                              </p>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Controller Panel */}
              {controllers.length > 0 && (() => {
                const activeController = selectedController || controllers[0];
                if (!activeController) return null;
                const config = controllerConfigs[activeController.guid] || {};

                const btnMap = [
                  { id: 0, label: 'A' }, { id: 1, label: 'B' },
                  { id: 2, label: 'X' }, { id: 3, label: 'Y' },
                  { id: 4, label: 'LB' }, { id: 5, label: 'RB' },
                  { id: 6, label: 'LT' }, { id: 7, label: 'RT' },
                  { id: 8, label: 'Select' }, { id: 9, label: 'Start' },
                  { id: 10, label: 'L3' }, { id: 11, label: 'R3' }
                ];

                return (
                  <div className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl space-y-4 shadow-lg flex flex-col justify-between">
                    
                    {/* Device Sub-tab navigation */}
                    <div className="flex border-b border-white/5 pb-2 overflow-x-auto scrollbar-none gap-1">
                      {[
                        { id: 'configuracoes', label: 'Ajustes Rápidos', icon: Sliders },
                        { id: 'testes', label: 'Teste em Tempo Real', icon: CheckCircle },
                        { id: 'calibracao', label: 'Calibração', icon: Circle },
                        { id: 'mapeamento', label: 'Mapeamento', icon: Wrench },
                        { id: 'informacoes', label: 'Informações', icon: Info },
                      ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeControlSubTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveControlSubTab(tab.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                              isActive 
                                ? 'bg-accent text-white shadow shadow-accent/20' 
                                : 'text-white/50 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Sub-tab 1: Quick Settings */}
                    {activeControlSubTab === "configuracoes" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Player Slot Assignment */}
                          <div className="p-3 bg-white/2 border border-white/5 rounded-lg space-y-2 text-left">
                            <label className="text-xs font-bold text-white/80 block">Atribuição de Jogador</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleAssignPlayerSlot(1, activeController.guid)}
                                className={`flex-1 py-1.5 rounded text-xs font-bold transition cursor-pointer ${
                                  ctx.getSetting("controllers.p1") === activeController.guid
                                    ? 'bg-accent text-white'
                                    : 'bg-white/10 text-white/60 hover:bg-white/15'
                                }`}
                              >
                                Jogador 1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAssignPlayerSlot(2, activeController.guid)}
                                className={`flex-1 py-1.5 rounded text-xs font-bold transition cursor-pointer ${
                                  ctx.getSetting("controllers.p2") === activeController.guid
                                    ? 'bg-accent text-white'
                                    : 'bg-white/10 text-white/60 hover:bg-white/15'
                                }`}
                              >
                                Jogador 2
                              </button>
                            </div>
                          </div>

                          {/* Vibrations Toggle */}
                          <div className="p-3 bg-white/2 border border-white/5 rounded-lg flex items-center justify-between text-left">
                            <div>
                              <label className="text-xs font-bold text-white/80 block">Vibração (Rumble)</label>
                              <span className="text-[10px] text-white/40">Feedback tátil nos jogos suportados</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={config.enableVibration !== false}
                              onChange={(e) => handleSaveControllerConfig(activeController.guid, { enableVibration: e.target.checked })}
                              className="w-4 h-4 accent-accent rounded cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Deadzones controls */}
                        <div className="p-4 bg-white/2 border border-white/5 rounded-lg space-y-3 text-left">
                          <h4 className="text-xs font-bold text-white">Deadzone (Zona Morta dos Analógicos)</h4>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-white/60">Stick Esquerdo</span>
                              <span className="font-mono text-accent">{config.deadzoneLeft ?? 15}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="50"
                              value={config.deadzoneLeft ?? 15}
                              onChange={(e) => handleSaveControllerConfig(activeController.guid, { deadzoneLeft: parseInt(e.target.value, 10) })}
                              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-white/60">Stick Direito</span>
                              <span className="font-mono text-accent">{config.deadzoneRight ?? 15}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="50"
                              value={config.deadzoneRight ?? 15}
                              onChange={(e) => handleSaveControllerConfig(activeController.guid, { deadzoneRight: parseInt(e.target.value, 10) })}
                              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 2: Realtime Test */}
                    {activeControlSubTab === "testes" && (
                      <div className="p-4 bg-white/2 border border-white/5 rounded-xl flex flex-col md:flex-row items-stretch gap-6 text-left">
                        <div className="flex-1 min-w-0 space-y-4 pr-0 md:pr-4 md:border-r border-white/5">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-white">Teste em Tempo Real</h4>
                            <span className="text-[9px] font-bold text-green-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              {gamepadState ? 'Conectado' : 'Aguardando Entrada'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {btnMap.map(btn => {
                              const pressed = gamepadState?.buttons[btn.id]?.pressed;
                              return (
                                <span
                                  key={btn.id}
                                  className={`w-9 h-9 rounded-lg font-bold text-xs flex items-center justify-center transition-all border ${
                                    pressed 
                                      ? 'bg-accent border-accent text-white scale-105 shadow shadow-accent/20' 
                                      : 'bg-white/5 border-white/5 text-white/30'
                                  }`}
                                >
                                  {btn.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 3: Calibration */}
                    {activeControlSubTab === "calibracao" && (
                      <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4">
                        <div className="space-y-1 text-left">
                          <h4 className="text-xs font-bold text-white">Módulos de Calibração</h4>
                          <p className="text-xs text-white/40">Calibre a folga de ponto morto do controle atual para jogos competitivos.</p>
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

                    {/* Sub-tab 4: Mapping Wizard */}
                    {activeControlSubTab === "mapeamento" && (
                      <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4 text-left">
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <div>
                            <h4 className="text-xs font-bold text-white">Wizard de Mapeamento</h4>
                            <p className="text-xs text-white/40">Mapeie os botões e analógicos do seu controle manualmente.</p>
                          </div>
                          {wizardStep === null ? (
                            <button
                              type="button"
                              onClick={() => {
                                setWizardStep(0);
                                setWizardMappings({});
                              }}
                              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/80 text-white text-xs font-bold transition cursor-pointer"
                            >
                              Iniciar Mapeamento
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setWizardStep(null)}
                              className="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-400 text-xs font-bold transition cursor-pointer"
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
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <h5 className="text-xs font-bold text-white/60 uppercase tracking-wider">Perfil de Entrada:</h5>
                            <div className="p-3 bg-black/25 border border-white/5 rounded-lg text-xs space-y-2">
                              <p className="text-white/80">O layout de entrada do controle é carregado do arquivo central <span className="font-mono text-accent">input.json</span>.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sub-tab 5: Technical Info */}
                    {activeControlSubTab === "informacoes" && (
                      <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-3 text-left">
                        <h4 className="text-xs font-bold text-white mb-2">Informações Técnicas do Dispositivo</h4>
                        <div className="space-y-1 font-mono text-xs text-white/70">
                          <p><span className="text-white/40">Nome:</span> {activeController.name}</p>
                          <p><span className="text-white/40">GUID:</span> {activeController.guid}</p>
                          <p><span className="text-white/40">Tipo:</span> {activeController.type}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Global joystick settings */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h3 className="text-sm font-semibold text-white/60">Configurações Globais de Joystick</h3>
                <SettingToggle label="Mostrar Notificações de Controle" name="ShowControllerNotifications" ctx={ctx} />
                <SettingToggle label="Mostrar Atividade do Controle" name="ShowControllerActivity" ctx={ctx} />
              </div>
            </>
          )}

          {/* TAB 2: Lightguns & Mouse */}
          {mainControlTab === 'lightgun' && (
            <div className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl space-y-5 shadow-lg text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4 text-accent" />
                    Dispositivos de Mira & Lightgun (TeknoParrot / Arcade)
                  </h4>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    Configuração global de mouses e pistolas (Sinden, Gun4IR, AimTrak) para jogos arcade
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleFetchPointingDevices(true)}
                  disabled={scanningPointing}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-white/80 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanningPointing ? 'animate-spin text-accent' : ''}`} />
                  <span>{scanningPointing ? 'Escaneando...' : 'Reescanear Dispositivos'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Mouse Principal */}
                {(() => {
                  const opts = buildDeviceOptions("○ Auto (Recomendado)", pointingDevices);
                  const selectedVal = getSelectedDeviceValue("RIESCADE.TPMouseDevice", opts);

                  return (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-white/80 flex items-center gap-1">
                        <MousePointer className="w-3.5 h-3.5 text-accent" />
                        Mouse Principal
                      </label>
                      <Select.Root value={selectedVal} onValueChange={(val) => handleSaveDeviceSetting("RIESCADE.TPMouseDevice", val)}>
                        <Select.Trigger className="w-full flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10 hover:border-accent focus:border-accent transition cursor-pointer focus:outline-none min-h-[34px] text-left">
                          <Select.Value />
                          <Select.Icon>
                            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-[#121620] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-100 min-w-[var(--radix-select-trigger-width)]">
                            <Select.Viewport className="p-1 max-h-[220px]">
                              {opts.map(opt => (
                                <Select.Item
                                  key={opt.value}
                                  value={opt.value}
                                  className="relative flex items-center justify-between pl-7 pr-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-md outline-none cursor-pointer select-none data-[state=checked]:text-white data-[state=checked]:bg-white/10"
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
                    </div>
                  );
                })()}

                {/* Teclado Raw Input */}
                {(() => {
                  const opts = buildKeyboardOptions(pointingDevices);
                  const selectedVal = getSelectedDeviceValue("RIESCADE.TPKeyboardDevice", opts);
                  return (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-white/80 flex items-center gap-1">
                        Teclado
                      </label>
                      <Select.Root value={selectedVal} onValueChange={(val) => handleSaveDeviceSetting("RIESCADE.TPKeyboardDevice", val)}>
                        <Select.Trigger className="w-full flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10 hover:border-accent focus:border-accent transition cursor-pointer focus:outline-none min-h-[34px] text-left">
                          <Select.Value />
                          <Select.Icon><ChevronDown className="w-3.5 h-3.5 text-white/40" /></Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-[#121620] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[9999] min-w-[var(--radix-select-trigger-width)]">
                            <Select.Viewport className="p-1 max-h-[220px]">
                              {opts.map(opt => (
                                <Select.Item key={opt.value} value={opt.value} className="relative flex items-center pl-7 pr-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-md outline-none cursor-pointer data-[state=checked]:bg-white/10">
                                  <Select.ItemText>{opt.label}</Select.ItemText>
                                  <Select.ItemIndicator className="absolute left-2"><Check className="w-3 h-3 text-accent" /></Select.ItemIndicator>
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>
                  );
                })()}

                {/* Lightgun P1 */}
                {(() => {
                  const opts = buildDeviceOptions("○ Auto (Sinden → Gun4IR → AimTrak)", pointingDevices);
                  const selectedVal = getSelectedDeviceValue("RIESCADE.TPLightgun1Device", opts);

                  return (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-white/80 flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-cyan-400" />
                        Lightgun P1 (Pistola 1)
                      </label>
                      <Select.Root value={selectedVal} onValueChange={(val) => handleSaveDeviceSetting("RIESCADE.TPLightgun1Device", val)}>
                        <Select.Trigger className="w-full flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10 hover:border-accent focus:border-accent transition cursor-pointer focus:outline-none min-h-[34px] text-left">
                          <Select.Value />
                          <Select.Icon>
                            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-[#121620] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-100 min-w-[var(--radix-select-trigger-width)]">
                            <Select.Viewport className="p-1 max-h-[220px]">
                              {opts.map(opt => (
                                <Select.Item
                                  key={opt.value}
                                  value={opt.value}
                                  className="relative flex items-center justify-between pl-7 pr-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-md outline-none cursor-pointer select-none data-[state=checked]:text-white data-[state=checked]:bg-white/10"
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
                    </div>
                  );
                })()}

                {/* Lightgun P2 */}
                {(() => {
                  const opts = buildDeviceOptions("○ Auto (Pistola 2 Detectada)", pointingDevices);
                  const selectedVal = getSelectedDeviceValue("RIESCADE.TPLightgun2Device", opts);

                  return (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-white/80 flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-pink-400" />
                        Lightgun P2 (Pistola 2)
                      </label>
                      <Select.Root value={selectedVal} onValueChange={(val) => handleSaveDeviceSetting("RIESCADE.TPLightgun2Device", val)}>
                        <Select.Trigger className="w-full flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10 hover:border-accent focus:border-accent transition cursor-pointer focus:outline-none min-h-[34px] text-left">
                          <Select.Value />
                          <Select.Icon>
                            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-[#121620] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-100 min-w-[var(--radix-select-trigger-width)]">
                            <Select.Viewport className="p-1 max-h-[220px]">
                              {opts.map(opt => (
                                <Select.Item
                                  key={opt.value}
                                  value={opt.value}
                                  className="relative flex items-center justify-between pl-7 pr-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-md outline-none cursor-pointer select-none data-[state=checked]:text-white data-[state=checked]:bg-white/10"
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
                    </div>
                  );
                })()}
              </div>

              {/* Keyboard Coin & Start binding toggle */}
              <div className="pt-3 border-t border-white/5 space-y-2">
                <h5 className="text-xs font-bold text-white/80">Atribuição de Teclado para Jogos de Pistola</h5>
                <SettingToggle
                  label="Vincular Teclas de Teclado para Moeda (5) e Start (1)"
                  name="RIESCADE.TPAssignKeyboardCoinStart"
                  desc="Garante que as teclas 5 (Ficha) e 1 (Start) do teclado funcionem em jogos Arcade de pistola no TeknoParrot"
                  ctx={ctx}
                />
              </div>

              {/* Detected Devices Badges */}
              <div className="pt-3 border-t border-white/5">
                <div className="text-[10px] font-bold uppercase text-white/30 tracking-wider mb-2 flex justify-between items-center">
                  <span>Dispositivos HID de Mira Detectados ({pointingDevices.length})</span>
                  {lastPointingScanTime && (
                    <span className="normal-case font-normal text-white/25">
                      Último scan: {new Date(lastPointingScanTime).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pointingDevices.map(d => (
                    <span
                      key={d.id}
                      className={`text-[10px] px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 ${
                        d.type === 'sinden' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' :
                        d.type === 'gun4ir' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                        d.type === 'aimtrak' ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' :
                        d.type === 'touchscreen' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                        'bg-white/5 border-white/10 text-white/70'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {d.friendlyName || d.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Opções */}
          {mainControlTab === 'opcoes' && (
            <div className="space-y-4">
              <div className="p-5 bg-white/2 border border-white/5 rounded-xl space-y-4 text-left">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-white">Debug & Diagnóstico de Entrada (SDL3)</h4>
                    <p className="text-xs text-white/40">Monitore eventos e relatórios técnicos do subsistema de entrada.</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={copyControllerId}
                      className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3 text-accent" />
                      Copiar ID
                    </button>
                    <button
                      type="button"
                      onClick={exportDebugReport}
                      className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-accent" />
                      Exportar Relatório
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-white/60 uppercase tracking-wider">Console de Eventos em Tempo Real:</h5>
                  <div className="h-44 overflow-y-auto bg-black/45 border border-white/5 p-2.5 rounded-lg font-mono text-xs text-green-400 space-y-1 select-text scrollbar-thin">
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

              {/* General Options */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h3 className="text-sm font-semibold text-white/60">Configurações Gerais de Entrada</h3>
                <SettingToggle label="Mostrar Notificações de Controle" name="ShowControllerNotifications" ctx={ctx} />
                <SettingToggle label="Mostrar Atividade do Controle" name="ShowControllerActivity" ctx={ctx} />
              </div>
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}

export default React.memo(SettingsControlsComponent);
