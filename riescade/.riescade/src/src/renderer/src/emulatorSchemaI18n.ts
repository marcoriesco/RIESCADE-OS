type SupportedSchemaLanguage = 'pt_BR' | 'pt' | 'en' | 'es' | 'fr' | 'it' | 'de' | 'ja' | 'zh'

const PORTUGUESE_TERMS: Record<string, string> = {
  AUTO: 'Automático',
  AUTOMATIC: 'Automático',
  DEFAULT: 'Padrão',
  NONE: 'Nenhum',
  YES: 'Sim',
  NO: 'Não',
  ON: 'Ativado',
  OFF: 'Desativado',
  ENABLED: 'Ativado',
  DISABLED: 'Desativado',
  'GENERAL SETTINGS': 'Configurações gerais',
  'ADVANCED SETTINGS': 'Configurações avançadas',
  'USER INTERFACE': 'Interface do usuário',
  'GAME FIXES': 'Correções de jogos',
  'VIDEO': 'Vídeo',
  'AUDIO': 'Áudio',
  'CONTROLS': 'Controles',
  'EMULATION': 'Emulação',
  'SHADER SET': 'Conjunto de shaders',
  'INTERNAL RESOLUTION': 'Resolução interna',
  'GAME ASPECT RATIO': 'Proporção da tela',
  'ASPECT RATIO': 'Proporção da tela',
  'VERTICAL SYNC': 'Sincronização vertical',
  'BILINEAR FILTERING': 'Filtragem bilinear',
  'ANISOTROPIC FILTERING': 'Filtragem anisotrópica',
  'TRILINEAR FILTERING': 'Filtragem trilinear',
  'TEXTURE FILTER': 'Filtro de texturas',
  'PLAYER 1 CONTROLLER TYPE': 'Tipo de controle do jogador 1',
  'PLAYER 2 CONTROLLER TYPE': 'Tipo de controle do jogador 2',
  'PLAYER 3 CONTROLLER TYPE': 'Tipo de controle do jogador 3',
  'PLAYER 4 CONTROLLER TYPE': 'Tipo de controle do jogador 4',
  'CONTROLLER TYPE': 'Tipo de controle',
  'KEYBOARD LAYOUT': 'Layout do teclado',
  'LANGUAGE': 'Idioma',
  'REGION': 'Região',
  'VIDEO FORMAT': 'Formato de vídeo',
  'SHOW FRAMERATE': 'Mostrar taxa de quadros',
  'SHOW FPS': 'Mostrar FPS',
  'SHOW EMULATOR MENU BAR': 'Mostrar barra de menu do emulador',
  'USE ANALOG STICK': 'Usar controle analógico',
  'USE MOUSE': 'Usar mouse',
  'ALLOW DIAGONALS': 'Permitir diagonais',
  'ENABLE DIRECTINPUT': 'Ativar DirectInput',
  'GUN TYPE': 'Tipo de pistola',
  'INTEGER SCALING (PIXEL PERFECT)': 'Escala inteira (pixel perfeito)',
  'SMOOTH GAMES (FILTRAGEM BILINEAR)': 'Suavizar jogos (filtragem bilinear)',
  'SCANLINES ATIVADO NTESC FILTERS': 'Ativar scanlines nos filtros NTSC',
  'FULL KEEP ASPECT 4/3': 'Tela cheia mantendo a proporção 4:3',
  'FULL KEEP ASPECT 8/7': 'Tela cheia mantendo a proporção 8:7',
  'FORCED 1X': 'Forçado 1x',
  'SIMPLE 2X': 'Simples 2x',
  'SIMPLE 3X': 'Simples 3x',
  'SIMPLE 4X': 'Simples 4x',
  'TV MODE': 'Modo TV',
  'TV MODE 3X': 'Modo TV 3x',
  'DOT MATRIX 3X': 'Matriz de pontos 3x',
  'HIGH RESOLUTION': 'Alta resolução',
  'FAST BOOT': 'Inicialização rápida',
  'FULL BOOT': 'Inicialização completa',
  'ENABLE CHEATS': 'Ativar trapaças',
  'DISABLE MOUSE': 'Desativar mouse',
  'CUSTOM TEXTURES': 'Texturas personalizadas',
  'SCREEN LAYOUT POSITIONING': 'Posicionamento das telas',
  'SWAP SCREEN': 'Trocar telas',
  'CROP OVERSCAN': 'Recortar overscan',
  'WIDESCREEN': 'Tela ampla',
  'WIDESCREEN HACK': 'Correção para tela ampla',
  'FORCE': 'Forçar',
  'ENABLE': 'Ativar',
  'DISABLE': 'Desativar',
  'SHOW': 'Mostrar',
  'HIDE': 'Ocultar',
  'USE': 'Usar',
  'ALLOW': 'Permitir',
  'PLAYER': 'Jogador',
  'CONTROLLER': 'Controle',
  'TYPE': 'Tipo',
  'SCREEN': 'Tela',
  'FILTER': 'Filtro',
  'MODE': 'Modo',
  'QUALITY': 'Qualidade',
  'RESOLUTION': 'Resolução',
  'OUTPUT': 'Saída',
  'INPUT': 'Entrada'
}

const PORTUGUESE_SENTENCES: Record<string, string> = {
  'Apply a Vídeo filter to the output image.': 'Aplica um filtro de vídeo à imagem de saída.',
  'Use left analog stick in addition to dpad.': 'Usa o controle analógico esquerdo além do direcional digital.',
  'Use Left analog stick instead of D-PAD for controls.': 'Usa o controle analógico esquerdo no lugar do direcional digital.',
  'Sets the player controller type.': 'Define o tipo de controle do jogador.',
  'Define type of controller emulated.': 'Define o tipo de controle emulado.',
  'Improve the resolution at the cost of increased performance requirements.':
    'Melhora a resolução, mas exige mais desempenho.',
  'Improve fidelity of 3D models at the cost of increased performance requirements.':
    'Melhora a fidelidade dos modelos 3D, mas exige mais desempenho.',
  'Resolution can only be changed when using OpenGL video driver.':
    'A resolução só pode ser alterada ao usar o driver de vídeo OpenGL.'
}

const TECHNICAL_WORDS = new Set([
  '3DFX', 'API', 'BIOS', 'CPU', 'CRT', 'Direct3D', 'DirectDraw', 'DirectInput', 'D-Pad',
  'FMV', 'FPS', 'GPU', 'HDR', 'NTSC', 'OpenGL', 'PAL', 'RAM', 'RGB', 'S-Video',
  'V-Sync', 'Vulkan', 'XInput'
])

function sentenceCase(text: string): string {
  if (!text || !/[A-ZÀ-Ú]{3}/.test(text)) return text
  const lowered = text.toLocaleLowerCase('pt-BR')
  const normalized = lowered.charAt(0).toLocaleUpperCase('pt-BR') + lowered.slice(1)
  return normalized.replace(/\b[\w-]+\b/g, word => {
    const technical = [...TECHNICAL_WORDS].find(item => item.toLocaleLowerCase('pt-BR') === word)
    return technical || word
  })
}

export function localizeEmulatorSchemaText(
  text: string | undefined,
  language: SupportedSchemaLanguage
): string | undefined {
  if (!text || (language !== 'pt_BR' && language !== 'pt')) return text
  if (PORTUGUESE_SENTENCES[text]) return PORTUGUESE_SENTENCES[text]

  const prefix = text.match(/^(\[[^\]]+\]\s*)/)
  const body = prefix ? text.slice(prefix[0].length) : text
  const exact = PORTUGUESE_TERMS[body.toLocaleUpperCase('en-US')]
  if (exact) return `${prefix?.[0] || ''}${exact}`

  let translated = body
  const phrases = Object.entries(PORTUGUESE_TERMS)
    .filter(([term]) => term.includes(' '))
    .sort(([a], [b]) => b.length - a.length)
  for (const [term, replacement] of phrases) {
    translated = translated.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replacement)
  }

  return `${prefix?.[0] || ''}${sentenceCase(translated)}`
}
