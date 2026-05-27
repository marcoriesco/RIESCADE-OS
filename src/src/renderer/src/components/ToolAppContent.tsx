import React, { useState } from "react";
import { ChevronRight, Search, Folder, Trophy, Star } from "lucide-react";
import { System, SettingsCtx } from "../types";
import { TOOL_APPS, getSystemTheme } from "../constants";
import {
  SettingGroup, SettingToggle, SettingSelect, SettingSlider, SettingInput, SettingInfo
} from "./SettingsComponents";
import { ScrollArea } from "./ScrollArea";

export default function ToolAppContent({
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
      <ScrollArea className="p-6 h-full text-white">
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
      </ScrollArea>
    );
  }

  if (appId === "saves") {
    return (
      <ScrollArea className="p-5 h-full text-white">
        <h2 className="text-lg font-bold mb-1">Gerenciador de Saves</h2>
        <p className="text-xs text-white/50 mb-4">Sincronização local automática de slots de emuladores</p>
        
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
              <div 
                className="aspect-video flex items-center justify-center text-white/30 text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.25), var(--accent-color-light))' }}
              >
                Slot {i + 1}
              </div>
              <div className="p-3 text-xs flex flex-col gap-1 bg-black/20">
                <span className="font-semibold text-white/90">Slot de Backup {i + 1}</span>
                <span className="text-[10px] text-white/40">Há {i + 1} horas atrás · Automático</span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
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
      const defaultValue = (name === "RIESCADE.ShowDesktopIcons" || name === "RIESCADE.DynamicBackground") ? "true" : "false";
      const v = getSetting(name, defaultValue);
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
      return ["tool:library", "tool:saves", "tool:achievements"];
    };
    const getTaskbarIcons = () => {
      const raw = settings?.["Taskbar.Icons"]?.value;
      if (raw !== undefined) return String(raw).split(",").filter(Boolean);
      return ["tool:library", "tool:saves", "tool:achievements", "tool:settings"];
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
      { id: "personalizacao", name: "Personalização" },
      { id: "controles", name: "Controles" },
      { id: "audio", name: "Áudio" },
      { id: "avancado", name: "Avançado" },
      { id: "sobre", name: "Sobre" }
    ];

    return (
      <div className="flex h-full text-white">
        {/* Sidebar */}
        <aside className="w-48 bg-black/20 border-r border-white/5 p-3 flex flex-col gap-1 select-none shrink-0">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition cursor-pointer ${
                activeSettingsTab === tab.id 
                  ? "bg-accent-light text-accent font-semibold border-l-2 border-accent rounded-l-none pl-2.5" 
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>{tab.name}</span>
            </button>
          ))}
        </aside>
        
        <div className="flex-1 p-5 flex flex-col h-full overflow-hidden">
          {/* ===== TAB: JOGOS ===== */}
          {activeSettingsTab === "jogos" && (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
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
            </ScrollArea>
          )}

          {/* ===== TAB: INTERFACE ===== */}
          {activeSettingsTab === "interface" && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="shrink-0 mb-4">
                <h2 className="text-lg font-bold mb-1">Interface</h2>
                <p className="text-xs text-white/50">Aparência, ícones do desktop/taskbar, tema e idioma.</p>
              </div>

              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-2">
                <SettingGroup label="Ícones do Desktop e Taskbar" />

                {/* Search & Category Filter */}
                <div className="flex items-center gap-3 mb-4 select-none">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                    <input 
                      value={settingsSearch} 
                      onChange={(e) => setSettingsSearch(e.target.value)} 
                      placeholder="Pesquisar ferramentas ou sistemas..."
                      className="w-full bg-[#121212] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition duration-200" 
                    />
                  </div>
                  <div className="flex bg-black/25 p-1 rounded-lg border border-white/5 text-[10px] items-center shrink-0">
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
                    <div key={item.key} className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl p-3 hover:bg-white/5 transition duration-200 select-none">
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
              </ScrollArea>
            </div>
          )}

          {/* ===== TAB: PERSONALIZAÇÃO ===== */}
          {activeSettingsTab === "personalizacao" && (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
              <h2 className="text-lg font-bold mb-1">Personalização</h2>
              <p className="text-xs text-white/50 mb-4">Escolha a cor de destaque para os menus, botões e barras do sistema.</p>

              <SettingGroup label="Cor de Destaque" />
              
              <div className="bg-black/15 border border-white/5 rounded-xl p-4 flex flex-col gap-4">
                <span className="font-semibold text-xs text-white/90">Cores Predefinidas</span>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { name: "Roxo (Padrão)", hex: "#8b5cf6" },
                    { name: "Azul", hex: "#3b82f6" },
                    { name: "Ciano", hex: "#06b6d4" },
                    { name: "Esmeralda", hex: "#10b981" },
                    { name: "Laranja", hex: "#f97316" },
                    { name: "Rosa", hex: "#ec4899" },
                    { name: "Vermelho", hex: "#ef4444" },
                    { name: "Teal", hex: "#14b8a6" }
                  ].map(preset => {
                    const currentAccent = ctx.getSetting("RIESCADE.AccentColor", "#8b5cf6");
                    const isSelected = currentAccent.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        onClick={() => ctx.saveSetting("RIESCADE.AccentColor", preset.hex, "string")}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition hover:bg-white/5 cursor-pointer ${
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
                      className="bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/90 focus:outline-none focus:border-accent w-24 text-center font-mono"
                    />
                    <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/15 cursor-pointer">
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

              <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl px-4 py-3 text-xs hover:bg-white/5 transition">
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
                      className="px-3 py-1.5 rounded-lg bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600/20 hover:text-red-300 font-semibold transition cursor-pointer"
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
                    className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 hover:border-white/20 text-white font-semibold transition cursor-pointer"
                  >
                    Procurar...
                  </button>
                </div>
              </div>
            </div>
          </ScrollArea>
          )}

          {/* ===== TAB: CONTROLES ===== */}
          {activeSettingsTab === "controles" && (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
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
            </ScrollArea>
          )}

          {/* ===== TAB: ÁUDIO ===== */}
          {activeSettingsTab === "audio" && (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
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
            </ScrollArea>
          )}

          {/* ===== TAB: AVANÇADO ===== */}
          {activeSettingsTab === "avancado" && (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
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
              <SettingToggle label="Gravar posições das janelas" name="RIESCADE.SaveWindowPositions" desc="Gravar posições e tamanhos de todas as janelas do sistema operacional." ctx={ctx} />
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
            </ScrollArea>
          )}

          {/* ===== TAB: SOBRE ===== */}
          {activeSettingsTab === "sobre" && (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
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
            </ScrollArea>
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

  return null;
}
