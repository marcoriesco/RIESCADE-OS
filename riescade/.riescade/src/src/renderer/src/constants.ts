import {
  Library, Settings as SettingsIcon, Gamepad2, Database
} from "lucide-react";

export const TOOL_APPS = [
  { id: "library",      name: "Biblioteca",     icon: Library,      color: "from-indigo-500 to-violet-600", initialSize: { w: 980, h: 620 } },
  { id: "settings",     name: "Configurações",  icon: SettingsIcon, color: "from-zinc-500 to-zinc-700",     initialSize: { w: 820, h: 560 } },
  { id: "database",     name: "Banco de Dados",  icon: Database,     color: "from-emerald-500 to-teal-600",  initialSize: { w: 1024, h: 680 } },
];

export const getSystemTheme = (sysName: string) => {
  return { icon: Gamepad2, color: "from-indigo-500 to-violet-600", bg: "radial-gradient(1200px at 50% 50%, #222222ff 0%, #030303ff 100%)" };
};
