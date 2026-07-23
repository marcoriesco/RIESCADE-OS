import React, { useState, useEffect } from "react";
import { Search, Folder, Star, Edit3, X, ChevronLeft, ChevronRight, Filter, HardDrive, RefreshCw, Eye, EyeOff, Save, Gamepad2, Cpu, Trash2, Database, Loader2 } from "lucide-react";
import { ScrollArea } from "./ScrollArea";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

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

export default function DatabaseApp() {
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
          <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">RIESCADE OS</div>
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
              <span className="text-xs text-white/40 uppercase tracking-wider font-mono">Carregando Tabelas e Metadados...</span>
            </div>
          </div>
        )}
          
        {/* TAB: GAMES LIST */}
        {tab === "games" && (
          <div className="flex-1 flex flex-col overflow-hidden pt-10 p-6">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Jogos Catalogados</h2>
                <p className="text-xs text-white/40">Total: {dbTotalGames} jogos encontrados</p>
              </div>

              {/* Filters/Actions Bar */}
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 w-[280px] hover:border-accent focus-within:border-accent transition duration-200 group">
                <Search className="w-3.5 h-3.5 text-white/40 group-focus-within:text-accent transition duration-200" />
                <input
                  type="text"
                  value={dbSearch}
                  onChange={(e) => setDbSearch(e.target.value)}
                  placeholder="Buscar jogo..."
                  className="bg-transparent border-none text-xs focus:outline-none w-full text-white"
                />
                {dbSearch && (
                  <button type="button" onClick={handleClearSearch} className="text-white/40 hover:text-white transition p-0.5 cursor-pointer" title="Limpar busca">
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
                          <span className="block text-xs text-white/30 truncate">{game.path}</span>
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
                    <span className="text-xs uppercase font-bold tracking-wider">Jogos Catalogados</span>
                    <Gamepad2 className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-2xl font-black mt-2 text-white">{dbStats?.totalGames || 0}</span>
                  <span className="text-[9px] text-white/30">ROMs indexadas no total</span>
                </div>
                <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-white/40">
                    <span className="text-xs uppercase font-bold tracking-wider">Sistemas Ativos</span>
                    <Folder className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-2xl font-black mt-2 text-white">{dbStats?.totalSystems || 0}</span>
                  <span className="text-[9px] text-white/30">Consoles catalogados</span>
                </div>
                <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-white/40">
                    <span className="text-xs uppercase font-bold tracking-wider">Tamanho do Banco</span>
                    <HardDrive className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-2xl font-black mt-2 text-white">
                    {dbStats?.dbSize ? `${(dbStats.dbSize / 1024 / 1024).toFixed(2)} MB` : "0.00 MB"}
                  </span>
                  <span className="text-[9px] text-white/30">Arquivo riescade.db</span>
                </div>
                <div className="rounded-md border border-white/5 bg-white/5 p-4 flex flex-col gap-1 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-white/40">
                    <span className="text-xs uppercase font-bold tracking-wider">Último Sync</span>
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
                      <span className="text-xs text-white/40">Executa a limpeza física e compacta o arquivo do SQLite. Recomendado se você editou ou removeu muitos jogos.</span>
                    </div>
                    <button
                      onClick={handleVacuum}
                      className="px-3.5 py-1.5 rounded-md bg-accent text-white font-semibold hover:bg-accent-hover transition shrink-0 cursor-pointer text-xs"
                    >
                      Executar Vacuum
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-black/20 rounded-md border border-white/5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white/90 text-red-400">Reconstruir Banco (Rebuild)</span>
                      <span className="text-xs text-white/40">Limpa todas as tabelas do banco de dados e reconstrói do zero varrendo os arquivos físicos e importando arquivos XML novamente.</span>
                    </div>
                    <button
                      disabled={isRebuilding}
                      onClick={handleRebuild}
                      className="px-3.5 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-semibold transition shrink-0 cursor-pointer disabled:opacity-30 text-xs"
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
                  <span className="text-xs text-accent uppercase tracking-widest font-black block">{editForm.system}</span>
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
                        <input type="text" value={editForm.developer || ""} onChange={(e) => setEditForm({ ...editForm, developer: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Distribuidora</label>
                        <input type="text" value={editForm.publisher || ""} onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Gênero</label>
                        <input type="text" value={editForm.genre || ""} onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Jogadores</label>
                        <input type="text" value={editForm.players || ""} onChange={(e) => setEditForm({ ...editForm, players: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Ano</label>
                        <input type="text" value={editForm.releasedate || ""} onChange={(e) => setEditForm({ ...editForm, releasedate: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <label className="flex items-center gap-2 bg-black/20 p-2 border border-white/5 rounded-md cursor-pointer select-none">
                        <input type="checkbox" checked={editForm.favorite === true} onChange={(e) => setEditForm({ ...editForm, favorite: e.target.checked })} className="accent-range" />
                        <span>Favorito</span>
                      </label>
                      <label className="flex items-center gap-2 bg-black/20 p-2 border border-white/5 rounded-md cursor-pointer select-none">
                        <input type="checkbox" checked={editForm.hidden === true} onChange={(e) => setEditForm({ ...editForm, hidden: e.target.checked })} className="accent-range" />
                        <span>Oculto</span>
                      </label>
                      <label className="flex items-center gap-2 bg-black/20 p-2 border border-white/5 rounded-md cursor-pointer select-none">
                        <input type="checkbox" checked={editForm.kidgame === true} onChange={(e) => setEditForm({ ...editForm, kidgame: e.target.checked })} className="accent-range" />
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
                        <input type="text" value={editForm.emulator || "auto"} onChange={(e) => setEditForm({ ...editForm, emulator: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Core / Núcleo</label>
                        <input type="text" value={editForm.core || "auto"} onChange={(e) => setEditForm({ ...editForm, core: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Placa de Arcade</label>
                        <input type="text" value={editForm.arcadesystem || ""} onChange={(e) => setEditForm({ ...editForm, arcadesystem: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Família do Jogo</label>
                        <input type="text" value={editForm.gamefamily || ""} onChange={(e) => setEditForm({ ...editForm, gamefamily: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                    </div>
                  </div>
                )}

                {/* FILES TAB */}
                {editTab === "files" && (
                  <div className="space-y-3 text-xs">
                    <div className="flex flex-col gap-1">
                      <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Caminho Relativo da ROM</label>
                      <input type="text" readOnly value={editForm.path || ""} className="bg-white/5 border border-white/5 rounded-md p-2 text-white/50 cursor-not-allowed select-all" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">MD5 Hash</label>
                        <input type="text" value={editForm.md5 || ""} onChange={(e) => setEditForm({ ...editForm, md5: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">CRC32</label>
                        <input type="text" value={editForm.crc32 || ""} onChange={(e) => setEditForm({ ...editForm, crc32: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Tempo de Jogo (Segundos)</label>
                        <input type="number" value={editForm.gametime || 0} onChange={(e) => setEditForm({ ...editForm, gametime: parseInt(e.target.value) || 0 })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Vezes Jogado (Playcount)</label>
                        <input type="number" value={editForm.playcount || 0} onChange={(e) => setEditForm({ ...editForm, playcount: parseInt(e.target.value) || 0 })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Scraper Nome</label>
                        <input type="text" value={editForm.scrapName || ""} onChange={(e) => setEditForm({ ...editForm, scrapName: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-white/40 font-semibold uppercase tracking-wider text-[9px]">Scraper Data</label>
                        <input type="text" value={editForm.scrapDate || ""} onChange={(e) => setEditForm({ ...editForm, scrapDate: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-2 text-white focus:outline-none focus:border-accent hover:border-accent transition duration-200" />
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
                      { field: "wheel", name: "Logotipo Redondo (Wheel)" },
                      { field: "mix", name: "Imagem Composta (Mix)" },
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
                <p className="text-xs text-white/40 leading-normal pl-5">
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
