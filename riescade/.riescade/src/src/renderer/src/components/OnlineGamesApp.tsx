import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, Gamepad2, Loader2, LockKeyhole, Radio,
  RefreshCw, Search, ShieldCheck, Signal, Users, Wifi
} from "lucide-react";
import { ScrollArea } from "./ScrollArea";

type Room = {
  id: string;
  nickname: string;
  gameName: string;
  systemName: string;
  core: string;
  players: number;
  maxPlayers: number;
  ping?: number | null;
  compatibility: "identical" | "compatible";
  game: any;
  system: any;
  connection: {
    mode: "client";
    host: string;
    port: number;
    session?: string;
    hasPassword: boolean;
  };
};

type CompatibilityFilter = "all" | "identical" | "compatible";
type SortMode = "relevance" | "game" | "players";

function mediaUrl(room: Room): string {
  const raw = room.game?.cover || room.game?.cover3d || room.game?.image || room.game?.thumbnail || "";
  if (!raw || raw.startsWith("http") || raw.startsWith("file://")) return raw;
  return `file:///${String(raw).replace(/\\/g, "/")}`;
}

function RoomCover({ room }: { room: Room }) {
  const [failed, setFailed] = useState(false);
  const url = mediaUrl(room);
  return (
    <div className="relative flex h-[76px] w-[116px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-fuchsia-400/10 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/10 to-black/20">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Gamepad2 className="h-7 w-7 text-fuchsia-200/55" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
    </div>
  );
}

export default function OnlineGamesApp() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [compatibilityFilter, setCompatibilityFilter] = useState<CompatibilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    setError("");
    try {
      setRooms(await window.api.listNetplayRooms());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const identicalCount = rooms.filter(room => room.compatibility === "identical").length;
  const compatibleCount = rooms.filter(room => room.compatibility === "compatible").length;

  const visibleRooms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const result = rooms.filter(room => {
      const matchesType = compatibilityFilter === "all" || room.compatibility === compatibilityFilter;
      const matchesQuery = !query || [
        room.gameName, room.systemName, room.core, room.nickname
      ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(query));
      return matchesType && matchesQuery;
    });
    return result.sort((left, right) => {
      if (sortMode === "game") return left.gameName.localeCompare(right.gameName, "pt-BR");
      if (sortMode === "players") return right.players - left.players;
      if (left.compatibility !== right.compatibility) return left.compatibility === "identical" ? -1 : 1;
      return left.gameName.localeCompare(right.gameName, "pt-BR");
    });
  }, [compatibilityFilter, rooms, search, sortMode]);

  const joinRoom = useCallback(async (room: Room) => {
    setJoiningRoom(room.id);
    setError("");
    try {
      const settings = await window.api.getSettings();
      const nickname = String(settings?.["global.netplay.nickname"]?.value || "RIESCADE Player");
      await window.api.launchNetplay(room.game, room.system, {
        mode: "client",
        host: room.connection.host,
        port: room.connection.port,
        session: room.connection.session,
        nickname,
        announce: false,
        useRelay: Boolean(room.connection.session)
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setJoiningRoom(null);
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_22%_0%,rgba(168,85,247,0.07),transparent_38%),linear-gradient(180deg,rgba(10,11,17,0.96),rgba(8,9,14,0.98))] text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-fuchsia-400/25 bg-fuchsia-500/15 text-fuchsia-200 shadow-[0_0_30px_rgba(217,70,239,0.09)]">
            <Radio className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">Jogos Online</h1>
            <p className="mt-1 text-[13px] text-white/48">Salas compatíveis com seus jogos e cores do RetroArch</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.035] px-5 py-3 text-xs font-semibold text-white/80 transition hover:border-fuchsia-400/30 hover:bg-white/[0.07] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar salas
        </button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col px-8 py-5">
          <section className="grid shrink-0 grid-cols-3 gap-3.5">
            <SummaryCard icon={<Users />} label="Salas encontradas" value={rooms.length} tone="fuchsia" />
            <SummaryCard icon={<Users />} label="Jogos idênticos" value={identicalCount} tone="emerald" />
            <SummaryCard icon={<Gamepad2 />} label="Jogos compatíveis" value={compatibleCount} tone="blue" />
          </section>

          <section className="mt-5 flex shrink-0 items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.025] px-5 py-3">
            <Search className="h-5 w-5 shrink-0 text-white/38" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar salas ou jogos..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/32"
            />
            <FilterSelect
              value={compatibilityFilter}
              onChange={value => setCompatibilityFilter(value as CompatibilityFilter)}
              options={[
                ["all", "Todos os jogos"],
                ["identical", "Jogos idênticos"],
                ["compatible", "Jogos compatíveis"]
              ]}
            />
            <FilterSelect
              value={sortMode}
              onChange={value => setSortMode(value as SortMode)}
              options={[
                ["relevance", "Ordenar: Relevância"],
                ["game", "Ordenar: Jogo"],
                ["players", "Ordenar: Jogadores"]
              ]}
            />
          </section>

          <section className="mt-3.5 min-h-[260px] flex-1">
            {loading && rooms.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-fuchsia-400" />
                <p className="text-sm font-semibold">Buscando salas disponíveis</p>
                <p className="mt-1 text-xs text-white/40">Comparando jogos e cores instalados...</p>
              </div>
            ) : error && rooms.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-red-400/15 bg-red-400/[0.035] px-8 text-center">
                <Wifi className="mb-3 h-7 w-7 text-red-300/70" />
                <p className="text-sm font-semibold text-red-200">Lobby temporariamente indisponível</p>
                <p className="mt-1 max-w-md text-xs text-white/40">{error}</p>
              </div>
            ) : rooms.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] px-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-fuchsia-400/15 bg-fuchsia-500/10">
                  <Users className="h-6 w-6 text-fuchsia-200/65" />
                </div>
                <h2 className="text-base font-bold">Nenhuma sala compatível agora</h2>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-white/42">
                  Abra o menu de um jogo instalado que usa RetroArch e escolha “Jogar online” para criar sua sala.
                </p>
              </div>
            ) : visibleRooms.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] text-sm text-white/42">
                Nenhuma sala corresponde aos filtros selecionados.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRooms.map(room => (
                  <article
                    key={room.id}
                    className="grid min-h-[108px] grid-cols-[116px_minmax(240px,1fr)_145px_115px_150px] items-center gap-5 rounded-2xl border border-white/[0.085] bg-white/[0.022] px-5 py-3.5 transition hover:border-fuchsia-400/20 hover:bg-white/[0.035]"
                  >
                    <RoomCover room={room} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <h3 className="truncate text-[15px] font-bold text-white/95" title={room.gameName}>{room.gameName}</h3>
                        <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${
                          room.compatibility === "identical"
                            ? "border-sky-400/25 bg-sky-400/[0.07] text-sky-300"
                            : "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300"
                        }`}>
                          <CheckCircle2 className="h-3 w-3" />
                          {room.compatibility === "identical" ? "Idêntico" : "Compatível"}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-xs text-white/48">{room.systemName} <span className="px-1 text-white/22">·</span> {room.core}</p>
                      <p className="mt-1 truncate text-[11px] text-white/34">Sala de {room.nickname}</p>
                    </div>
                    <Metric icon={<Users />} label="Jogadores" value={`${room.players}/${room.maxPlayers}`} />
                    <Metric
                      icon={<Signal />}
                      label="Ping"
                      value={room.ping ? `${room.ping}ms` : "—"}
                      valueClass={room.ping && room.ping > 150 ? "text-red-400" : room.ping && room.ping >= 80 ? "text-amber-300" : "text-emerald-300"}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void joinRoom(room)}
                        disabled={joiningRoom !== null || room.connection.hasPassword}
                        title={room.connection.hasPassword ? "Sala protegida por senha" : "Entrar na sala"}
                        className={`flex min-w-[112px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition disabled:cursor-not-allowed ${
                          room.connection.hasPassword
                            ? "border border-fuchsia-400/15 bg-fuchsia-500/10 text-fuchsia-300"
                            : "bg-fuchsia-600 text-white shadow-[0_8px_24px_rgba(192,38,211,0.18)] hover:bg-fuchsia-500"
                        }`}
                      >
                        {joiningRoom === room.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : room.connection.hasPassword ? (
                          <LockKeyhole className="h-4 w-4" />
                        ) : (
                          <Gamepad2 className="h-4 w-4" />
                        )}
                        {room.connection.hasPassword ? "Com senha" : "Entrar"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <footer className="mt-4 flex shrink-0 items-center justify-between border-t border-white/[0.07] px-1 pt-4 text-[11px] text-white/42">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-white/55" /> Conexão segura pelo RetroArch</span>
            <span className="flex items-center gap-6">
              <Legend color="bg-emerald-400" label="Bom < 80ms" />
              <Legend color="bg-amber-300" label="Médio 80–150ms" />
              <Legend color="bg-red-400" label="Ruim > 150ms" />
            </span>
          </footer>
        </div>
      </ScrollArea>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: {
  icon: React.ReactElement;
  label: string;
  value: number;
  tone: "fuchsia" | "emerald" | "blue";
}) {
  const styles = {
    fuchsia: { border: "border-fuchsia-400/15", icon: "bg-fuchsia-500/15 text-fuchsia-300", text: "text-fuchsia-300" },
    emerald: { border: "border-emerald-400/15", icon: "bg-emerald-500/12 text-emerald-300", text: "text-emerald-300" },
    blue: { border: "border-sky-400/20", icon: "bg-sky-500/12 text-sky-300", text: "text-sky-300" }
  }[tone];
  return (
    <div className={`flex min-h-[92px] items-center gap-4 rounded-2xl border bg-white/[0.018] px-5 ${styles.border}`}>
      <span className={`flex h-12 w-12 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5 ${styles.icon}`}>{icon}</span>
      <span>
        <span className={`block text-[10px] font-bold uppercase tracking-wider ${styles.text} opacity-75`}>{label}</span>
        <span className="mt-1 block text-2xl font-bold text-white">{value}</span>
      </span>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="relative shrink-0">
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="min-w-[165px] appearance-none rounded-full border border-white/12 bg-[#11121a] py-2.5 pl-4 pr-9 text-xs font-medium text-white/72 outline-none transition hover:border-white/20 focus:border-fuchsia-400/35"
      >
        {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
    </label>
  );
}

function Metric({ icon, label, value, valueClass = "text-white" }: {
  icon: React.ReactElement;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border-l border-white/[0.07] pl-5">
      <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-white/35">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}
      </p>
      <p className={`mt-2 text-[17px] font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}
