import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Gamepad2, Heart, Loader2, Star, Play, ChevronRight, Maximize2, Minimize2, X, Search, Folder, ChevronLeft, HardDrive, ChevronDown, Check, MoreHorizontal, RefreshCw, BookOpen, Settings, Edit3, Save, CloudDownload } from "lucide-react";
import { System, Game, hasMultipleEmulators } from "../types";
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


import { playUISound } from "../utils/audioManager";

const missingMediaCache = new Set<string>();

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatFileDate(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "—";
}

function formatPlayers(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Preserve ranges and lists such as "1-2" or "1,2". Only remove a
  // meaningless decimal suffix introduced when SQLite returns an integer as REAL.
  const normalized = /^\d+\.0+$/.test(raw) ? raw.replace(/\.0+$/, "") : raw;
  return `${normalized} ${normalized === "1" ? "Jogador" : "Jogadores"}`;
}

export default function SystemAppContent({
  system, color, Icon, onLaunchGame, search: propSearch, setSearch: propSetSearch, onActiveGameArtChanged, onOpenTool, settings
}: {
  systemName: string;
  system: System;
  color: string;
  Icon: any;
  onLaunchGame: (game: Game, system: System, saveStateSlot?: number, saveStatePath?: string) => void;
  search?: string;
  setSearch?: (s: string) => void;
  onActiveGameArtChanged?: (art: string | null) => void;
  onOpenTool?: (toolId: string, subId?: string, coreId?: string) => void;
  settings?: any;
}) {
  const [localSearch, setLocalSearch] = useState("");
  const search = propSearch !== undefined ? propSearch : localSearch;
  const setSearch = propSetSearch !== undefined ? propSetSearch : setLocalSearch;

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
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Collection and Save States states
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [collectionGames, setCollectionGames] = useState<Game[]>([]);
  const [colLoading, setColLoading] = useState(false);
  const [saveStates, setSaveStates] = useState<any[]>([]);
  const [gameCollections, setGameCollections] = useState<string[]>([]);
  const [allCollections, setAllCollections] = useState<string[]>([]);
  const [newColName, setNewColName] = useState("");

  // New States for context menu, saves sidebar, and scraper
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showPlatformMenu, setShowPlatformMenu] = useState(false);
  const [gameContextMenu, setGameContextMenu] = useState<{
    x: number;
    y: number;
    game: Game;
    index: number;
  } | null>(null);
  const [showSavesSidebar, setShowSavesSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"collections" | "saves">("collections");
  const [showMetadataSidebar, setShowMetadataSidebar] = useState(false);
  const [gameFileInfo, setGameFileInfo] = useState<{
    exists: boolean;
    path: string;
    name: string;
    extension: string;
    size: number;
    createdAt?: number;
    modifiedAt?: number;
  } | null>(null);
  const [gameFileInfoLoading, setGameFileInfoLoading] = useState(false);
  const [metaForm, setMetaForm] = useState<{
    name: string;
    developer: string;
    publisher: string;
    releasedate: string;
    genre: string;
    players: string;
    rating: string;
    desc: string;
    gamefamily: string;
    region: string;
    lang: string;
  }>({
    name: "",
    developer: "",
    publisher: "",
    releasedate: "",
    genre: "",
    players: "",
    rating: "",
    desc: "",
    gamefamily: "",
    region: "",
    lang: ""
  });

  const [isScraping, setIsScraping] = useState(false);
  const [scrapeNotificationMode, setScrapeNotificationMode] = useState(false);
  const scrapeNotificationModeRef = useRef(false);
  const scrapeSessionActiveRef = useRef(false);
  const [showManualSearchModal, setShowManualSearchModal] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchData, setManualSearchData] = useState<{
    systemName: string;
    gamePath: string;
    failedQuery: string;
  } | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [hasManual, setHasManual] = useState(false);
  const [systemNamesMap, setSystemNamesMap] = useState<Record<string, string>>({});
  const [isCancellingScrape, setIsCancellingScrape] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{
    systemName: string;
    systemCode: string;
    gameName: string;
    current: number;
    total: number;
    successCount: number;
    failCount: number;
    motors?: number;
  } | null>(null);
  const [showScrapeFinished, setShowScrapeFinished] = useState(false);
  const [scrapeFinishedData, setScrapeFinishedData] = useState<{
    success: boolean;
    count?: number;
    failed?: number;
    reason?: string;
  } | null>(null);
  const preferScrapeNotification = settings?.["ScraperNotificationMode"]?.value === true
    || settings?.["ScraperNotificationMode"]?.value === "true";

  const setScrapeDisplayAsNotification = useCallback((compact: boolean) => {
    scrapeNotificationModeRef.current = compact;
    setScrapeNotificationMode(compact);
  }, []);

  const [preferredMediaType, setPreferredMediaType] = useState<string>("cover");
  const [availableMediaTypes, setAvailableMediaTypes] = useState<Record<string, boolean>>({
    cover: true,
    cover3d: false,
    coverback: false,
    cartridge: false,
    fanart: false,
    logo: false,
    marquee: false,
    screenshot: false,
    title: false,
    mix: false,
    manual: false
  });

  const [mediaLoading, setMediaLoading] = useState(false);
  const [gridMediaLoading, setGridMediaLoading] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);




  const reloadLibrary = useCallback(async () => {
    if (system.name === 'collections') {
      if (activeCollection !== null) {
        const gameList = await window.api.getCollectionGames(activeCollection);
        setCollectionGames(gameList || []);
      } else {
        const gameList = await window.api.getGames(system.name);
        setGames(gameList || []);
      }
    } else {
      const gameList = await window.api.getGames(system.name);
      setGames(gameList || []);
    }
  }, [system.name, activeCollection]);

  const checkMediaAvailability = useCallback(() => {
    if (system && system.path && !system.path.startsWith('virtual://') && system.name !== 'collections') {
      window.api.checkMediaFolders(system.path).then((res: Record<string, boolean>) => {
        setAvailableMediaTypes(res || {
          cover: true,
          cover3d: false,
          coverback: false,
          cartridge: false,
          fanart: false,
          logo: false,
          marquee: false,
          screenshot: false,
          title: false,
          mix: false,
          manual: false
        });
      }).catch((err: any) => {
        console.log("Failed to check media folders:", err);
      });
    } else {
      // Enable all for virtual systems
      setAvailableMediaTypes({
        cover: true,
        cover3d: true,
        coverback: true,
        cartridge: true,
        fanart: true,
        logo: true,
        marquee: true,
        screenshot: true,
        title: true,
        mix: true,
        manual: true
      });
    }
  }, [system.name, system.path]);

  const refreshMedia = useCallback(async (forcePhysicalScan: boolean) => {
    missingMediaCache.clear();
    setFailedImages({});
    setImageError(false);
    setMediaRevision(Date.now());

    if (forcePhysicalScan) {
      await window.api.preloadLibrary(true, system.name);
    }
    await reloadLibrary();
    await checkMediaAvailability();
  }, [system.name, reloadLibrary, checkMediaAvailability]);

  const handleManualSearchSubmit = async () => {
    setShowManualSearchModal(false);
    await window.api.submitManualScrapeQuery(manualSearchQuery);
  };

  const handleManualSearchCancel = async () => {
    setShowManualSearchModal(false);
    await window.api.cancelManualScrape();
  };

  const handleOpenManual = (manualPath: string) => {
    const url = manualPath.startsWith("http") || manualPath.startsWith("file://")
      ? manualPath
      : `file:///${manualPath}`;
    setPdfUrl(url);
    setShowPdfViewer(true);
  };

  // Listen to scraper events
  useEffect(() => {
    const unsubProgress = window.api.on('scrape-progress', (_, progress) => {
      if (!scrapeSessionActiveRef.current) {
        scrapeSessionActiveRef.current = true;
        setScrapeDisplayAsNotification(preferScrapeNotification);
      }
      setIsScraping(true);
      setIsCancellingScrape(false);
      setScrapeProgress(progress);
    })

    const unsubFinished = window.api.on('scrape-finished', (_, result) => {
      setIsScraping(false);
      setIsCancellingScrape(false);
      setScrapeProgress(null);
      setScrapeFinishedData(result);
      scrapeSessionActiveRef.current = false;

      if (scrapeNotificationModeRef.current) {
        setShowScrapeFinished(false);
        window.dispatchEvent(new CustomEvent("show-toast", {
          detail: {
            title: result.success ? "Scraper concluído" : "Scraper interrompido",
            description: result.success
              ? `${result.count ?? 0} jogo(s) atualizado(s), ${result.failed ?? 0} falha(s).`
              : (result.reason || "A operação não foi concluída."),
            type: result.success ? "success" : "error"
          }
        }));
      } else {
        setShowScrapeFinished(true);
      }
      setScrapeDisplayAsNotification(false);
      
      // Scraper updates the database directly. Reloading it here without a
      // physical rescan preserves the new metadata and refreshes same-name media.
      void refreshMedia(false);
    });

    const unsubManualSearch = window.api.on('scrape-manual-search-required', (_, data) => {
      setManualSearchData(data);
      setManualSearchQuery(data.failedQuery);
      setShowManualSearchModal(true);
    });

    return () => {
      unsubProgress();
      unsubFinished();
      unsubManualSearch();
    };
  }, [preferScrapeNotification, refreshMedia, setScrapeDisplayAsNotification]);

  useEffect(() => {
    if (isScraping && preferScrapeNotification) {
      setScrapeDisplayAsNotification(true);
    }
  }, [isScraping, preferScrapeNotification, setScrapeDisplayAsNotification]);

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
    checkMediaAvailability();
  }, [system.name, system.path, checkMediaAvailability]);

  // Load systems map for full name lookup (e.g. from low-level code like "sfc" to "Super Nintendo")
  useEffect(() => {
    window.api.getSystems().then((sysList: System[]) => {
      const mapping: Record<string, string> = {};
      sysList.forEach(s => {
        mapping[s.name.toLowerCase()] = s.fullname;
      });
      setSystemNamesMap(mapping);
    }).catch(err => console.error("Failed to load systems for mapping:", err));
  }, []);


  const handleMediaTypeChange = (type: string) => {
    setGridMediaLoading(true);
    setFailedImages({});
    setPreferredMediaType(type);
    const settingKey = `RIESCADE.PreferredMediaType.${system.name}`;
    window.api.saveSetting(settingKey, type, "string");
    // Brief loading overlay for the grid transition
    setTimeout(() => setGridMediaLoading(false), 400);
  };

  const withMediaRevision = useCallback((mediaPath?: string) => {
    if (!mediaPath) return "";
    const normalized = mediaPath.replace(/\\/g, '/');
    const url = normalized.startsWith("http") || normalized.startsWith("file://")
      ? normalized
      : `file:///${normalized}`;
    if (!mediaRevision) return url;
    return `${url}${url.includes("?") ? "&" : "?"}v=${mediaRevision}`;
  }, [mediaRevision]);

  const getGameMediaUrl = useCallback((g: Game, type: string) => {
    if (g.isCollectionFolder) return g.cover || g.fanart || "";
    
    let mediaPath: string | undefined = undefined;
    switch (type) {
      case 'cover':
        mediaPath = g.cover;
        break;
      case 'cover3d':
        mediaPath = g.cover3d;
        break;
      case 'coverback':
        mediaPath = g.coverback;
        break;
      case 'cartridge':
        mediaPath = g.cartridge;
        break;
      case 'fanart':
        mediaPath = g.fanart;
        break;
      case 'logo':
        mediaPath = g.logo;
        break;
      case 'marquee':
        mediaPath = g.marquee;
        break;
      case 'screenshot':
        mediaPath = g.screenshot;
        break;
      case 'title':
        mediaPath = g.title;
        break;
      case 'mix':
        mediaPath = g.mix;
        break;
      case 'manual':
        mediaPath = g.manual;
        break;
      default:
        mediaPath = g.cover;
    }

    const url = withMediaRevision(mediaPath);
    if (url && missingMediaCache.has(url)) {
      return "";
    }
    return url;
  }, [withMediaRevision]);

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

  // Check if selected game has a physical manual file
  useEffect(() => {
    if (selectedGame && selectedGame.manual) {
      window.api.checkFileExists(selectedGame.manual).then(exists => {
        setHasManual(exists);
      }).catch(() => {
        setHasManual(false);
      });
    } else {
      setHasManual(false);
    }
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
      setShowMetadataSidebar(false);
    } else {
      setSaveStates([]);
      setGameCollections([]);
      setAllCollections([]);
      setShowMetadataSidebar(false);
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
    return withMediaRevision(selectedGame.video);
  }, [selectedGame, withMediaRevision]);

  const masterVolume = useMemo(() => {
    const sVal = settings?.["Volume"]?.value;
    if (sVal !== undefined && sVal !== null && sVal !== "") {
      const parsed = parseInt(String(sVal), 10);
      if (!isNaN(parsed)) return parsed;
    }
    return 80;
  }, [settings]);

  const enableSounds = useMemo(() => {
    return settings?.["EnableSounds"]?.value !== false && settings?.["EnableSounds"]?.value !== "false";
  }, [settings]);

  const videoAudioEnabled = useMemo(() => {
    return settings?.["VideoAudio"]?.value !== false && settings?.["VideoAudio"]?.value !== "false";
  }, [settings]);

  const isNavFirstRender = useRef(true);
  useEffect(() => {
    if (isNavFirstRender.current) {
      isNavFirstRender.current = false;
      return;
    }
    playUISound('navigate', masterVolume, enableSounds);
  }, [selectedIdx, masterVolume, enableSounds]);

  useEffect(() => {
    if (videoUrl) {
      window.dispatchEvent(new CustomEvent("video-playback-changed", { detail: { playing: true } }));
      return () => {
        window.dispatchEvent(new CustomEvent("video-playback-changed", { detail: { playing: false } }));
      };
    }
  }, [videoUrl]);

  // Synchronize active game art background with the main window
  useEffect(() => {
    let gameArtUrl: string | null = null;
    if (selectedGame) {
      const rawArt = selectedGame.fanart || selectedGame.cover || selectedGame.cover3d || null;
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
        const emuDisplayName = (emu.name === 'libretro' ? 'retroarch' : emu.name).toUpperCase();
        if (emu.cores && emu.cores.length > 0) {
          emu.cores.forEach((core: string) => {
            choices.push({
              label: `${emuDisplayName} (${core.toUpperCase()})`,
              value: `${emu.name}:${core}`,
              emulator: emu.name,
              core: core
            });
          });
        } else {
          choices.push({
            label: emuDisplayName,
            value: `${emu.name}:`,
            emulator: emu.name,
            core: ""
          });
        }
      });
    }
    return choices;
  }, [system]);

  const canSwitchEmulator = useMemo(() => {
    return hasMultipleEmulators(system);
  }, [system]);

  const selectValue = useMemo(() => {
    if (!selectedGame) return "auto";
    if (!selectedGame.emulator || selectedGame.emulator === "auto") return "auto";
    return `${selectedGame.emulator}:${selectedGame.core || ""}`;
  }, [selectedGame]);

  const selectedCoreToConfig = useMemo(() => {
    if (selectValue === "auto") {
      return system.emulators?.[0]?.cores?.[0] || "";
    }
    return selectValue.split(":")[1] || "";
  }, [selectValue, system]);

  const emuToConfig = useMemo(() => {
    let raw = "";
    if (selectValue === "auto") {
      raw = system.emulators?.[0]?.name || "";
    } else {
      raw = selectValue.split(":")[0] || "";
    }
    if (!raw) return null;
    return raw === "libretro" ? "retroarch" : raw;
  }, [selectValue, system]);

  const emuLabelToConfig = useMemo(() => {
    if (!emuToConfig) return "";
    const nameStr = emuToConfig === "libretro" ? "RETROARCH" : emuToConfig.toUpperCase();
    if (selectedCoreToConfig) {
      return `${nameStr} (${selectedCoreToConfig.toUpperCase()})`;
    }
    return nameStr;
  }, [emuToConfig, selectedCoreToConfig]);

  const handleEmulatorValueChangeForGame = (game: Game, val: string) => {
    let updatedGame = { ...game };
    
    if (val === "auto") {
      updatedGame.emulator = "auto";
      updatedGame.core = "auto";
    } else {
      const [emu, core] = val.split(":");
      updatedGame.emulator = emu;
      updatedGame.core = core || "";
    }

    window.api.updateGame(system.name, updatedGame).then(() => {
      setGames(prev => prev.map(g => g.path === game.path ? updatedGame : g));
    });
  };

  const handleEmulatorValueChange = (val: string) => {
    if (!selectedGame) return;
    handleEmulatorValueChangeForGame(selectedGame, val);
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

  const handleOpenMetadataSidebar = useCallback(() => {
    if (!selectedGame) return;
    const g = selectedGame as any;
    setMetaForm({
      name: selectedGame.name || "",
      developer: selectedGame.developer || g.Developer || "",
      publisher: selectedGame.publisher || g.Publisher || "",
      releasedate: selectedGame.releasedate || g.ReleaseDate || "",
      genre: selectedGame.genre || g.Genre || "",
      players: selectedGame.players ? String(selectedGame.players) : g.Players ? String(g.Players) : "",
      rating: selectedGame.rating !== undefined ? String(selectedGame.rating) : g.Rating !== undefined ? String(g.Rating) : "",
      desc: selectedGame.desc || g.Desc || "",
      gamefamily: selectedGame.gamefamily || "",
      region: selectedGame.region || "",
      lang: selectedGame.lang || ""
    });
    setShowSavesSidebar(false);
    setShowMetadataSidebar(true);
    setGameFileInfo(null);
    setGameFileInfoLoading(true);
    window.api.getGameFileInfo(selectedGame.system || system.name, selectedGame.path)
      .then(setGameFileInfo)
      .catch(() => setGameFileInfo({
        exists: false,
        path: selectedGame.path,
        name: selectedGame.path.split(/[\\/]/).pop() || selectedGame.path,
        extension: "",
        size: 0
      }))
      .finally(() => setGameFileInfoLoading(false));
  }, [selectedGame, system.name]);

  const handleSaveMetadata = async () => {
    if (!selectedGame) return;
    const parsedRating = Number.parseFloat(metaForm.rating);
    const updatedGame: Game = {
      ...selectedGame,
      name: metaForm.name.trim() || selectedGame.name,
      developer: metaForm.developer.trim(),
      publisher: metaForm.publisher.trim(),
      releasedate: metaForm.releasedate.trim(),
      genre: metaForm.genre.trim(),
      players: metaForm.players.trim(),
      rating: Number.isFinite(parsedRating) ? Math.min(1, Math.max(0, parsedRating)) : selectedGame.rating,
      desc: metaForm.desc.trim(),
      gamefamily: metaForm.gamefamily.trim(),
      region: metaForm.region.trim().toLowerCase(),
      lang: metaForm.lang.trim().toLowerCase()
    };

    await window.api.updateGame(system.name, updatedGame);
    setGames(prev => prev.map(g => g.path === selectedGame.path ? updatedGame : g));
    setShowMetadataSidebar(false);

    window.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: {
          title: "Metadados Atualizados",
          description: updatedGame.name,
          type: "success"
        }
      })
    );
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
              className="w-full bg-white/5 border border-white/5 rounded-md pl-9 pr-8 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent focus:bg-white/[0.07] transition duration-200"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition p-0.5 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
          <div className="@container flex-1 flex flex-col overflow-hidden">
            {/* Header with system name + game count */}
            <div className="shrink-0 px-6 pt-6 pb-3 flex flex-col gap-4 @3xl:flex-row @3xl:items-center justify-between items-start">
              <div className="min-w-0 max-w-full">
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
                  <h2 className="text-2xl @2xl:text-3xl @3xl:text-4xl font-bold text-white tracking-wide truncate" title={system.name === 'collections' && activeCollection !== null ? `${system.fullname} > ${activeCollection}` : system.fullname}>
                    {system.name === 'collections' && activeCollection !== null ? `${system.fullname} > ${activeCollection}` : system.fullname}
                  </h2>
                </div>
                <span className="text-md @3xl:text-md text-white/40">{filteredGames.length} {system.name === 'collections' && activeCollection === null ? 'coleções encontradas' : 'jogos encontrados'}</span>
              </div>

              {/* Media Switcher & Platform Options */}
              <div className="flex items-center gap-2 max-w-full">
                {/* Media Switcher Buttons */}
                {!(system.name === 'collections' && activeCollection === null) && (
                  <div className="flex flex-wrap items-center bg-white/5 border border-white/5 p-1 rounded-lg gap-0.5 shadow-inner backdrop-blur-md max-w-full">
                    {['cover', 'cover3d', 'coverback', 'cartridge', 'fanart', 'logo', 'marquee', 'screenshot', 'title', 'mix'].map((type) => {
                      const isAvailable = availableMediaTypes[type];
                      if (!isAvailable) return null;
                      const isActive = preferredMediaType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => handleMediaTypeChange(type)}
                          className={`px-1.5 py-0.5 text-[9px] @xs:px-2.5 @xs:py-1 @xs:text-[10px] uppercase font-bold tracking-wider rounded-md transition-all cursor-pointer ${
                            isActive
                              ? "bg-accent text-white shadow-md font-extrabold"
                              : "text-white/60 hover:text-white hover:bg-white/5"
                          }`}
                          title={`Exibir mídia '${type}'`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 3-dots Platform options (only for physical systems) */}
                {system.name !== 'collections' && !system.path.startsWith('virtual://') && (
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPlatformMenu(prev => !prev);
                      }}
                      className={`text-white/60 hover:text-white transition cursor-pointer flex items-center justify-center p-1.5 rounded-lg border border-white/5 hover:bg-white/10 ${showPlatformMenu ? "text-white bg-white/10" : "bg-[#1a1a1a]"}`}
                      title="Opções da plataforma"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {showPlatformMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowPlatformMenu(false)} />
                        <div className="absolute right-0 mt-2 w-56 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-2 z-50 text-white animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                          <div className="px-3 py-1 text-[10px] text-white/40 uppercase font-semibold tracking-wider mb-1.5">
                            Ações da Plataforma
                          </div>
                          
                          <button
                            onClick={() => {
                              setShowPlatformMenu(false);
                              window.api.startScrape({ systemName: system.name });
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <CloudDownload className="w-4 h-4 text-accent" />
                            <span>Buscar metadados do sistema</span>
                          </button>

                          <button
                            onClick={() => {
                              setShowPlatformMenu(false);
                              void refreshMedia(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <RefreshCw className="w-4 h-4 text-cyan-400" />
                            <span>Recarregar mídias</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Grid display of Games */}
            <div className="@container flex-1 relative overflow-hidden min-w-[400px]">
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
                  <div className="grid grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 gap-3">
                    {(() => {
                      const sliced = filteredGames.slice(0, displayLimit);
                      console.log("[SystemAppContent] Rendering grid items. displayLimit =", displayLimit, "filteredGames length =", filteredGames.length, "sliced length =", sliced.length, "items:", sliced);
                      return sliced.map((g, idx) => {
                        if (g.isCollectionFolder) {
                          const hasLogo = !!g.logo || !!g.marquee;
                          const hasFanart = !!g.fanart;
                          const count = g.gameCount ?? 0;
                          const countText = `${count} ${count === 1 ? 'Jogo' : 'Jogos'}`;

                          return (
                            <button
                              key={g.path}
                              onClick={() => setSelectedIdx(idx)}
                              onDoubleClick={() => setActiveCollection(g.name)}
                              className={`group flex flex-col w-full rounded-md overflow-hidden text-left transition-all border-2 relative bg-black/40 ${
                                idx === selectedIdx
                                  ? "border-accent shadow-[0_0_15px_var(--accent-color-glass)] z-10"
                                  : "border-white/5 hover:border-white/10"
                              }`}
                            >
                              {hasFanart || hasLogo ? (
                                <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#1a1a1a]">
                                  {hasFanart && (
                                    <img 
                                      src={withMediaRevision(g.fanart)}
                                      alt={g.name} 
                                      className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-all duration-300"
                                    />
                                  )}
                                  {hasLogo ? (
                                    <img 
                                      src={withMediaRevision(g.logo || g.marquee)}
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
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelectedIdx(idx);
                              setGameContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                game: g,
                                index: idx
                              });
                            }}
                            className={`group flex flex-col w-full min-h-[140px] rounded-md overflow-hidden text-left transition-all border-4 relative bg-[#1a1a1a] ${
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
                                    onError={() => {
                                      if (finalImage) missingMediaCache.add(finalImage);
                                      setFailedImages(prev => ({ ...prev, [g.path]: true }));
                                    }}
                                    className="w-full h-full object-contain group-hover:scale-105 transition-all duration-300 animate-in fade-in duration-200" 
                                  />
                                  {/* Small clean controller icon and title overlay at top left */}
                                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/55 backdrop-blur-[2px] px-2 py-0.5 rounded-md text-[9px] text-white/95 font-bold uppercase tracking-wider max-w-[90%] border border-white/5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
          <ScrollArea className="w-[20vw] min-w-[250px] bg-black/50 p-6 select-none overflow-hidden">
            {showMetadataSidebar ? (
              /* Metadata Editor Sidebar */
              <div key="metadata-sidebar" className="flex flex-col gap-4 h-full animate-slide-in-right">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-white/10 pb-3">
                  <div className="flex flex-col min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h3 className="font-bold text-sm text-white/95 truncate">Editar Metadados</h3>
                    </div>
                    <span className="text-[10px] text-white/40 mt-0.5 truncate">{selectedGame.name}</span>
                  </div>
                  <button
                    onClick={() => setShowMetadataSidebar(false)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white bg-accent hover:bg-accent-hover hover:scale-105 transition duration-200 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Form Fields Scroll */}
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 text-xs text-left">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Nome do Jogo</label>
                    <input
                      type="text"
                      value={metaForm.name}
                      onChange={e => setMetaForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Gênero</label>
                    <input
                      type="text"
                      value={metaForm.genre}
                      onChange={e => setMetaForm(prev => ({ ...prev, genre: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Desenvolvedor</label>
                      <input
                        type="text"
                        value={metaForm.developer}
                        onChange={e => setMetaForm(prev => ({ ...prev, developer: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Publicadora</label>
                      <input
                        type="text"
                        value={metaForm.publisher}
                        onChange={e => setMetaForm(prev => ({ ...prev, publisher: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Data Lançamento</label>
                      <input
                        type="text"
                        placeholder="YYYYMMDD"
                        value={metaForm.releasedate}
                        onChange={e => setMetaForm(prev => ({ ...prev, releasedate: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Jogadores</label>
                      <input
                        type="text"
                        placeholder="1-2"
                        value={metaForm.players}
                        onChange={e => setMetaForm(prev => ({ ...prev, players: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Avaliação (0 - 1.0)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={metaForm.rating}
                        onChange={e => setMetaForm(prev => ({ ...prev, rating: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Região</label>
                      <input
                        type="text"
                        placeholder="us, eu, jp"
                        value={metaForm.region}
                        onChange={e => setMetaForm(prev => ({ ...prev, region: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Família / Série</label>
                      <input
                        type="text"
                        value={metaForm.gamefamily}
                        onChange={e => setMetaForm(prev => ({ ...prev, gamefamily: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Idioma</label>
                      <input
                        type="text"
                        placeholder="pt, en, ja"
                        value={metaForm.lang}
                        onChange={e => setMetaForm(prev => ({ ...prev, lang: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-1.5 text-white text-xs focus:outline-none focus:border-accent transition"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-white/40 tracking-wider">Descrição</label>
                    <textarea
                      rows={4}
                      value={metaForm.desc}
                      onChange={e => setMetaForm(prev => ({ ...prev, desc: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-md p-2.5 text-white text-xs leading-relaxed focus:outline-none focus:border-accent transition resize-none"
                    />
                  </div>

                  <div className="mt-1 rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Arquivo físico — somente leitura</span>
                    </div>
                    {gameFileInfoLoading ? (
                      <div className="flex items-center gap-2 py-2 text-[10px] text-white/40">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Consultando arquivo...
                      </div>
                    ) : gameFileInfo ? (
                      <div className="space-y-2 text-[10px]">
                        {[
                          ["Status", gameFileInfo.exists ? "Encontrado" : "Não encontrado"],
                          ["Nome", gameFileInfo.name || "—"],
                          ["Extensão", gameFileInfo.extension || "—"],
                          ["Tamanho", gameFileInfo.exists ? formatFileSize(gameFileInfo.size) : "—"],
                          ["Modificado", gameFileInfo.exists ? formatFileDate(gameFileInfo.modifiedAt) : "—"],
                          ["Criado", gameFileInfo.exists ? formatFileDate(gameFileInfo.createdAt) : "—"]
                        ].map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[72px_1fr] gap-2">
                            <span className="text-white/35">{label}</span>
                            <span className="break-all text-white/75">{value}</span>
                          </div>
                        ))}
                        <div className="border-t border-white/5 pt-2">
                          <span className="mb-1 block text-white/35">Caminho completo</span>
                          <span className="block break-all rounded bg-black/25 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-white/65">
                            {gameFileInfo.path}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Action buttons footer */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/10 mt-auto">
                  <button
                    onClick={() => setShowMetadataSidebar(false)}
                    className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-xs font-semibold text-white/70 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveMetadata}
                    className="flex-1 py-2 px-3 bg-accent hover:bg-accent-hover rounded-md text-xs font-bold text-white shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar</span>
                  </button>
                </div>
              </div>
            ) : showSavesSidebar ? (
              /* Saves & Coleções Sidebar */
              <div key="saves-sidebar" className="flex flex-col gap-4 h-full animate-slide-in-right">
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
                            onClick={() => onLaunchGame(selectedGame, system, state.slot, state.path)}
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
                                {new Date(state.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                {Number.isFinite(state.size) ? ` · ${formatFileSize(state.size)}` : ''}
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
                      {(selectedGame.logo || selectedGame.marquee) ? (
                        <div className="w-full flex items-center justify-center overflow-hidden relative shrink-0">
                          <img 
                            src={selectedGame.logo || selectedGame.marquee} 
                            alt={selectedGame.name} 
                            className="w-full max-h-40 object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" 
                          />
                        </div>
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center py-8 bg-white/5 rounded-md border border-white/5 shadow-md shrink-0">
                          <Folder className="w-20 h-20 text-accent mb-4 opacity-80" />
                          <h3 className="font-bold text-lg text-white/95 text-center px-4 leading-tight">{selectedGame.name}</h3>
                          <span className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">Pasta de Coleção · {countText}</span>
                        </div>
                      )}

                      {/* Title and metadata */}
                      {(selectedGame.cover || selectedGame.logo || selectedGame.fanart) && (
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
              <div className="flex flex-col gap-4">
                {/* Game Logo/Marquee (Transparent background) */}
                {(() => {
                  const logo = selectedGame.logo || selectedGame.marquee || "";
                  const url = logo ? (logo.startsWith("http") || logo.startsWith("file://") ? logo : `file:///${logo.replace(/\\/g, '/')}`) : "";
                  const isMissing = url && missingMediaCache.has(url);
                  return url && !isMissing && !imageError && (
                    <div className="w-full flex items-center justify-center overflow-hidden relative shrink-0">
                      <img 
                        src={url} 
                        alt={selectedGame.name} 
                        onError={() => {
                          missingMediaCache.add(url);
                          setImageError(true);
                        }}
                        className="w-full max-h-40 object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" 
                      />
                    </div>
                  );
                })()}

                {/* Game Playback Video Preview or Image Fallback */}
                {videoUrl ? (
                  <div className="relative group w-full aspect-video rounded-md overflow-hidden bg-black/50 border border-white/5 shadow-md shrink-0">
                    <video 
                      src={videoUrl} 
                      autoPlay 
                      loop 
                      muted={!videoAudioEnabled} 
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
                  (() => {
                    const fanart = selectedGame.fanart || selectedGame.image || "";
                    const fanartUrl = withMediaRevision(fanart);
                    const logo = selectedGame.logo || selectedGame.marquee || "";
                    const logoUrl = withMediaRevision(logo);
                    const coverUrl = getGameMediaUrl(selectedGame, preferredMediaType);

                    return (coverUrl || fanartUrl || logoUrl) && (
                      <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black/50 border border-white/5 shadow-md shrink-0 flex items-center justify-center">
                        {logoUrl ? (
                          <img 
                            src={logoUrl} 
                            alt="Logo" 
                            className="relative w-[75%] max-h-[80%] object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] z-10 animate-in fade-in zoom-in-95 duration-200" 
                          />
                        ) : coverUrl ? (
                          <img 
                            src={coverUrl} 
                            alt={selectedGame.name} 
                            className="relative w-[60%] max-h-[85%] object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] z-10 animate-in fade-in zoom-in-95 duration-200" 
                          />
                        ) : null}
                      </div>
                    );
                  })()
                )}
                
                {/* Title & Metadata with Context Menu */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col flex-1 min-w-0 pr-2 text-left">
                    <h3 className="font-bold text-base leading-snug text-white/95 truncate" title={selectedGame.name}>{selectedGame.name}</h3>
                    <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold">
                      {(() => {
                        const relDate = selectedGame.releasedate || (selectedGame as any).ReleaseDate;
                        return relDate ? String(relDate).substring(0, 4) : "Lançamento N/A";
                      })()} · {systemNamesMap[selectedGame.system?.toLowerCase() || ''] || system.fullname}
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

                          <button
                            onClick={() => {
                              setShowContextMenu(false);
                              handleOpenMetadataSidebar();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <Edit3 className="w-4 h-4 text-emerald-400" />
                            <span>Editar metadados</span>
                          </button>

                          {/* Separator */}
                          <div className="my-1 border-t border-white/5" />

                          <button
                            onClick={() => {
                              setShowContextMenu(false);
                              window.api.startScrape({ systemName: system.name, gamePath: selectedGame.path });
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <CloudDownload className="w-4 h-4 text-cyan-400" />
                            <span>Buscar metadados (Scrape)</span>
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
                    className="flex items-center justify-center p-2 bg-[#1a1a1a] hover:bg-white/5 border border-white/5 rounded-md transition cursor-pointer relative group text-white/80"
                  >
                    <Heart className={`w-4 h-4 ${selectedGame.favorite ? "fill-red-500 text-red-500" : "text-white/60"}`} />
                    
                    {/* Popper/Tooltip */}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-[10px] text-white rounded opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10">
                      {selectedGame.favorite ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
                    </span>
                  </button>

                  <button
                    onClick={handleOpenMetadataSidebar}
                    className="flex items-center justify-center p-2 bg-[#1a1a1a] hover:bg-white/5 border border-white/5 rounded-md transition cursor-pointer relative group text-white/80"
                  >
                    <Edit3 className="w-4 h-4 text-white/60 group-hover:text-emerald-400 transition-colors" />
                    
                    {/* Popper/Tooltip */}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-[10px] text-white rounded opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10">
                      Editar Metadados
                    </span>
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

                  {hasManual && (
                    <button
                      onClick={() => handleOpenManual(selectedGame.manual!)}
                      className="flex items-center justify-center p-2 bg-[#1a1a1a] hover:bg-accent/20 hover:text-accent border border-white/5 hover:border-accent/30 rounded-md text-white/85 transition cursor-pointer relative group"
                    >
                      <BookOpen className="w-4 h-4" />
                      
                      {/* Popper/Tooltip */}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-[10px] text-white rounded opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10">
                        Visualizar Manual
                      </span>
                    </button>
                  )}
                  
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
                            {formatPlayers(players)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Emulator/Core Select Option */}
                {canSwitchEmulator && (
                  <div className="flex flex-col gap-1.5 text-left">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Emulador / Core</span>
                    <div className="flex items-stretch gap-2">
                      <div className="min-w-0 flex-1">
                        <RadixSelect
                          value={selectValue}
                          onValueChange={handleEmulatorValueChange}
                          options={emulatorChoices.map(choice => ({ label: choice.label, value: choice.value }))}
                          placeholder="Padrão (Auto)"
                        />
                      </div>
                      {emuToConfig && (
                        <button
                          onClick={() => {
                            onOpenTool?.("settings", emuToConfig, selectedCoreToConfig);
                          }}
                          className="group relative flex w-9 shrink-0 items-center justify-center rounded-md border border-white/5 bg-[#1a1a1a] text-accent transition hover:border-accent-focus hover:bg-accent-light cursor-pointer"
                          aria-label={`Configurar ${emuLabelToConfig}`}
                        >
                          <Settings className="w-4 h-4 transition-transform group-hover:rotate-45" />
                          <span className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 whitespace-nowrap rounded-md border border-white/10 bg-black px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                            Configurar {emuLabelToConfig}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Play Button */}
                <div className="flex flex-col gap-2 mt-auto pt-3">
                  <button
                    onClick={() => onLaunchGame(selectedGame, system)}
                    className="w-[calc(100%-8px)] mx-auto hover:scale-[1.02] hover:brightness-110 hover:shadow-lg transition-all rounded-md py-3 text-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-white outline outline-2 outline-offset-2"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-color) 0%, var(--accent-color-hover) 100%)',
                      outlineColor: 'var(--accent-color)'
                    }}
                  >
                    <Play className="w-6 h-6 fill-white text-white" />
                    <span>Jogar</span>
                  </button>
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </div>

      {/* Full Window PDF Manual Overlay */}
      {showPdfViewer && pdfUrl && (
        <div className="absolute inset-0 bg-black/95 z-[999] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <button 
            onClick={() => setShowPdfViewer(false)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition cursor-pointer z-[1000]"
            title="Fechar Manual"
          >
            <X className="w-5 h-5" />
          </button>
          <iframe 
            src={pdfUrl} 
            className="w-[95%] h-[90%] rounded-md border border-white/10 shadow-2xl bg-black" 
          />
        </div>
      )}
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

      {/* Compact, non-blocking scraper notification */}
      {isScraping && scrapeProgress && scrapeNotificationMode && (
        <div className="fixed left-1/2 top-6 z-[999] w-80 max-w-[calc(100vw-32px)] -translate-x-1/2 select-none text-white">
          <div className="toast-root glass-strong overflow-hidden rounded-xl border border-white/10 p-3.5 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <CloudDownload className="h-5 w-5 animate-pulse text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-white">
                    Scraper · {scrapeProgress.systemName}
                  </p>
                  <span className="shrink-0 text-[10px] font-bold text-accent">
                    {scrapeProgress.current} / {scrapeProgress.total}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-white/50" title={scrapeProgress.gameName}>
                  {scrapeProgress.gameName}
                </p>
              </div>
              {!preferScrapeNotification && (
                <button
                  type="button"
                  onClick={() => setScrapeDisplayAsNotification(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Expandir progresso"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={isCancellingScrape}
                onClick={() => {
                  setIsCancellingScrape(true);
                  window.api.cancelScrape();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/45 transition hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                title={isCancellingScrape ? "Cancelando..." : "Cancelar scraper"}
              >
                {isCancellingScrape ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${scrapeProgress.total > 0 ? (scrapeProgress.current / scrapeProgress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-semibold">
              <span className="text-emerald-400">{scrapeProgress.successCount} sucessos</span>
              <span className="text-red-400">{scrapeProgress.failCount} falhas</span>
              <span className="text-white/30">
                {scrapeProgress.motors ?? 1} {(scrapeProgress.motors ?? 1) === 1 ? "motor" : "motores"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Scraper Progress Overlay Modal */}
      {isScraping && scrapeProgress && !scrapeNotificationMode && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[999] select-none text-white transition-opacity duration-300">
          <div className="bg-[#0f0f12] border border-white/10 p-6 rounded-2xl w-[460px] flex flex-col gap-4 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Buscando metadados...</h3>
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mt-0.5">
                  ScreenScraper.fr · {scrapeProgress.motors ?? 1} {(scrapeProgress.motors ?? 1) === 1 ? "motor" : "motores"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScrapeDisplayAsNotification(true)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-white/50 transition hover:border-accent-focus hover:bg-accent-light hover:text-accent cursor-pointer"
                title="Continuar em modo notificação"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex flex-col gap-2">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Sistema</p>
                  <p className="text-xs font-semibold text-white/90 truncate mt-0.5">{`${scrapeProgress.systemName}`}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Progresso</p>
                  <p className="text-xs font-bold text-accent mt-0.5">{`${scrapeProgress.current} / ${scrapeProgress.total}`}</p>
                </div>
              </div>

              <div className="min-w-0 mt-1">
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Jogo Atual</p>
                <p className="text-xs font-semibold text-white/90 truncate mt-0.5" title={`${scrapeProgress.gameName}`}>{`${scrapeProgress.gameName}`}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden mt-2 relative">
                <div 
                  className="bg-accent h-full rounded-full transition-all duration-300"
                  style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
                />
              </div>
            </div>

            {/* Counters */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-emerald-500/10 border border-emerald-500/10 rounded-xl py-2 px-3">
                <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Sucessos</p>
                <p className="text-base font-bold text-emerald-400 mt-0.5">{`${scrapeProgress.successCount}`}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/10 rounded-xl py-2 px-3">
                <p className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Falhas</p>
                <p className="text-base font-bold text-red-400 mt-0.5">{`${scrapeProgress.failCount}`}</p>
              </div>
            </div>

            <button
              disabled={isCancellingScrape}
              onClick={() => {
                setIsCancellingScrape(true);
                window.api.cancelScrape();
              }}
              className="w-full mt-2 py-2.5 px-4 bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-white/70 border border-white/10 hover:border-red-500/20 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isCancellingScrape ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Cancelando...</span>
                </>
              ) : (
                <span>Cancelar Operação</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Scraper Manual Search Input Modal */}
      {showManualSearchModal && manualSearchData && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[1000] select-none text-white transition-opacity duration-300">
          <div className="bg-[#0f0f12] border border-white/10 p-6 rounded-2xl w-[420px] flex flex-col gap-4 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <CloudDownload className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Jogo não encontrado</h3>
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mt-0.5">Scraper Manual</p>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              O ScreenScraper não encontrou correspondência para a busca automática. Digite abaixo o nome do jogo para tentar novamente:
            </p>

            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Termo de Busca</label>
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 group-focus-within:text-accent transition duration-200 pointer-events-none" />
                <input
                  type="text"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleManualSearchSubmit();
                    }
                  }}
                  autoFocus
                  placeholder="Ex: Need for Speed Underground 2"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-accent focus:bg-white/10 transition-all"
                />
                {manualSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setManualSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition p-1 cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleManualSearchCancel}
                className="flex-1 py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button
                onClick={handleManualSearchSubmit}
                disabled={!manualSearchQuery.trim()}
                className="flex-1 py-2.5 px-4 bg-accent hover:bg-[var(--accent-color-hover)] text-white rounded-xl text-xs font-bold tracking-wide transition-all cursor-pointer text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Buscar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scraper Finished Success Modal */}
      {showScrapeFinished && scrapeFinishedData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] select-none text-white transition-opacity duration-300">
          <div className="bg-[#0f0f12] border border-white/10 p-6 rounded-2xl w-[400px] flex flex-col gap-4 shadow-2xl relative animate-in fade-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-1">
              <Check className="w-6 h-6 text-accent" />
            </div>
            
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Busca Concluída!</h3>
              <p className="text-xs text-white/50 mt-1">
                {scrapeFinishedData.success 
                  ? `Os metadados foram atualizados com sucesso.` 
                  : (scrapeFinishedData.reason || 'Ocorreu um erro ou a busca foi cancelada.')}
              </p>
            </div>

            {scrapeFinishedData.success && (
              <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Sucessos</p>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5">{`${scrapeFinishedData.count ?? 0}`}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Falhas</p>
                  <p className="text-sm font-bold text-red-400 mt-0.5">{`${scrapeFinishedData.failed ?? 0}`}</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowScrapeFinished(false)}
              className="w-full mt-2 py-2.5 px-4 bg-accent hover:bg-[var(--accent-color-hover)] text-white rounded-xl text-xs font-bold tracking-wide shadow-lg transition-all cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Right-click Context Menu */}
      {gameContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setGameContextMenu(null)} />
          <div 
            style={{ 
              top: `${Math.min(gameContextMenu.y, window.innerHeight - 250)}px`, 
              left: `${Math.min(gameContextMenu.x, window.innerWidth - 240)}px` 
            }}
            className="fixed w-56 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-2 z-50 text-white animate-in fade-in slide-in-from-top-2 duration-150 text-left"
          >
            <div className="px-3 py-1 text-[10px] text-white/40 uppercase font-semibold tracking-wider mb-1.5">
              Gerenciar jogo
            </div>
            
            <button
              onClick={() => {
                setGameContextMenu(null);
                onLaunchGame(gameContextMenu.game, system);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
            >
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
              <span>Jogar</span>
            </button>
            
            <button
              onClick={() => {
                setGameContextMenu(null);
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
                setGameContextMenu(null);
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
                setGameContextMenu(null);
                handleToggleFavorite();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
            >
              <Heart className={`w-4 h-4 ${games[gameContextMenu.index]?.favorite ? "fill-red-500 text-red-500" : "text-red-500 opacity-60"}`} />
              <span>{games[gameContextMenu.index]?.favorite ? "Remover dos Favoritos" : "Favoritar"}</span>
            </button>

            <button
              onClick={() => {
                const menuGame = games[gameContextMenu.index] || gameContextMenu.game;
                setGameContextMenu(null);
                window.api.startScrape({ systemName: system.name, gamePath: menuGame.path });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
            >
              <CloudDownload className="w-4 h-4 text-cyan-400" />
              <span>Buscar metadados (Scrape)</span>
            </button>

            {/* Change Emulator Submenu */}
            {canSwitchEmulator && (() => {
              const menuGame = games[gameContextMenu.index];
              const menuGameSelectValue = !menuGame
                ? "auto"
                : (!menuGame.emulator || menuGame.emulator === "auto")
                  ? "auto"
                  : `${menuGame.emulator}:${menuGame.core || ""}`;
              const submenuOnLeft = gameContextMenu.x > window.innerWidth - 440;

              return (
                <>
                  <div className="my-1 border-t border-white/5" />
                  <div className="relative group/sub">
                    <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white">
                      <span className="flex items-center gap-2.5">
                        <Gamepad2 className="w-4 h-4 text-amber-500" />
                        <span>Trocar emulador</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                    </button>
                    
                    {/* Submenu list */}
                    <div 
                      className={`absolute top-0 w-52 bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-2 z-50 text-white hidden group-hover/sub:block ${
                        submenuOnLeft ? "right-full mr-1" : "left-full ml-1"
                      }`}
                    >
                      {emulatorChoices.map(choice => {
                        const isSelected = menuGameSelectValue === choice.value;
                        return (
                          <button
                            key={choice.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEmulatorValueChangeForGame(menuGame, choice.value);
                            }}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/10 text-left transition cursor-pointer text-white/80 hover:text-white"
                          >
                            <span className="truncate pr-2">{choice.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
    </div>
  );
}
