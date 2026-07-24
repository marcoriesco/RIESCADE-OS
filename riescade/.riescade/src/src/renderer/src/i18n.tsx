import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const SUPPORTED_LANGUAGES = [
  { value: 'auto', label: 'Automático (Windows)' },
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' }
] as const

type Language = Exclude<(typeof SUPPORTED_LANGUAGES)[number]['value'], 'auto'>
type Messages = Record<string, string>

const ptBR: Messages = {
  settings: 'Configurações', account: 'Minha Conta', interface: 'Interface',
  emulators: 'Emuladores', personalization: 'Personalização', controls: 'Controles',
  audio: 'Áudio', scraper: 'Scraper', advanced: 'Avançado', about: 'Sobre',
  interfaceDescription: 'Aparência, ícones do desktop/taskbar, tema e idioma.',
  language: 'Idioma', languageDescription: 'Idioma usado nos menus e mensagens do RIESCADE.',
  languageGroup: 'Idioma e região', automaticWindows: 'Automático (Windows)',
  desktopTaskbarIcons: 'Ícones do Desktop e Taskbar', searchToolsSystems: 'Pesquisar ferramentas ou sistemas...',
  clearSearch: 'Limpar busca', all: 'Tudo', tools: 'Ferramentas', systems: 'Sistemas',
  tool: 'Ferramenta', gameSystem: 'Sistema de Jogos', desktop: 'Desktop', taskbar: 'Taskbar',
  accountInfo: 'Informações da conta', username: 'Nome de usuário', edit: 'Editar',
  show: 'Mostrar', accountStatus: 'Status da Conta', accountOk: 'Sua conta está toda em ordem',
  accountDescription: 'Gerencie suas informações pessoais e configurações de conta.',
  online: 'Online', loadingSettings: 'Carregando configurações...', searchSetting: 'Buscar configuração...',
  reset: 'Resetar', global: 'Global', resetAll: 'Resetar Todas as Configurações',
  version: 'Versão', engine: 'Motor', system: 'Sistema'
}

const en: Messages = {
  settings: 'Settings', account: 'My Account', interface: 'Interface', emulators: 'Emulators',
  personalization: 'Personalization', controls: 'Controls', audio: 'Audio', scraper: 'Scraper',
  advanced: 'Advanced', about: 'About', interfaceDescription: 'Appearance, desktop/taskbar icons, theme and language.',
  language: 'Language', languageDescription: 'Language used in RIESCADE menus and messages.',
  languageGroup: 'Language and region', automaticWindows: 'Automatic (Windows)',
  desktopTaskbarIcons: 'Desktop and Taskbar Icons', searchToolsSystems: 'Search tools or systems...',
  clearSearch: 'Clear search', all: 'All', tools: 'Tools', systems: 'Systems', tool: 'Tool',
  gameSystem: 'Game System', desktop: 'Desktop', taskbar: 'Taskbar', accountInfo: 'Account information',
  username: 'Username', edit: 'Edit', show: 'Show', accountStatus: 'Account Status',
  accountOk: 'Your account is in good standing', accountDescription: 'Manage your personal information and account settings.',
  online: 'Online', loadingSettings: 'Loading settings...', searchSetting: 'Search settings...',
  reset: 'Reset', global: 'Global', resetAll: 'Reset All Settings', version: 'Version', engine: 'Engine', system: 'System'
}

const translations: Record<Language, Messages> = {
  pt_BR: ptBR,
  pt: { ...ptBR, languageDescription: 'Idioma utilizado nos menus e mensagens do RIESCADE.', automaticWindows: 'Automático (Windows)' },
  en,
  es: { ...en, settings: 'Configuración', account: 'Mi cuenta', emulators: 'Emuladores', personalization: 'Personalización', controls: 'Controles', advanced: 'Avanzado', about: 'Acerca de', interfaceDescription: 'Apariencia, iconos del escritorio/barra de tareas, tema e idioma.', language: 'Idioma', languageDescription: 'Idioma usado en los menús y mensajes de RIESCADE.', languageGroup: 'Idioma y región', automaticWindows: 'Automático (Windows)', desktopTaskbarIcons: 'Iconos del escritorio y barra de tareas', searchToolsSystems: 'Buscar herramientas o sistemas...', clearSearch: 'Limpiar búsqueda', all: 'Todo', tools: 'Herramientas', systems: 'Sistemas', tool: 'Herramienta', gameSystem: 'Sistema de juegos', accountInfo: 'Información de la cuenta', username: 'Nombre de usuario', edit: 'Editar', show: 'Mostrar', accountStatus: 'Estado de la cuenta', accountOk: 'Tu cuenta está en orden', accountDescription: 'Administra tu información personal y la configuración de la cuenta.', online: 'En línea', loadingSettings: 'Cargando configuración...', searchSetting: 'Buscar configuración...', reset: 'Restablecer', global: 'Global', resetAll: 'Restablecer toda la configuración', version: 'Versión', system: 'Sistema' },
  fr: { ...en, settings: 'Paramètres', account: 'Mon compte', emulators: 'Émulateurs', personalization: 'Personnalisation', controls: 'Contrôles', advanced: 'Avancé', about: 'À propos', interfaceDescription: 'Apparence, icônes du bureau/barre des tâches, thème et langue.', language: 'Langue', languageDescription: 'Langue utilisée dans les menus et messages de RIESCADE.', languageGroup: 'Langue et région', automaticWindows: 'Automatique (Windows)', desktopTaskbarIcons: 'Icônes du bureau et de la barre des tâches', searchToolsSystems: 'Rechercher des outils ou systèmes...', clearSearch: 'Effacer la recherche', all: 'Tout', tools: 'Outils', systems: 'Systèmes', tool: 'Outil', gameSystem: 'Système de jeu', accountInfo: 'Informations du compte', username: "Nom d'utilisateur", edit: 'Modifier', show: 'Afficher', accountStatus: 'État du compte', accountOk: 'Votre compte est en ordre', accountDescription: 'Gérez vos informations personnelles et les paramètres du compte.', online: 'En ligne', loadingSettings: 'Chargement des paramètres...', searchSetting: 'Rechercher un paramètre...', reset: 'Réinitialiser', resetAll: 'Réinitialiser tous les paramètres', version: 'Version', system: 'Système' },
  it: { ...en, settings: 'Impostazioni', account: 'Il mio account', emulators: 'Emulatori', personalization: 'Personalizzazione', controls: 'Controlli', advanced: 'Avanzate', about: 'Informazioni', interfaceDescription: 'Aspetto, icone desktop/barra delle applicazioni, tema e lingua.', language: 'Lingua', languageDescription: 'Lingua usata nei menu e nei messaggi di RIESCADE.', languageGroup: 'Lingua e regione', automaticWindows: 'Automatico (Windows)', desktopTaskbarIcons: 'Icone desktop e barra delle applicazioni', searchToolsSystems: 'Cerca strumenti o sistemi...', clearSearch: 'Cancella ricerca', all: 'Tutto', tools: 'Strumenti', systems: 'Sistemi', tool: 'Strumento', gameSystem: 'Sistema di gioco', accountInfo: "Informazioni sull'account", username: 'Nome utente', edit: 'Modifica', show: 'Mostra', accountStatus: "Stato dell'account", accountOk: "L'account è in ordine", accountDescription: "Gestisci le informazioni personali e le impostazioni dell'account.", online: 'Online', loadingSettings: 'Caricamento impostazioni...', searchSetting: 'Cerca impostazione...', reset: 'Ripristina', resetAll: 'Ripristina tutte le impostazioni', version: 'Versione', engine: 'Motore', system: 'Sistema' },
  de: { ...en, settings: 'Einstellungen', account: 'Mein Konto', emulators: 'Emulatoren', personalization: 'Personalisierung', controls: 'Steuerung', advanced: 'Erweitert', about: 'Über', interfaceDescription: 'Darstellung, Desktop-/Taskleistensymbole, Design und Sprache.', language: 'Sprache', languageDescription: 'Sprache für RIESCADE-Menüs und Meldungen.', languageGroup: 'Sprache und Region', automaticWindows: 'Automatisch (Windows)', desktopTaskbarIcons: 'Desktop- und Taskleistensymbole', searchToolsSystems: 'Werkzeuge oder Systeme suchen...', clearSearch: 'Suche löschen', all: 'Alle', tools: 'Werkzeuge', systems: 'Systeme', tool: 'Werkzeug', gameSystem: 'Spielsystem', accountInfo: 'Kontoinformationen', username: 'Benutzername', edit: 'Bearbeiten', show: 'Anzeigen', accountStatus: 'Kontostatus', accountOk: 'Ihr Konto ist in Ordnung', accountDescription: 'Persönliche Informationen und Kontoeinstellungen verwalten.', online: 'Online', loadingSettings: 'Einstellungen werden geladen...', searchSetting: 'Einstellung suchen...', reset: 'Zurücksetzen', resetAll: 'Alle Einstellungen zurücksetzen', version: 'Version', engine: 'Engine', system: 'System' },
  ja: { ...en, settings: '設定', account: 'マイアカウント', interface: 'インターフェース', emulators: 'エミュレーター', personalization: 'カスタマイズ', controls: 'コントロール', audio: 'オーディオ', advanced: '詳細設定', about: '情報', interfaceDescription: '外観、デスクトップ／タスクバーのアイコン、テーマ、言語。', language: '言語', languageDescription: 'RIESCADEのメニューとメッセージで使用する言語。', languageGroup: '言語と地域', automaticWindows: '自動（Windows）', desktopTaskbarIcons: 'デスクトップとタスクバーのアイコン', searchToolsSystems: 'ツールまたはシステムを検索...', clearSearch: '検索をクリア', all: 'すべて', tools: 'ツール', systems: 'システム', tool: 'ツール', gameSystem: 'ゲームシステム', accountInfo: 'アカウント情報', username: 'ユーザー名', edit: '編集', show: '表示', accountStatus: 'アカウント状態', accountOk: 'アカウントに問題はありません', accountDescription: '個人情報とアカウント設定を管理します。', online: 'オンライン', loadingSettings: '設定を読み込み中...', searchSetting: '設定を検索...', reset: 'リセット', global: 'グローバル', resetAll: 'すべての設定をリセット', version: 'バージョン', engine: 'エンジン', system: 'システム' },
  zh: { ...en, settings: '设置', account: '我的账户', interface: '界面', emulators: '模拟器', personalization: '个性化', controls: '控制器', audio: '音频', advanced: '高级', about: '关于', interfaceDescription: '外观、桌面/任务栏图标、主题和语言。', language: '语言', languageDescription: 'RIESCADE 菜单和消息所使用的语言。', languageGroup: '语言和地区', automaticWindows: '自动（Windows）', desktopTaskbarIcons: '桌面和任务栏图标', searchToolsSystems: '搜索工具或系统...', clearSearch: '清除搜索', all: '全部', tools: '工具', systems: '系统', tool: '工具', gameSystem: '游戏系统', accountInfo: '账户信息', username: '用户名', edit: '编辑', show: '显示', accountStatus: '账户状态', accountOk: '您的账户状态正常', accountDescription: '管理个人信息和账户设置。', online: '在线', loadingSettings: '正在加载设置...', searchSetting: '搜索设置...', reset: '重置', global: '全局', resetAll: '重置所有设置', version: '版本', engine: '引擎', system: '系统' }
}

function resolveLanguage(language: string): Language {
  const requested = language === 'auto' ? navigator.language : language
  const normalized = requested.replace('-', '_')
  if (normalized.toLowerCase() === 'pt_br') return 'pt_BR'
  const short = normalized.slice(0, 2).toLowerCase() as Language
  return Object.hasOwn(translations, short) ? short : 'en'
}

type I18nContextValue = {
  language: string
  resolvedLanguage: Language
  setLanguage: (language: string) => void
  t: (key: string, fallback?: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem('riescade_language') || 'auto')
  const resolvedLanguage = resolveLanguage(language)
  const setLanguage = useCallback((next: string) => {
    localStorage.setItem('riescade_language', next)
    setLanguageState(next)
  }, [])
  const t = useCallback((key: string, fallback?: string) =>
    translations[resolvedLanguage][key] ?? ptBR[key] ?? fallback ?? key, [resolvedLanguage])

  useEffect(() => {
    document.documentElement.lang = resolvedLanguage === 'pt_BR' ? 'pt-BR' : resolvedLanguage
  }, [resolvedLanguage])

  const value = useMemo(() => ({ language, resolvedLanguage, setLanguage, t }), [language, resolvedLanguage, setLanguage, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
