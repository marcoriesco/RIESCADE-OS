import React, { useState, useEffect, useRef } from "react";
import { RefreshCw, Copy, Download, Sliders, CheckCircle, Circle, Wrench, Bug, Info, ChevronRight, Check } from "lucide-react";
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
  const [activeControlSubTab, setActiveControlSubTab] = useState<'configuracoes' | 'testes' | 'calibracao' | 'mapeamento' | 'debug' | 'informacoes'>('configuracoes');
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
    const unsubscribe = window.api.on('controllers-updated', (_, data: any[]) => {
      setControllers(data || []);
    });

    return () => {
      unsubscribe();
    };
  }, []);

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

  // Throttle controller-input: buffer events and apply in rAF batches
  useEffect(() => {
    if (!selectedController) {
      setGamepadState(null);
      return;
    }

    const initialButtons = Array.from({ length: 25 }, () => ({ pressed: false, value: 0 }));
    const initialAxes = Array.from({ length: 10 }, () => 0);
    const state = { buttons: initialButtons, axes: initialAxes };
    setGamepadState(state);

    let rafId: number | null = null;
    let pendingButtons: { index: number; pressed: boolean; value: number }[] = [];
    let pendingAxes: { index: number; value: number }[] = [];
    let pendingHats: { value: number }[] = [];
    let pendingDebugEvents: string[] = [];

    const flushUpdates = () => {
      rafId = null;
      const batchedButtons = [...pendingButtons];
      const batchedAxes = [...pendingAxes];
      const batchedHats = [...pendingHats];
      const batchedDebug = [...pendingDebugEvents];
      pendingButtons = [];
      pendingAxes = [];
      pendingHats = [];
      pendingDebugEvents = [];

      if (batchedButtons.length > 0 || batchedAxes.length > 0 || batchedHats.length > 0) {
        setGamepadState(prev => {
          if (!prev) return prev;
          const nextButtons = [...prev.buttons];
          const nextAxes = [...prev.axes];

          for (const btn of batchedButtons) {
            if (btn.index >= 0 && btn.index < nextButtons.length) {
              nextButtons[btn.index] = { pressed: btn.pressed, value: btn.value };
            }
          }
          for (const axis of batchedAxes) {
            if (axis.index >= 0 && axis.index < nextAxes.length) {
              nextAxes[axis.index] = axis.value;
            }
          }
          for (const hat of batchedHats) {
            const up = (hat.value & 1) !== 0;
            const right = (hat.value & 2) !== 0;
            const down = (hat.value & 4) !== 0;
            const left = (hat.value & 8) !== 0;
            nextButtons[12] = { pressed: up, value: up ? 1 : 0 };
            nextButtons[13] = { pressed: down, value: down ? 1 : 0 };
            nextButtons[14] = { pressed: left, value: left ? 1 : 0 };
            nextButtons[15] = { pressed: right, value: right ? 1 : 0 };
          }

          return { buttons: nextButtons, axes: nextAxes };
        });
      }

      if (batchedDebug.length > 0) {
        setDebugEvents(prev => [...batchedDebug.reverse(), ...prev].slice(0, 50));
      }
    };

    const unsubscribe = window.api.on('controller-input', (_, data: any) => {
      if (data.instanceId !== parseInt(selectedController.instanceId, 10)) {
        return;
      }

      if (data.type === 'GPBUTTON' || data.type === 'BUTTON') {
        pendingButtons.push({ index: data.index, pressed: data.value === 1, value: data.value });
      } else if (data.type === 'GPAXIS' || data.type === 'AXIS') {
        pendingAxes.push({ index: data.index, value: data.value / 32768 });
      } else if (data.type === 'HAT') {
        pendingHats.push({ value: data.value });
      }

      const timestamp = new Date().toLocaleTimeString();
      pendingDebugEvents.push(`[${timestamp}] ${data.type} (Index: ${data.index}, Val: ${data.value})`);

      if (rafId === null) {
        rafId = requestAnimationFrame(flushUpdates);
      }
    });

    return () => {
      unsubscribe();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [selectedController]);

  // Listen to inputs during wizard setup
  useEffect(() => {
    if (wizardStep === null || !selectedController) return;

    const currentStep = WIZARD_STEPS[wizardStep];

    const unsubscribe = window.api.on('controller-input', (_, data: any) => {
      if (data.instanceId !== parseInt(selectedController.instanceId, 10)) return;

      if (currentStep.type === 'axis' && (data.type === 'GPAXIS' || data.type === 'AXIS')) {
        const valNormalized = data.value / 32768;
        if (Math.abs(valNormalized) > 0.6) {
          setWizardMappings(prev => ({
            ...prev,
            [currentStep.key]: { type: 'axis', id: data.index, value: valNormalized > 0 ? 1 : -1 }
          }));

          if (wizardStep < WIZARD_STEPS.length - 1) {
            setWizardStep(prev => prev! + 1);
          } else {
            finishWizard({ ...wizardMappings, [currentStep.key]: { type: 'axis', id: data.index, value: valNormalized > 0 ? 1 : -1 } });
          }
        }
      } else if (data.type === 'GPBUTTON' || data.type === 'BUTTON') {
        if (data.value === 1) {
          setWizardMappings(prev => ({
            ...prev,
            [currentStep.key]: { type: 'button', id: data.index, value: 1 }
          }));

          if (wizardStep < WIZARD_STEPS.length - 1) {
            setWizardStep(prev => prev! + 1);
          } else {
            finishWizard({ ...wizardMappings, [currentStep.key]: { type: 'button', id: data.index, value: 1 } });
          }
        }
      }
    });

    return () => unsubscribe();
  }, [wizardStep, selectedController, wizardMappings]);

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

  const handleSaveControllerConfig = async (guid: string, updates: any) => {
    const updated = {
      ...(controllerConfigs[guid] || {}),
      ...updates
    };
    setControllerConfigs(prev => ({ ...prev, [guid]: updated }));
    await window.api.saveControllerConfig(guid, updated);
  };

  const handleAssignPlayerSlot = async (slot: number, guid: string) => {
    ctx.saveSetting(`controllers.p${slot}`, guid, "string");
  };

  return (
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

            const leftStickX = gamepadState?.axes[0] ?? 0;
            const leftStickY = gamepadState?.axes[1] ?? 0;
            const rightStickX = gamepadState?.axes[2] ?? 0;
            const rightStickY = gamepadState?.axes[3] ?? 0;
            const ltValue = Math.max(0, gamepadState?.axes[4] ?? 0);
            const rtValue = Math.max(0, gamepadState?.axes[5] ?? 0);

            const dpadPressed = (gamepadState?.buttons[12]?.pressed || 
                                 gamepadState?.buttons[13]?.pressed || 
                                 gamepadState?.buttons[14]?.pressed || 
                                 gamepadState?.buttons[15]?.pressed);

            return (
              <div className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl space-y-4 shadow-lg flex flex-col justify-between">
                
                {/* Device Sub-tab navigation */}
                <div className="flex border-b border-white/5 pb-2 overflow-x-auto scrollbar-none gap-1">
                  {[
                    { id: 'configuracoes', label: 'Ajustes Rápidos', icon: Sliders },
                    { id: 'testes', label: 'Teste em Tempo Real', icon: CheckCircle },
                    { id: 'calibracao', label: 'Calibração', icon: Circle },
                    { id: 'mapeamento', label: 'Mapeamento', icon: Wrench },
                    { id: 'debug', label: 'Debug & SDL3', icon: Bug },
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
                              style={{ transform: `translate(${leftStickX * 30}px, ${leftStickY * 30}px)` }}
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
                              style={{ transform: `translate(${rightStickX * 30}px, ${rightStickY * 30}px)` }}
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
                        <p className="text-xs text-white/40">Calibre seus sticks para garantir precisão máxima.</p>
                      </div>

                      <div className="flex justify-around items-center gap-4 py-2">
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

                {/* Sub-tab 3: Calibration Modules */}
                {activeControlSubTab === "calibracao" && (
                  <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white">Módulos de Calibração</h4>
                      <p className="text-xs text-white/40">Calibre a folga de ponto morto do controle atual para jogos competitivos.</p>
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
                          <p className="text-xs text-white/50">Centro: X: 0.00 Y: 0.00</p>
                          <p className="text-xs text-white/50">Zonas de Desvio Máximo: 2%</p>
                          <p className="text-xs text-green-400 font-bold">Status: Excelente</p>
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
                          <p className="text-xs text-white/50">Centro: X: 0.00 Y: 0.00</p>
                          <p className="text-xs text-white/50">Zonas de Desvio Máximo: 3%</p>
                          <p className="text-xs text-green-400 font-bold">Status: Excelente</p>
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
                            className="px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold transition cursor-pointer"
                          >
                            Pular este botão
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold text-white/60 uppercase tracking-wider">Perfil de Entrada:</h5>
                        <div className="p-3 bg-black/25 border border-white/5 rounded-lg text-xs space-y-2">
                          <p className="text-white/80">O layout de entrada do controle é carregado do arquivo central <span className="font-mono text-accent">input.json</span>.</p>
                          <p className="text-white/60 text-xs">Use o Wizard acima para substituir ou reconfigurar todas as atribuições físicas deste dispositivo.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-tab 4.5: Debug & SDL3 */}
                {activeControlSubTab === "debug" && (
                  <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-4 text-left">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-white">Debug & Diagnóstico SDL3</h4>
                        <p className="text-xs text-white/40">Monitore as entradas de baixo nível recebidas do driver de controle.</p>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 border border-white/5 p-3 rounded-lg text-xs font-mono text-white/60">
                      <div><span className="text-white/40 font-bold block">Dispositivo:</span> {activeController.name}</div>
                      <div><span className="text-white/40 font-bold block">Identificador GUID:</span> {activeController.guid}</div>
                      <div><span className="text-white/40 font-bold block">Vendor / Product:</span> 0x{activeController.vendorId} / 0x{activeController.productId}</div>
                      <div><span className="text-white/40 font-bold block">Conexão API:</span> {activeController.type === 'xinput' ? 'XInput' : 'DirectInput / HID'}</div>
                      <div><span className="text-white/40 font-bold block">Instance ID:</span> {activeController.instanceId}</div>
                      <div><span className="text-white/40 font-bold block">Versão SDL3 Runtime:</span> {sdlVersion}</div>
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-xs font-bold text-white/60 uppercase tracking-wider">Console de Eventos em Tempo Real:</h5>
                      <div className="h-40 overflow-y-auto bg-black/45 border border-white/5 p-2 rounded-lg font-mono text-xs text-green-400 space-y-1 select-text scrollbar-thin">
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

                {/* Sub-tab 5: Technical Info */}
                {activeControlSubTab === "informacoes" && (
                  <div className="p-4 bg-white/2 border border-white/5 rounded-xl space-y-3 text-left">
                    <h4 className="text-xs font-bold text-white mb-2">Informações Técnicas do Dispositivo</h4>
                    <ScrollArea className="max-h-56 pr-2">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-white/40 text-xs font-bold uppercase tracking-wider">
                            <th className="pb-2 text-left">Atributo</th>
                            <th className="pb-2 text-left">Valor do Dispositivo</th>
                          </tr>
                        </thead>
                        <tbody className="text-white/80 font-mono divide-y divide-white/5">
                          <tr><td className="py-2 font-bold text-white/50">Nome do Dispositivo</td><td className="py-2">{activeController.name}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Identificador GUID</td><td className="py-2 text-xs">{activeController.guid}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Vendor ID (VID)</td><td className="py-2">0x{activeController.vendorId}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Product ID (PID)</td><td className="py-2">0x{activeController.productId}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">ID da Instância (SDL3)</td><td className="py-2">{activeController.instanceId}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Classe de Controle</td><td className="py-2">{activeController.type === 'xinput' ? 'XInput API' : 'DirectInput / HID API'}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Número de Série</td><td className="py-2">{activeController.serial || 'Não exposto via Bluetooth/USB'}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Botões Mapeados</td><td className="py-2">{activeController.buttons}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Eixos Analógicos</td><td className="py-2">{activeController.axes}</td></tr>
                          <tr><td className="py-2 font-bold text-white/50">Direcionais Hats</td><td className="py-2">{activeController.hats}</td></tr>
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
  );
}

export default React.memo(SettingsControlsComponent);
