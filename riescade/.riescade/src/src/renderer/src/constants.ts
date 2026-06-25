import {
  Settings as SettingsIcon, Gamepad2, Database, Heart, Folder
} from "lucide-react";

export const TOOL_APPS = [
  { id: "settings",     name: "Configurações",  icon: SettingsIcon, color: "from-zinc-500 to-zinc-700",     initialSize: { w: 820, h: 560 } },
  { id: "database",     name: "Banco de Dados",  icon: Database,     color: "from-emerald-500 to-teal-600",  initialSize: { w: 1024, h: 680 } },
  { id: "all",          name: "Todos os Jogos",  icon: Gamepad2,     color: "from-blue-500 to-indigo-600",   initialSize: { w: 1024, h: 680 } },
  { id: "favorites",    name: "Favoritos",      icon: Heart,        color: "from-rose-500 to-pink-600",     initialSize: { w: 1024, h: 680 } },
  { id: "collections",  name: "Coleções",       icon: Folder,       color: "from-amber-500 to-orange-600",  initialSize: { w: 1024, h: 680 } },
];

export const getSystemTheme = (sysName: string) => {
  return { icon: Gamepad2, color: "from-indigo-500 to-violet-600", bg: "radial-gradient(1200px at 50% 50%, #222222ff 0%, #030303ff 100%)" };
};

