import React, { useEffect, useRef, useState, useMemo } from "react";
import { Gamepad2, Heart, Loader2, Star, Play, ChevronRight, Maximize2, X, Search } from "lucide-react";
import { System, Game } from "../types";
import { ScrollArea } from "./ScrollArea";
import { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";


export default function SystemAppContent({
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
  const gridContainerRef = useRef<OverlayScrollbarsComponentRef>(null);

  // New filter states for metadata tags
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedPlayers, setSelectedPlayers] = useState<string>("all");
  const [selectedMinRating, setSelectedMinRating] = useState<string>("all");

  const [fullVideo, setFullVideo] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [logoPath, setLogoPath] = useState<string>("");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Load Riescade black-and-white fallback logo path once on mount
  useEffect(() => {
    window.api.getRiescadeLogoPath().then((path: string) => {
      setLogoPath(path);
    });
  }, []);

  // Reset display limit when system, search, filter or metadata filters change
  useEffect(() => {
    setDisplayLimit(40);
    const viewport = gridContainerRef.current?.osInstance()?.elements().viewport;
    if (viewport) {
      viewport.scrollTop = 0;
    }
  }, [system, search, filter, selectedGenre, selectedYear, selectedPlayers, selectedMinRating]);

  // Load Games of Platform & Reset Filters
  useEffect(() => {
    setLoading(true);
    setSelectedGenre("all");
    setSelectedYear("all");
    setSelectedPlayers("all");
    setSelectedMinRating("all");
    setFailedImages({});
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

  // Attach scroll listener for infinite scroll
  useEffect(() => {
    let cleanupFn: (() => void) | null = null;
    let cancelled = false;

    const tryAttach = () => {
      if (cancelled) return;
      const osRef = gridContainerRef.current;
      if (!osRef) { setTimeout(tryAttach, 150); return; }
      const inst = osRef.osInstance();
      if (!inst) { setTimeout(tryAttach, 150); return; }

      const viewport = inst.elements().viewport;
      if (!viewport) { setTimeout(tryAttach, 150); return; }

      const onScroll = () => {
        if (viewport.scrollHeight - viewport.scrollTop <= viewport.clientHeight * 1.5) {
          setDisplayLimit(prev => Math.min(filteredGames.length, prev + 40));
        }
      };
      viewport.addEventListener('scroll', onScroll, { passive: true });
      cleanupFn = () => { viewport.removeEventListener('scroll', onScroll); };
    };

    tryAttach();

    return () => {
      cancelled = true;
      cleanupFn?.();
    };
  }, [filteredGames.length]);

  const selectedGame = filteredGames[selectedIdx];

  // Reset image error and fullscreen video when switching games
  useEffect(() => {
    setImageError(false);
    setFullVideo(false);
  }, [selectedGame]);

  const videoUrl = useMemo(() => {
    if (!selectedGame || !selectedGame.video) return "";
    const rawVideo = selectedGame.video;
    return rawVideo.startsWith("http") || rawVideo.startsWith("file://") 
      ? rawVideo 
      : `file:///${rawVideo.replace(/\\/g, '/')}`;
  }, [selectedGame]);

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
      window.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: {
            title: updatedGame.favorite ? "Adicionado aos Favoritos" : "Removido dos Favoritos",
            description: selectedGame.name,
            type: "favorite",
            favorite: updatedGame.favorite
          }
        })
      );
    });
  };

  return (
    <div className="h-full flex text-white overflow-hidden relative w-full bg-transparent">
      <div className="relative z-10 flex w-full h-full overflow-hidden">
      {/* Discord-like Sidebar: Logo + Search + Filters - extends to top */}
      <aside className="w-[240px] bg-black/40 border-r border-white/5 flex flex-col shrink-0 select-none">
        {/* System Logo Section - top padding for drag region */}
        <div className="pt-8 px-4 pb-3 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            {system.logo ? (
              <img src={system.logo} alt={system.fullname} className="w-full h-14 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${color}, rgb(30,30,30))` }}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
          {/* Search */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 group-focus-within:text-accent transition duration-200" />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar em ${system.fullname}...`}
              className="w-full bg-white/5 border border-white/5 rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus-border-accent focus:bg-white/[0.07] transition duration-200"
            />
          </div>
        </div>

        {/* Filters Navigation */}
        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="text-[10px] font-bold uppercase text-white/25 tracking-widest px-3 py-2 mt-1">Filtros</div>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => { setFilter("all"); setSelectedIdx(0); }}
              className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-all cursor-pointer relative ${
                filter === "all" 
                  ? "bg-white/[0.08] text-white font-medium" 
                  : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
              }`}
            >
              <Gamepad2 className={`w-4 h-4 shrink-0 ${filter === "all" ? "text-accent" : "opacity-60"}`} />
              <span>Todos</span>
            </button>
            
            <button
              onClick={() => { setFilter("favorites"); setSelectedIdx(0); }}
              className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-all cursor-pointer relative ${
                filter === "favorites" 
                  ? "bg-white/[0.08] text-white font-medium" 
                  : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
              }`}
            >
              <Heart className={`w-4 h-4 shrink-0 ${filter === "favorites" ? "text-accent" : "opacity-60"}`} />
              <span>Favoritos</span>
            </button>
          </div>

          <div className="w-full h-px bg-white/5 my-3 mx-2" />

          <div className="text-[10px] font-bold uppercase text-white/25 tracking-widest px-3 py-2">Avançados</div>
          <div className="flex flex-col gap-2">

            {/* Genre Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Gênero</span>
          <div className="relative group">
            <select
              value={selectedGenre}
              onChange={(e) => { setSelectedGenre(e.target.value); setSelectedIdx(0); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#121212]">Todos</option>
              {filterOptions.genres.map(g => (
                <option key={g} value={g} className="bg-[#121212]">{g}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40 group-focus-within:text-accent transition duration-200">
              <ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>
        </div>

            {/* Year Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Ano</span>
          <div className="relative group">
            <select
              value={selectedYear}
              onChange={(e) => { setSelectedYear(e.target.value); setSelectedIdx(0); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#121212]">Todos</option>
              {filterOptions.years.map(y => (
                <option key={y} value={y} className="bg-[#121212]">{y}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40 group-focus-within:text-accent transition duration-200">
              <ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>
        </div>

            {/* Players Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Jogadores</span>
          <div className="relative group">
            <select
              value={selectedPlayers}
              onChange={(e) => { setSelectedPlayers(e.target.value); setSelectedIdx(0); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#121212]">Todos</option>
              {filterOptions.players.map(p => (
                <option key={p} value={p} className="bg-[#121212]">{p === "1" ? "1 Jogador" : p === "2" ? "2 Jogadores" : `${p} Jogadores`}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40 group-focus-within:text-accent transition duration-200">
              <ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>
        </div>

            {/* Rating Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Avaliação</span>
          <div className="relative group">
            <select
              value={selectedMinRating}
              onChange={(e) => { setSelectedMinRating(e.target.value); setSelectedIdx(0); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#121212]">Todas</option>
              {filterOptions.ratings.map(r => (
                <option key={r.value} value={r.value} className="bg-[#121212]">{r.label}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40 group-focus-within:text-accent transition duration-200">
              <ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>
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
              className="mt-3 mx-2 w-[calc(100%-16px)] text-[11px] text-accent hover:text-accent-hover font-semibold text-center py-2 rounded-md bg-accent/10 hover:bg-accent/20 transition cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main List */}
      <div className="flex-1 flex overflow-hidden bg-black/10">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header with system name + game count */}
            <div className="shrink-0 px-6 pt-8 pb-3 border-b border-white/5">
              <h2 className="text-xl font-bold text-white tracking-wide">{system.fullname}</h2>
              <span className="text-xs text-white/40">{filteredGames.length} jogos encontrados</span>
            </div>

            {/* Grid display of Games */}
            <ScrollArea 
              ref={gridContainerRef}
              className="flex-1 px-6 py-4"
            >
              {filteredGames.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-white uppercase tracking-widest">Nenhum jogo encontrado</div>
              ) : (
                <div className="grid grid-cols-5 gap-3">
                  {filteredGames.slice(0, displayLimit).map((g, idx) => {
                    const boxArt = g.thumbnail || g.image || g.marquee;
                    const finalImage = boxArt ? (boxArt.startsWith("http") || boxArt.startsWith("file://") ? boxArt : `file:///${boxArt}`) : "";
                    
                    return (
                      <button
                        key={g.path}
                        onClick={() => setSelectedIdx(idx)}
                        onDoubleClick={() => onLaunchGame(g, system)}
                        className={`group flex flex-col w-full rounded-xl overflow-hidden text-left transition-all border-4 relative bg-black/40 ${
                          idx === selectedIdx 
                            ? "border-accent shadow-[0_0_15px_var(--accent-color-glass)] z-10" 
                            : "border-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-center overflow-hidden relative w-full h-full bg-black/20">
                          {finalImage && !failedImages[g.path] ? (
                            <img 
                              src={finalImage} 
                              alt={g.name} 
                              onError={() => setFailedImages(prev => ({ ...prev, [g.path]: true }))}
                              className="max-w-full max-h-full object-cover group-hover:scale-105 transition-all duration-300" 
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center bg-black/50 text-white/30 p-4 text-center w-full h-full select-none">
                              {logoPath ? (
                                <img 
                                  src={logoPath} 
                                  alt="Riescade Logo" 
                                  className="w-16 h-auto object-contain grayscale opacity-40 mb-3 group-hover:scale-105 transition-all duration-300"
                                  style={{ filter: 'grayscale(100%) brightness(0.8)' }}
                                />
                              ) : (
                                <Icon className="w-8 h-8 text-white/20 mb-2" />
                              )}
                              <span className="text-[10px] font-bold text-white/60 line-clamp-3 uppercase tracking-wider">{g.name}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Right Details Panel */}
        {selectedGame && (
          <ScrollArea className="w-[20vw] min-w-[300px] bg-black/50 p-6 pt-14 select-none">
            <div className="flex flex-col gap-4">
              {selectedGame.marquee && !imageError && (
                <div className="w-full flex items-center justify-center overflow-hidden relative shrink-0">
                  <img 
                    src={(() => {
                      const logo = selectedGame.marquee || "";
                      return logo.startsWith("http") || logo.startsWith("file://") ? logo : `file:///${logo.replace(/\\/g, '/')}`;
                    })()} 
                    alt={selectedGame.name} 
                    onError={() => setImageError(true)}
                    className="w-full max-h-40 object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" 
                  />
                </div>
              )}

            {/* Game Playback Video Preview */}
            {videoUrl && (
              <div className="relative group w-full aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/5 shadow-md shrink-0">
                <video 
                  src={videoUrl} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="w-full h-full object-cover" 
                />
                <button
                  onClick={() => setFullVideo(true)}
                  className="absolute bottom-2 right-2 bg-black/70 hover:bg-[var(--accent-color-hover)] text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center shadow-lg cursor-pointer"
                  title="Maximizar Vídeo"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            
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
              <button
                onClick={handleToggleFavorite}
                className="flex items-center gap-1.5 hover:text-red-400 transition-colors font-bold cursor-pointer text-white/70"
              >
                <Heart className={`w-4 h-4 ${selectedGame.favorite ? "fill-red-500 text-red-500" : "text-white/60"}`} />
                <span>{selectedGame.favorite ? "Favorito" : "Favoritar"}</span>
              </button>

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

            <ScrollArea className="text-xs leading-relaxed text-white/60 h-28 pr-1">
              <p>
                {selectedGame.desc || "Nenhuma descrição disponível para este jogo."}
              </p>
            </ScrollArea>

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
              <div className="relative group">
                <select
                  value={selectValue}
                  onChange={handleEmulatorChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer"
                >
                  {emulatorChoices.map(choice => (
                    <option key={choice.value} value={choice.value} className="bg-[#121212] text-white/90">
                      {choice.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40 group-focus-within:text-accent transition duration-200">
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-auto">
              <button
                onClick={() => onLaunchGame(selectedGame, system)}
                className="w-full bg-accent bg-accent-hover hover:scale-[1.02] hover:shadow-lg transition-all rounded-lg py-2.5 text-md font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                Jogar
              </button>
            </div>
          </div>
        </ScrollArea>
        )}
      </div>

      {/* Full Window Video Overlay */}
      {fullVideo && videoUrl && (
        <div className="absolute inset-0 bg-black/95 z-[999] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <button 
            onClick={() => setFullVideo(false)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition cursor-pointer z-[1000]"
            title="Fechar Vídeo"
          >
            <X className="w-5 h-5" />
          </button>
          <video 
            src={videoUrl} 
            autoPlay 
            controls 
            loop 
            className="max-w-[95%] max-h-[90%] rounded-xl border border-white/10 shadow-2xl" 
          />
        </div>
      )}
    </div>
    </div>
  );
}
