import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Gamepad2, Heart, Loader2, Star, Play, ChevronRight, Maximize2, X, Search, Folder, ChevronLeft, HardDrive, ChevronDown, Check, MoreHorizontal } from "lucide-react";
import { System, Game } from "../types";
import { ScrollArea } from "./ScrollArea";
import { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
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
      <Select.Trigger className="w-full flex items-center justify-between bg-[#1a1a1a] border border-white/5 rounded-md px-3 py-2 text-xs text-white/90 hover:bg-white/5 transition cursor-pointer focus:outline-none focus:border-accent">
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
        </Select.Icon>
      </Select.Trigger>
      
      <Select.Portal>
        <Select.Content className="bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-100 min-w-[var(--radix-select-trigger-width)]">
          <Select.Viewport className="p-1">
            {options.map(opt => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center justify-between pl-8 pr-3 py-2 text-xs text-white/80 hover:text-white hover:bg-white/5 rounded-md outline-none cursor-pointer select-none data-[state=checked]:text-white data-[state=checked]:bg-white/5"
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


export default function SystemAppContent({
  system, color, Icon, onLaunchGame, search, setSearch, onActiveGameArtChanged
}: {
  systemName: string;
  system: System;
  color: string;
  Icon: any;
  onLaunchGame: (game: Game, system: System, saveStateSlot?: number) => void;
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
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const pendingAttachRef = useRef<number | null>(null);

  // New filter states for metadata tags
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedPlayers, setSelectedPlayers] = useState<string>("all");
  const [selectedMinRating, setSelectedMinRating] = useState<string>("all");

  const [fullVideo, setFullVideo] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [logoPath, setLogoPath] = useState<string>("");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Collection and Save States states
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [collectionGames, setCollectionGames] = useState<Game[]>([]);
  const [colLoading, setColLoading] = useState(false);
  const [saveStates, setSaveStates] = useState<any[]>([]);
  const [gameCollections, setGameCollections] = useState<string[]>([]);
  const [allCollections, setAllCollections] = useState<string[]>([]);
  const [newColName, setNewColName] = useState("");

  // New States for context menu and saves sidebar
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showSavesSidebar, setShowSavesSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"collections" | "saves">("collections");

  const [preferredMediaType, setPreferredMediaType] = useState<string>("cover");
  const [availableMediaTypes, setAvailableMediaTypes] = useState<Record<string, boolean>>({
    cover: true,
    cover2d: false,
    cover3d: false,
    fanart: false,
    logo: false,
    screenshot: false,
    title: false,
    mix: false
  });

  const [mediaLoading, setMediaLoading] = useState(false);
  const [gridMediaLoading, setGridMediaLoading] = useState(false);



  // Load Riescade black-and-white fallback logo path once on mount
  useEffect(() => {
    window.api.getRiescadeLogoPath().then((path: string) => {
      setLogoPath(path);
    });
  }, []);

  // Load preferred media type per-system on mount and system change
  useEffect(() => {
    const settingKey = `RIESCADE.PreferredMediaType.${system.name}`;
    window.api.getSettings().then(settings => {
      if (settings[settingKey]?.value) {
        setPreferredMediaType(settings[settingKey].value);
      } else {
        setPreferredMediaType("cover");
      }
    });
  }, [system.name]);

  // Query folder availability when systemName or systemPath changes
  useEffect(() => {
    if (system && system.path && !system.path.startsWith('virtual://') && system.name !== 'collections') {
      window.api.checkMediaFolders(system.path).then((res: Record<string, boolean>) => {
        setAvailableMediaTypes(res || {
          cover: true,
          cover2d: false,
          cover3d: false,
          fanart: false,
          logo: false,
          screenshot: false,
          title: false,
          mix: false
        });
      }).catch((err: any) => {
        console.error("Failed to check media folders:", err);
      });
    } else {
      // Enable all for virtual systems
      setAvailableMediaTypes({
        cover: true,
        cover2d: true,
        cover3d: true,
        fanart: true,
        logo: true,
        screenshot: true,
        title: true,
        mix: true
      });
    }
  }, [system.name, system.path]);

  const handleMediaTypeChange = (type: string) => {
    setGridMediaLoading(true);
    setFailedImages({});
    setPreferredMediaType(type);
    const settingKey = `RIESCADE.PreferredMediaType.${system.name}`;
    window.api.saveSetting(settingKey, type, "string");
    // Brief loading overlay for the grid transition
    setTimeout(() => setGridMediaLoading(false), 400);
  };

  const getGameMediaUrl = useCallback((g: Game, type: string) => {
    if (g.isCollectionFolder) return g.cover || g.thumbnail || g.fanart || g.image || "";
    
    let mediaPath: string | undefined = undefined;
    switch (type) {
      case 'cover':
        mediaPath = g.cover;
        break;
      case 'cover2d':
        mediaPath = g.cover2d;
        break;
      case 'cover3d':
        mediaPath = g.cover3d;
        break;
      case 'fanart':
        mediaPath = g.fanart;
        break;
      case 'logo':
        mediaPath = g.logo;
        break;
      case 'screenshot':
        mediaPath = g.screenshot;
        break;
      case 'title':
        mediaPath = g.title || g.titleshot;
        break;
      case 'mix':
        mediaPath = g.mix;
        break;
      default:
        mediaPath = g.cover;
    }

    // No fallback to other media types - only display the selected type

    return mediaPath ? (mediaPath.startsWith("http") || mediaPath.startsWith("file://") ? mediaPath : `file:///${mediaPath}`) : "";
  }, []);

  // Reset display limit when system, search, filter or metadata filters change
  useEffect(() => {
    setDisplayLimit(40);
    const viewport = gridContainerRef.current?.osInstance()?.elements().viewport;
    if (viewport) {
      viewport.scrollTop = 0;
    }
  }, [system.name, activeCollection, search, filter, selectedGenre, selectedYear, selectedPlayers, selectedMinRating]);

  // Single, unified hook to load games, reset filters and manage collection states
  useEffect(() => {
    console.log("[SystemAppContent] unified hook fired: system.name =", system.name, "activeCollection =", activeCollection);
    setLoading(true);
    setSelectedGenre("all");
    setSelectedYear("all");
    setSelectedPlayers("all");
    setSelectedMinRating("all");
    setFailedImages({});
    setSelectedIdx(0);
    setSearch(""); // Reset search to prevent filtering out files on folder changes

    if (system.name === 'collections') {
      if (activeCollection !== null) {
        setColLoading(true);
        console.log("[SystemAppContent] Calling window.api.getCollectionGames for:", activeCollection);
        window.api.getCollectionGames(activeCollection).then((gameList: Game[]) => {
          console.log("[SystemAppContent] getCollectionGames returned games list count:", gameList ? gameList.length : 0);
          setCollectionGames(gameList || []);
          setSelectedIdx(0);
          setColLoading(false);
          setLoading(false);
        }).catch(err => {
          console.error("[SystemAppContent] Error in getCollectionGames promise:", err);
          setCollectionGames([]);
          setColLoading(false);
          setLoading(false);
        });
      } else {
        setCollectionGames([]);
        console.log("[SystemAppContent] Calling window.api.getGames for collections list");
        window.api.getGames(system.name).then((gameList: Game[]) => {
          console.log("[SystemAppContent] getGames(collections) returned folders list count:", gameList ? gameList.length : 0);
          setGames(gameList || []);
          setSelectedIdx(0);
          setLoading(false);
        }).catch(err => {
          console.error("[SystemAppContent] Error in getGames(collections) promise:", err);
          setGames([]);
          setLoading(false);
        });
      }
    } else {
      setActiveCollection(null);
      setCollectionGames([]);
      console.log("[SystemAppContent] Calling window.api.getGames for system:", system.name);
      window.api.getGames(system.name).then((gameList: Game[]) => {
        setGames(gameList || []);
        setSelectedIdx(0);
        setLoading(false);
      }).catch(err => {
        console.error("[SystemAppContent] Error in getGames(system) promise:", err);
        setGames([]);
        setLoading(false);
      });
    }
  }, [system.name, activeCollection]);

  const targetGamesForFiltering = useMemo(() => {
    const isColView = (system.name === 'collections' && activeCollection !== null);
    const list = isColView ? collectionGames : games;
    console.log("[SystemAppContent] Recalculating targetGamesForFiltering. system.name:", system.name, "activeCollection:", activeCollection, "isColView:", isColView, "listLength:", list ? list.length : 0);
    if (system.name === 'collections' && activeCollection !== null) {
      return collectionGames;
    }
    return games;
  }, [system.name, activeCollection, collectionGames, games]);

  // Extract unique genres, years, player options, and ratings from games dynamically
  const filterOptions = useMemo(() => {
    const genresSet = new Set<string>();
    const yearsSet = new Set<string>();
    const playersSet = new Set<string>();
    const ratingsSet = new Set<number>();

    targetGamesForFiltering.forEach(g => {
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
  }, [targetGamesForFiltering]);

  // Apply filters including genre, release year, players, and rating dynamically
  const filteredGames = useMemo(() => {
    const res = targetGamesForFiltering.filter(g => {
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
    console.log("[SystemAppContent] Recalculated filteredGames. original length:", targetGamesForFiltering.length, "filtered length:", res.length, "search query:", search, "games:", res);
    return res;
  }, [targetGamesForFiltering, search, filter, selectedGenre, selectedYear, selectedPlayers, selectedMinRating]);



  // Callback ref to bind scroll listener to ScrollArea viewport robustly
  const handleScrollAreaRef = useCallback((node: OverlayScrollbarsComponentRef | null) => {
    (gridContainerRef as any).current = node;

    if (pendingAttachRef.current !== null) {
      cancelAnimationFrame(pendingAttachRef.current);
      pendingAttachRef.current = null;
    }

    if (scrollCleanupRef.current) {
      scrollCleanupRef.current();
      scrollCleanupRef.current = null;
    }

    if (node) {
      const tryAttach = () => {
        const inst = node.osInstance();
        const viewport = inst?.elements().viewport;
        if (!viewport) {
          pendingAttachRef.current = requestAnimationFrame(tryAttach);
          return;
        }

        const onScroll = () => {
          console.log("[SystemAppContent] onScroll (callback ref) triggered. scrollTop:", viewport.scrollTop, "scrollHeight:", viewport.scrollHeight, "clientHeight:", viewport.clientHeight, "filteredGames.length:", filteredGames.length);
          if (viewport.scrollHeight - viewport.scrollTop <= viewport.clientHeight * 1.5) {
            setDisplayLimit(prev => {
              if (filteredGames.length <= prev) {
                console.log("[SystemAppContent] onScroll: displayLimit already covers all games:", prev, ">=", filteredGames.length);
                return prev;
              }
              const next = Math.min(filteredGames.length, prev + 40);
              console.log("[SystemAppContent] onScroll: Increasing displayLimit from", prev, "to", next);
              return next;
            });
          }
        };

        viewport.addEventListener('scroll', onScroll, { passive: true });
        scrollCleanupRef.current = () => {
          viewport.removeEventListener('scroll', onScroll);
        };
      };

      tryAttach();
    }
  }, [filteredGames.length]);

  const selectedGame = filteredGames[selectedIdx];

  // Reset image error, fullscreen video, context menu and sidebar when switching games
  useEffect(() => {
    setImageError(false);
    setFullVideo(false);
    setShowContextMenu(false);
    setShowSavesSidebar(false);
  }, [selectedGame]);

  // Set mediaLoading to true when selected game or preferred media type changes (if a media URL exists)
  useEffect(() => {
    if (selectedGame && getGameMediaUrl(selectedGame, preferredMediaType)) {
      setMediaLoading(true);
    } else {
      setMediaLoading(false);
    }
  }, [selectedGame?.id, preferredMediaType]);

  // Load save states and collections for the selected game
  useEffect(() => {
    if (selectedGame && !selectedGame.isCollectionFolder) {
      window.api.scanSaveStates(selectedGame.system, selectedGame.path).then((states: any[]) => {
        setSaveStates(states || []);
      }).catch(err => {
        console.error("[SystemAppContent] Error loading scanSaveStates:", err);
        setSaveStates([]);
      });
      window.api.getCollectionsForGame(selectedGame.system, selectedGame.path).then((cols: string[]) => {
        setGameCollections(cols || []);
      }).catch(err => {
        console.error("[SystemAppContent] Error loading getCollectionsForGame:", err);
        setGameCollections([]);
      });
      window.api.getCustomCollections().then((cols: string[]) => {
        setAllCollections(cols || []);
      }).catch(err => {
        console.error("[SystemAppContent] Error loading getCustomCollections:", err);
        setAllCollections([]);
      });
    } else {
      setSaveStates([]);
      setGameCollections([]);
      setAllCollections([]);
    }
  }, [selectedGame]);

  const handleAddToCollection = (colName: string) => {
    if (!selectedGame) return;
    window.api.toggleGameInCollection(colName, selectedGame.system, selectedGame.path, 'add').then((success: boolean) => {
      if (success) {
        setGameCollections(prev => [...prev, colName].sort());
        window.dispatchEvent(
          new CustomEvent("show-toast", {
            detail: {
              title: "Adicionado à Coleção",
              description: `${selectedGame.name} -> ${colName}`,
              type: "collection"
            }
          })
        );
      }
    });
  };

  const handleRemoveFromCollection = (colName: string) => {
    if (!selectedGame) return;
    window.api.toggleGameInCollection(colName, selectedGame.system, selectedGame.path, 'remove').then((success: boolean) => {
      if (success) {
        setGameCollections(prev => prev.filter(c => c !== colName));
        if (system.name === 'collections' && activeCollection === colName) {
          setCollectionGames(prev => prev.filter(g => g.path !== selectedGame.path));
        }
        window.dispatchEvent(
          new CustomEvent("show-toast", {
            detail: {
              title: "Removido da Coleção",
              description: `${selectedGame.name} <- ${colName}`,
              type: "collection"
            }
          })
        );
      }
    });
  };

  const handleCreateAndAddToCollection = () => {
    const trimmed = newColName.trim();
    if (!trimmed || !selectedGame) return;
    window.api.toggleGameInCollection(trimmed, selectedGame.system, selectedGame.path, 'add').then((success: boolean) => {
      if (success) {
        setGameCollections(prev => [...prev, trimmed].sort());
        setAllCollections(prev => {
          if (!prev.includes(trimmed)) {
            return [...prev, trimmed].sort();
          }
          return prev;
        });
        setNewColName("");
        window.dispatchEvent(
          new CustomEvent("show-toast", {
            detail: {
              title: "Coleção Criada e Jogo Adicionado",
              description: `${selectedGame.name} -> ${trimmed}`,
              type: "collection"
            }
          })
        );
      }
    });
  };

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
      const rawArt = selectedGame.fanart || selectedGame.cover || selectedGame.cover3d || selectedGame.image || selectedGame.thumbnail || null;
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

  const handleEmulatorValueChange = (val: string) => {
    if (!selectedGame) return;
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
      <aside className="w-[240px] bg-black/40 flex flex-col shrink-0 select-none">
        {/* System Logo Section - top padding for drag region */}
        <div className="pt-6 p-4 shrink-0">
          <div className="flex items-center gap-3 mb-8">
            {system.logo ? (
              <img src={system.logo} alt={system.fullname} className="w-full h-14 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
            ) : (
              <div className="w-10 h-10 rounded-md flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${color}, rgb(30,30,30))` }}>
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
              <RadixSelect
                value={selectedGenre}
                onValueChange={(val) => { setSelectedGenre(val); setSelectedIdx(0); }}
                options={[
                  { label: "Todos", value: "all" },
                  ...filterOptions.genres.map(g => ({ label: g, value: g }))
                ]}
                placeholder="Todos"
              />
            </div>

            {/* Year Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Ano</span>
              <RadixSelect
                value={selectedYear}
                onValueChange={(val) => { setSelectedYear(val); setSelectedIdx(0); }}
                options={[
                  { label: "Todos", value: "all" },
                  ...filterOptions.years.map(y => ({ label: y, value: y }))
                ]}
                placeholder="Todos"
              />
            </div>

            {/* Players Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Jogadores</span>
              <RadixSelect
                value={selectedPlayers}
                onValueChange={(val) => { setSelectedPlayers(val); setSelectedIdx(0); }}
                options={[
                  { label: "Todos", value: "all" },
                  ...filterOptions.players.map(p => ({
                    label: p === "1" ? "1 Jogador" : p === "2" ? "2 Jogadores" : `${p} Jogadores`,
                    value: p
                  }))
                ]}
                placeholder="Todos"
              />
            </div>

            {/* Rating Filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/35 font-semibold px-1">Avaliação</span>
              <RadixSelect
                value={selectedMinRating}
                onValueChange={(val) => { setSelectedMinRating(val); setSelectedIdx(0); }}
                options={[
                  { label: "Todas", value: "all" },
                  ...filterOptions.ratings.map(r => ({ label: r.label, value: r.value }))
                ]}
                placeholder="Todas"
              />
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
        {(loading || colLoading) ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header with system name + game count */}
            <div className="shrink-0 px-6 pt-6 pb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {system.name === 'collections' && activeCollection !== null && (
                    <button
                      onClick={() => setActiveCollection(null)}
                      className="mr-2 bg-white/5 hover:bg-white/10 text-white px-2.5 py-1 rounded-md transition flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Voltar
                    </button>
                  )}
                  <h2 className="text-4xl font-bold text-white tracking-wide">
                    {system.name === 'collections' && activeCollection !== null ? `${system.fullname} > ${activeCollection}` : system.fullname}
                  </h2>
                </div>
                <span className="text-md text-white/40">{filteredGames.length} {system.name === 'collections' && activeCollection === null ? 'coleções encontradas' : 'jogos encontrados'}</span>
              </div>

              {/* Media Switcher Buttons */}
              <div className="flex items-center bg-white/5 border border-white/5 p-1 rounded-lg gap-0.5 shadow-inner backdrop-blur-md">
                {['cover', 'cover2d', 'cover3d', 'fanart', 'logo', 'screenshot', 'title', 'mix'].map((type) => {
                  const isAvailable = availableMediaTypes[type];
                  const isActive = preferredMediaType === type;
                  return (
                    <button
                      key={type}
                      disabled={!isAvailable}
                      onClick={() => handleMediaTypeChange(type)}
                      className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-md transition-all cursor-pointer ${
                        isActive
                          ? "bg-accent text-white shadow-md font-extrabold"
                          : isAvailable
                          ? "text-white/60 hover:text-white hover:bg-white/5"
                          : "text-white/20 cursor-not-allowed opacity-30"
                      }`}
                      title={!isAvailable ? `Sem mídia '${type}' disponível` : `Exibir mídia '${type}'`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid display of Games */}
            <div className="flex-1 relative overflow-hidden min-w-[400px]">
              {/* Grid media loading overlay */}
              {gridMediaLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[3px] z-30 animate-in fade-in duration-150">
                  <Loader2 className="w-8 h-8 text-accent animate-spin" />
                </div>
              )}
              
              <ScrollArea 
                ref={handleScrollAreaRef}
                className="h-full w-full px-6 py-4"
              >
                {filteredGames.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-white uppercase tracking-widest">
                    {system.name === 'collections' && activeCollection === null ? 'Nenhuma coleção encontrada' : 'Nenhum jogo encontrado'}
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-3">
                    {(() => {
                      const sliced = filteredGames.slice(0, displayLimit);
                      console.log("[SystemAppContent] Rendering grid items. displayLimit =", displayLimit, "filteredGames length =", filteredGames.length, "sliced length =", sliced.length, "items:", sliced);
                      return sliced.map((g, idx) => {
                        if (g.isCollectionFolder) {
                          const hasLogo = !!g.cover || !!g.thumbnail;
                          const hasFanart = !!g.fanart || !!g.image;
                          const count = g.gameCount ?? 0;
                          const countText = `${count} ${count === 1 ? 'Jogo' : 'Jogos'}`;

                          return (
                            <button
                              key={g.path}
                              onClick={() => setSelectedIdx(idx)}
                              onDoubleClick={() => setActiveCollection(g.name)}
                              className={`group flex flex-col w-full rounded-md overflow-hidden text-left transition-all border-2 relative aspect-[3/4] bg-black/40 ${
                                idx === selectedIdx
                                  ? "border-accent shadow-[0_0_15px_var(--accent-color-glass)] z-10"
                                  : "border-white/5 hover:border-white/10"
                              }`}
                            >
                              {hasFanart || hasLogo ? (
                                <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#1a1a1a]">
                                  {hasFanart && (
                                    <img 
                                      src={g.fanart || g.image} 
                                      alt={g.name} 
                                      className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-all duration-300"
                                    />
                                  )}
                                  {hasLogo ? (
                                    <img 
                                      src={g.cover || g.thumbnail} 
                                      alt={g.name} 
                                      className="relative w-[80%] max-h-[70%] object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-all duration-300 z-10"
                                    />
                                  ) : (
                                    <div className="relative z-10 flex flex-col items-center p-4 text-center">
                                      <Folder className="w-10 h-10 text-accent mb-2 opacity-80" />
                                      <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">{g.name}</span>
                                    </div>
                                  )}
                                  {/* Game count badge at top right */}
                                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-[2px] px-1.5 py-0.5 rounded-md text-[8px] text-white/90 font-bold z-20 border border-white/5 uppercase tracking-wider">
                                    {countText}
                                  </div>
                                  {/* Overlay/shadow at bottom for readability */}
                                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/55 backdrop-blur-[2px] px-2 py-0.5 rounded-md text-[9px] text-white/95 font-bold uppercase tracking-wider border border-white/5 z-20">
                                    <Folder className="w-2.5 h-2.5 text-accent shrink-0" />
                                    <span className="truncate">{g.name}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center bg-[#1a1a1a] text-white/30 p-4 text-center w-full h-full select-none relative">
                                  <Folder className="w-10 h-10 text-accent mb-3 group-hover:scale-105 transition-all duration-300 opacity-80" />
                                  <span className="text-[10px] font-bold text-white/80 line-clamp-2 uppercase tracking-wider mb-1">{g.name}</span>
                                  <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{countText}</span>
                                </div>
                              )}
                            </button>
                          );
                        }

                        const finalImage = getGameMediaUrl(g, preferredMediaType);
                        
                        return (
                          <button
                            key={g.path}
                            onClick={() => setSelectedIdx(idx)}
                            onDoubleClick={() => onLaunchGame(g, system)}
                            className={`group flex flex-col w-full rounded-md overflow-hidden text-left transition-all border-4 relative bg-[#1a1a1a] aspect-[3/4] ${
                              idx === selectedIdx 
                                ? "border-accent shadow-[0_0_15px_var(--accent-color-glass)] z-10" 
                                : "border-white/5 hover:border-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-center overflow-hidden relative w-full h-full">
                              {finalImage && !failedImages[g.path] ? (
                                <>
                                  <img 
                                    src={finalImage} 
                                    alt={g.name} 
                                    onError={() => setFailedImages(prev => ({ ...prev, [g.path]: true }))}
                                    className="w-full h-full object-contain group-hover:scale-105 transition-all duration-300 animate-in fade-in duration-200" 
                                  />
                                  {/* Small clean controller icon and title overlay at top left */}
                                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/55 backdrop-blur-[2px] px-2 py-0.5 rounded-md text-[9px] text-white/95 font-bold uppercase tracking-wider max-w-[90%] border border-white/5 z-20">
                                    <Gamepad2 className="w-2.5 h-2.5 text-white/90 shrink-0" />
                                    <span className="truncate">{g.name}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-col items-center justify-center bg-[#1a1a1a] text-white/30 p-4 text-center w-full h-full select-none">
                                  <Gamepad2 className="w-8 h-8 text-white/20 mb-3 group-hover:scale-105 transition-all duration-300" />
                                  <span className="text-[10px] font-bold text-white/60 line-clamp-2 uppercase tracking-wider">{g.name}</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Right Details Panel */}
        {selectedGame && (
          <ScrollArea className="w-[20vw] min-w-[250px] bg-black/50 p-6 select-none">
            {showSavesSidebar ? (
              /* Saves & Coleções Sidebar */
              <div className="flex flex-col gap-4 h-full">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex flex-col min-w-0 pr-6">
                    <h3 className="font-bold text-base leading-snug text-white/95 truncate" title={selectedGame.name}>{selectedGame.name}</h3>
                    <span className="text-[10px] text-white/40 mt-1 leading-normal">Gerencie save states e coleções deste jogo.</span>
                  </div>
                  {/* Close button: round filled with system color */}
                  <button
                    onClick={() => setShowSavesSidebar(false)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white bg-accent hover:bg-accent-hover hover:scale-105 transition duration-200 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tab control (Segmented Control) */}
                <div className="flex bg-black/30 p-1 rounded-md border border-white/5 text-[11px] items-center shrink-0">
                  <button
                    onClick={() => setSidebarTab("collections")}
                    className={`flex-1 py-2 rounded-md text-center font-bold transition cursor-pointer ${
                      sidebarTab === "collections"
                        ? "bg-[#1a1a1a] text-white shadow-sm"
                        : "text-white/40 hover:bg-white/5 hover:text-white/60"
                    }`}
                  >
                    Coleções
                  </button>
                  <button
                    onClick={() => setSidebarTab("saves")}
                    className={`flex-1 py-2 rounded-md text-center font-bold transition cursor-pointer ${
                      sidebarTab === "saves"
                        ? "bg-[#1a1a1a] text-white shadow-sm"
                        : "text-white/40 hover:bg-white/5 hover:text-white/60"
                    }`}
                  >
                    Save states
                  </button>
                </div>

                {/* Tab contents */}
                <div className="flex-1 overflow-y-auto pr-1">
                  {sidebarTab === "collections" ? (
                    <div className="flex flex-col gap-2">
                      {allCollections.map(col => {
                        const isAdded = gameCollections.includes(col);
                        return (
                          <button
                            key={col}
                            onClick={() => {
                              if (isAdded) {
                                handleRemoveFromCollection(col);
                              } else {
                                handleAddToCollection(col);
                              }
                            }}
                            className={`w-full flex items-center justify-between py-2 px-3 rounded-md border transition duration-200 text-left cursor-pointer ${
                              isAdded
                                ? "bg-accent-light border-accent text-white"
                                : "bg-[#1a1a1a] border-white/5 text-white/80 hover:bg-white/5 hover:border-white/10"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Folder className={`w-4 h-4 shrink-0 ${isAdded ? "text-accent" : "text-white/40"}`} />
                              <span className="text-xs font-bold">{col}</span>
                            </div>
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                              isAdded
                                ? "bg-accent border-accent text-white"
                                : "border-white/20"
                            }`}>
                              {isAdded && <span className="text-[10px] font-bold">✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* Save states list */
                    <div className="flex flex-col gap-2">
                      {saveStates.length === 0 ? (
                        <div className="text-xs text-white/30 italic py-4 text-center">
                          Nenhum save state encontrado para este jogo.
                        </div>
                      ) : (
                        saveStates.map(state => (
                          <button
                            key={state.path}
                            onClick={() => onLaunchGame(selectedGame, system, state.slot)}
                            className="w-full flex items-center gap-3 bg-[#1a1a1a] hover:bg-white/5 border border-white/5 p-2 rounded-md transition text-left cursor-pointer group"
                          >
                            {state.screenshotUrl ? (
                              <img src={state.screenshotUrl} alt={`Slot ${state.slot}`} className="w-16 h-10 object-cover rounded-md border border-white/10 shrink-0" />
                            ) : (
                              <div className="w-16 h-10 bg-black/40 border border-white/5 rounded-md flex items-center justify-center shrink-0">
                                <HardDrive className="w-4 h-4 text-white/30" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-white/90 group-hover:text-accent transition-colors">
                                {state.slot === -1 ? 'Autosave' : `Slot ${state.slot}`}
                              </div>
                              <div className="text-[10px] text-white/40 truncate">
                                {new Date(state.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Footer action for creating collection */}
                {sidebarTab === "collections" && (
                  <div className="flex gap-2 mt-auto pt-3 border-t border-white/5">
                    <input
                      type="text"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      placeholder="Nova coleção..."
                      className="flex-1 bg-[#1a1a1a] border border-white/5 rounded-md px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent transition"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateAndAddToCollection();
                        }
                      }}
                    />
                    <button
                      onClick={handleCreateAndAddToCollection}
                      disabled={!newColName.trim()}
                      className="bg-accent hover:bg-accent-hover hover:scale-[1.02] disabled:bg-white/5 disabled:text-white/20 disabled:hover:scale-100 text-white w-10 h-10 rounded-md text-xs font-bold transition flex items-center justify-center cursor-pointer shrink-0"
                      title="Criar e Adicionar"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            ) : selectedGame.isCollectionFolder ? (
              /* Collection Folder details */
              <div className="flex flex-col gap-4 h-full">
                {(() => {
                  const count = selectedGame.gameCount ?? 0;
                  const countText = `${count} ${count === 1 ? 'jogo' : 'jogos'}`;
                  
                  return (
                    <>
                      {selectedGame.cover || selectedGame.thumbnail || selectedGame.fanart || selectedGame.image ? (
                        <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black/50 border border-white/5 shadow-md flex items-center justify-center shrink-0">
                          {(selectedGame.fanart || selectedGame.image) && (
                            <img 
                              src={selectedGame.fanart || selectedGame.image} 
                              alt={selectedGame.name} 
                              className="absolute inset-0 w-full h-full object-cover opacity-50"
                            />
                          )}
                          {(selectedGame.cover || selectedGame.thumbnail) ? (
                            <img 
                              src={selectedGame.cover || selectedGame.thumbnail} 
                              alt={selectedGame.name} 
                              className="relative w-[70%] max-h-[85%] object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] z-10"
                            />
                          ) : (
                            <div className="relative z-10 flex flex-col items-center">
                              <Folder className="w-12 h-12 text-accent mb-2 opacity-80" />
                              <h3 className="font-bold text-sm text-white/95 text-center">{selectedGame.name}</h3>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center py-8 bg-white/5 rounded-md border border-white/5 shadow-md shrink-0">
                          <Folder className="w-20 h-20 text-accent mb-4 opacity-80" />
                          <h3 className="font-bold text-lg text-white/95 text-center px-4 leading-tight">{selectedGame.name}</h3>
                          <span className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">Pasta de Coleção · {countText}</span>
                        </div>
                      )}

                      {/* Title and metadata */}
                      {(selectedGame.cover || selectedGame.thumbnail || selectedGame.fanart || selectedGame.image) && (
                        <div className="flex flex-col text-left px-1">
                          <h3 className="font-bold text-base leading-snug text-white/95 truncate" title={selectedGame.name}>{selectedGame.name}</h3>
                          <span className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">Pasta de Coleção · {countText}</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="text-xs leading-relaxed text-white/60">
                  {selectedGame.desc || "Esta é uma coleção personalizada de jogos."}
                </div>
                
                <div className="flex flex-col gap-2 mt-auto">
                  <button
                    onClick={() => setActiveCollection(selectedGame.name)}
                    className="w-full bg-accent hover:bg-accent-hover hover:scale-[1.02] hover:shadow-lg transition-all rounded-md py-2.5 text-md font-bold flex items-center justify-center gap-2 cursor-pointer text-white"
                  >
                    <Folder className="w-4 h-4" />
                    Abrir Coleção
                  </button>
                </div>
              </div>
            ) : (
              /* Normal Game Details */
              <div className="flex flex-col gap-4">
                {/* Game Logo/Marquee (Transparent background) */}
                {(selectedGame.logo || selectedGame.marquee) && !imageError && (
                  <div className="w-full flex items-center justify-center overflow-hidden relative shrink-0">
                    <img 
                      src={(() => {
                        const logo = selectedGame.logo || selectedGame.marquee || "";
                        return logo.startsWith("http") || logo.startsWith("file://") ? logo : `file:///${logo.replace(/\\/g, '/')}`;
                      })()} 
                      alt={selectedGame.name} 
                      onError={() => setImageError(true)}
                      className="w-full max-h-40 object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" 
                    />
                  </div>
                )}

                {/* Game Playback Video Preview or Image Fallback */}
                {videoUrl ? (
                  <div className="relative group w-full aspect-video rounded-md overflow-hidden bg-black/50 border border-white/5 shadow-md shrink-0">
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
                      className="absolute bottom-2 right-2 bg-black/70 hover:bg-[var(--accent-color-hover)] text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center shadow-lg cursor-pointer"
                      title="Maximizar Vídeo"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  getGameMediaUrl(selectedGame, preferredMediaType) && (
                    <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black/50 border border-white/5 shadow-md shrink-0 flex items-center justify-center">
                      {mediaLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] z-10 animate-in fade-in duration-200">
                          <Loader2 className="w-6 h-6 text-accent animate-spin" />
                        </div>
                      )}
                      <img 
                        src={getGameMediaUrl(selectedGame, preferredMediaType)} 
                        alt={selectedGame.name} 
                        onLoad={() => setMediaLoading(false)}
                        onError={() => setMediaLoading(false)}
                        className={`w-full h-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] transition-all duration-300 ${mediaLoading ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}`}
                      />
                    </div>
                  )
                )}
                
                {/* Title & Metadata with Context Menu */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col flex-1 min-w-0 pr-2 text-left">
                    <h3 className="font-bold text-base leading-snug text-white/95 truncate" title={selectedGame.name}>{selectedGame.name}</h3>
                    <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">
                      {(() => {
                        const relDate = selectedGame.releasedate || (selectedGame as any).ReleaseDate;
                        return relDate ? String(relDate).substring(0, 4) : "Lançamento N/A";
                      })()} · {system.fullname}
                    </div>
                  </div>
                  
                  {/* Dropdown Menu Container */}
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowContextMenu(prev => !prev);
                      }}
                      className={`text-white/60 hover:text-white transition cursor-pointer flex items-center justify-center p-1.5 rounded-lg border border-white/5 hover:bg-white/10 ${showContextMenu ? "text-white bg-white/10" : "bg-[#1a1a1a]"}`}
                      title="Opções"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {showContextMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowContextMenu(false)} />
                        <div className="absolute right-0 mt-2 w-56 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-2 z-50 text-white animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                          <div className="px-3 py-1 text-[10px] text-white/40 uppercase font-semibold tracking-wider mb-1.5">
                            Gerenciar jogo
                          </div>
                          
                          <button
                            onClick={() => {
                              setShowContextMenu(false);
                              setSidebarTab("saves");
                              setShowSavesSidebar(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <HardDrive className="w-4 h-4 text-accent" />
                            <span>Save states</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setShowContextMenu(false);
                              setSidebarTab("collections");
                              setShowSavesSidebar(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <Folder className="w-4 h-4 text-cyan-400" />
                            <span>Adicionar à coleção</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setShowContextMenu(false);
                              handleToggleFavorite();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <Heart className={`w-4 h-4 ${selectedGame.favorite ? "fill-red-500 text-red-500" : "text-red-500 opacity-60"}`} />
                            <span>{selectedGame.favorite ? "Remover dos Favoritos" : "Favoritar"}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Favoritar & Avaliação Row */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleFavorite}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] hover:bg-white/5 border border-white/5 rounded-md text-xs font-semibold text-white/80 transition cursor-pointer"
                  >
                    <Heart className={`w-3.5 h-3.5 ${selectedGame.favorite ? "fill-red-500 text-red-500" : "text-white/60"}`} />
                    <span>{selectedGame.favorite ? "Favorito" : "Favoritar"}</span>
                  </button>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-white/5 rounded-md text-xs font-semibold text-white/80">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span className="text-amber-400 font-bold">
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
                    <div className="text-white/40 text-[10px] ml-auto">
                      Jogado <span className="text-white/80 font-bold">{selectedGame.playcount}</span> vezes
                    </div>
                  ) : null}
                </div>

                {/* Description Box */}
                <ScrollArea className="text-xs leading-relaxed text-white/60 h-28 pr-1 text-left">
                  <p>
                    {selectedGame.desc || "Nenhuma descrição disponível para este jogo."}
                  </p>
                </ScrollArea>

                {/* Game Info Details Table */}
                {(() => {
                  const genre = selectedGame.genre || (selectedGame as any).Genre;
                  const players = selectedGame.players || (selectedGame as any).Players;

                  if (!genre && !players) return null;

                  return (
                    <div className="flex flex-col gap-2 bg-[#1a1a1a] border border-white/5 rounded-md p-4 text-xs text-white/70">
                      {genre && (
                        <div className="flex justify-between items-center">
                          <span className="text-white/40 font-medium">Gênero</span>
                          <span className="font-semibold text-white/90 text-right truncate max-w-[150px]" title={String(genre)}>{String(genre)}</span>
                        </div>
                      )}
                      {players && (
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-white/40 font-medium">Jogadores</span>
                          <span className="font-semibold text-white/90 text-right">
                            {String(players) === "1" ? "1.0 Jogador" : String(players) === "2" ? "2.0 Jogadores" : `${parseFloat(String(players)).toFixed(1)} Jogadores`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Emulator/Core Select Option */}
                <div className="flex flex-col gap-1.5 text-left">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Emulador / Core</span>
                  <RadixSelect
                    value={selectValue}
                    onValueChange={handleEmulatorValueChange}
                    options={emulatorChoices.map(choice => ({ label: choice.label, value: choice.value }))}
                    placeholder="Padrão (Auto)"
                  />
                </div>

                {/* Play Button */}
                <div className="flex flex-col gap-2 mt-auto pt-3">
                  <button
                    onClick={() => onLaunchGame(selectedGame, system)}
                    className="w-[calc(100%-8px)] mx-auto bg-accent hover:bg-accent-hover hover:scale-[1.02] hover:shadow-lg transition-all rounded-md py-3 text-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-white bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color-hover)] outline outline-2 outline-[var(--accent-color)] outline-offset-2">
                    <Play className="w-6 h-6 fill-white text-white" />
                    <span>Jogar</span>
                  </button>
                </div>
              </div>
            )}
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
            className="max-w-[95%] max-h-[90%] rounded-md border border-white/10 shadow-2xl" 
          />
        </div>
      )}
    </div>
    </div>
  );
}
