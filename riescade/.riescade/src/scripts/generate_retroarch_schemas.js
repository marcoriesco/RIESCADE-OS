const fs = require('fs');
const path = require('path');

const projectSrcDir = path.resolve(__dirname, '..');
const cfgPath = path.resolve(projectSrcDir, '..', '..', '..', 'es_features.cfg');
const schemasDir = path.resolve(projectSrcDir, '..', 'configs', 'emulator-schemas');

const PORTUGUESE_LABELS = {
  'ratio': 'Proporção de Tela',
  'video_vsync': 'Sincronização Vertical (V-Sync)',
  'integerscale': 'Escala Inteira',
  'disableautocontrollers': 'Desativar Mapeamento Automático de Controles',
  'videomode': 'Modo de Vídeo',
  'forcefullscreen': 'Desativar Tela Cheia',
  'RotateScreen': 'Rotacionar Tela',
  'MonitorIndex': 'Índice do Monitor',
  'GPUIndex': 'Índice da GPU',
  'CRTSwitch': 'CRT SwitchRes',
  'CRTSuperRes': 'Super Resolução CRT',
  'enable_hdr': 'Ativar HDR',
  'videofilters': 'Filtros de Vídeo',
  'video_hard_sync': 'Sincronização Rígida de GPU',
  'video_swap_interval': 'Intervalo de Troca de Quadros',
  'video_black_frame_insertion': 'Inserção de Quadros Pretos',
  'vrr_runloop_enable': 'Suporte a VRR / G-Sync',
  'smooth': 'Suavização Bilinear',
  'audio_resampler': 'Reamostrador de Áudio',
  'audio_resampler_quality': 'Qualidade do Reamostrador',
  'audio_volume': 'Volume de Áudio',
  'audio_mixer_volume': 'Volume do Mixer',
  'audio_dsp_plugin': 'Plugin DSP de Áudio',
  'audio_sync': 'Sincronização de Áudio',
  'fastforward_ratio': 'Taxa de Avanço Rápido',
  'OnScreenMsg': 'Mensagens na Tela',
  'discord': 'Discord Rich Presence',
  'DrawStats': 'Exibir Estatísticas',
  'video_frame_delay_auto': 'Atraso Automático de Quadro',
  'secondinstance': 'Runahead em Segunda Instância',
  'preemptive_frames': 'Quadros Preemptivos',
  'runahead': 'Quadros de Runahead',
  'input_poll_type_behavior': 'Comportamento de Polling de Entrada',
  'video_driver': 'Driver de Vídeo',
  'audio_driver': 'Driver de Áudio',
  'input_driver': 'Driver de Entrada',
  'libretro_rawinput': 'Forçar Raw Input',
  'pause_on_disconnect': 'Pausar ao Desconectar Controle',
  'analogToDpad': 'Mapear Analógico para D-Pad',
  'analog_deadzone': 'Zona Morta do Analógico',
  'analog_sensitivity': 'Sensibilidade do Analógico',
  'force1pOnly': 'Forçar Apenas Jogador 1'
};

const BASE_CHOICES = {
  'ratio': [
    { label: 'Automático', value: 'auto' },
    { label: '4:3', value: '4/3' },
    { label: '16:9', value: '16/9' },
    { label: '16:10', value: '16/10' },
    { label: '1:1', value: '1/1' },
    { label: '21:9', value: '21/9' },
    { label: '8:7', value: '8/7' },
    { label: 'NTSC', value: 'NTSC' },
    { label: 'PAL', value: 'PAL' },
    { label: 'Stretched', value: 'Stretch' }
  ],
  'video_driver': [
    { label: 'Automático', value: 'auto' },
    { label: 'Vulkan', value: 'vulkan' },
    { label: 'OpenGL (gl)', value: 'gl' },
    { label: 'OpenGL Core (glcore)', value: 'glcore' },
    { label: 'Direct3D 11 (d3d11)', value: 'd3d11' },
    { label: 'Direct3D 12 (d3d12)', value: 'd3d12' }
  ],
  'audio_driver': [
    { label: 'Automático', value: 'auto' },
    { label: 'WASAPI', value: 'wasapi' },
    { label: 'DirectSound', value: 'dsound' },
    { label: 'SDL2', value: 'sdl2' },
    { label: 'XAudio2', value: 'xaudio' }
  ],
  'input_driver': [
    { label: 'Automático', value: 'auto' },
    { label: 'Raw Input (raw)', value: 'raw' },
    { label: 'XInput (xinput)', value: 'xinput' },
    { label: 'DirectInput (dinput)', value: 'dinput' },
    { label: 'SDL2', value: 'sdl2' }
  ]
};

const GROUP_MAP = {
  'GENERAL SETTINGS': { id: 'general', title: 'Geral', icon: 'settings', order: 1 },
  'VIDEO': { id: 'graphics', title: 'Gráficos', icon: 'monitor', order: 2 },
  'VISUAL RENDERING': { id: 'visual_rendering', title: 'Renderização Visual', icon: 'palette', order: 3 },
  'SCREEN SYNC': { id: 'screen_sync', title: 'Sincronização de Tela', icon: 'share2', order: 4 },
  'AUDIO': { id: 'audio', title: 'Áudio', icon: 'volume2', order: 5 },
  'EMULATION': { id: 'emulation', title: 'Emulação', icon: 'cpu', order: 6 },
  'USER INTERFACE': { id: 'ui', title: 'Interface', icon: 'cog', order: 7 },
  'LATENCY REDUCTION': { id: 'latency', title: 'Latência', icon: 'wrench', order: 8 },
  'DRIVERS': { id: 'drivers', title: 'Drivers', icon: 'cpu', order: 9 },
  'CONTROLS': { id: 'controls', title: 'Controles', icon: 'gamepad2', order: 10 }
};

function parseAttr(line, attr) {
  const match = line.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function run() {
  console.log('Cleaning up old core_*.schema.json and legacy schemas...');
  const files = fs.readdirSync(schemasDir);
  for (const f of files) {
    if (f.startsWith('core_') || f === 'libretro.schema.json' || f === 'angle.schema.json') {
      fs.unlinkSync(path.join(schemasDir, f));
    }
  }

  console.log('Reading es_features.cfg...');
  const content = fs.readFileSync(cfgPath, 'utf8');
  const lines = content.split(/\r?\n/);

  let inRetroArch = false;
  let inCore = false;
  let currentCoreName = '';

  const retroArchGroups = {};
  const coreOptions = [];
  const coreNamesSet = new Set();

  function ensureGroup(gId, gTitle, gIcon, gOrder) {
    if (!retroArchGroups[gId]) {
      retroArchGroups[gId] = {
        id: gId,
        title: gTitle,
        icon: gIcon || 'settings',
        order: gOrder || 99,
        options: []
      };
    }
    return retroArchGroups[gId];
  }

  let currentFeature = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('<emulator name="libretro, angle"') || line.includes('<emulator name="libretro"')) {
      inRetroArch = true;
      continue;
    }

    if (inRetroArch && line.includes('</emulator>')) {
      inRetroArch = false;
      break;
    }

    if (!inRetroArch) continue;

    // Core start
    if (line.startsWith('<core name=')) {
      inCore = true;
      currentCoreName = parseAttr(line, 'name') || '';
      const names = currentCoreName.split(',').map(s => s.trim()).filter(Boolean);
      for (const n of names) coreNamesSet.add(n);
      continue;
    }

    if (inCore && line.includes('</core>')) {
      inCore = false;
      currentCoreName = '';
      currentFeature = null;
      continue;
    }

    // Process sharedFeature
    if (line.startsWith('<sharedFeature')) {
      const val = parseAttr(line, 'value');
      const gName = parseAttr(line, 'group') || parseAttr(line, 'submenu') || 'GENERAL SETTINGS';
      if (!val) continue;

      const label = PORTUGUESE_LABELS[val] || val;
      let type = 'select';
      let values = BASE_CHOICES[val] || [{ label: 'Automático', value: 'auto' }];

      if (['video_vsync', 'integerscale', 'disableautocontrollers', 'forcefullscreen', 'enable_hdr', 'smooth', 'audio_sync', 'vrr_runloop_enable', 'libretro_rawinput', 'pause_on_disconnect', 'force1pOnly'].includes(val)) {
        type = 'toggle';
        values = undefined;
      }

      const primaryCore = currentCoreName.split(',')[0].trim().toLowerCase();
      const optObj = {
        id: inCore ? `${primaryCore}_${val}` : val,
        label: inCore ? `[${primaryCore.toUpperCase()}] ${label}` : label,
        description: `Configuração para ${label.toLowerCase()}.`,
        type: type,
        default: 'auto',
        configKey: val
      };

      if (inCore) {
        optObj.core = primaryCore;
      }

      if (values) optObj.values = values;
      if (val === 'forcefullscreen') optObj.inheritsGlobal = 'fullscreen';
      if (val === 'video_driver') optObj.inheritsGlobal = 'video_driver';
      if (val === 'audio_driver') optObj.inheritsGlobal = 'audio_driver';

      if (!inCore) {
        const info = GROUP_MAP[gName] || { id: gName.toLowerCase().replace(/\s+/g, '_'), title: gName, icon: 'settings', order: 99 };
        const group = ensureGroup(info.id, info.title, info.icon, info.order);
        if (!group.options.some(o => o.id === optObj.id)) {
          group.options.push(optObj);
        }
      } else {
        if (!coreOptions.some(o => o.id === optObj.id)) {
          coreOptions.push(optObj);
        }
      }
      continue;
    }

    // Process feature
    if (line.startsWith('<feature')) {
      const val = parseAttr(line, 'value');
      const fName = parseAttr(line, 'name');
      const gName = parseAttr(line, 'group') || 'ADVANCED SETTINGS';
      const desc = parseAttr(line, 'description');
      const preset = parseAttr(line, 'preset');

      if (!val) continue;

      let type = 'select';
      let values = [];

      if (preset === 'switchauto' || preset === 'switch') {
        type = 'toggle';
        values = undefined;
      }

      const rawLabel = fName || PORTUGUESE_LABELS[val] || val;
      const primaryCore = currentCoreName.split(',')[0].trim().toLowerCase();
      const displayLabel = inCore ? `[${primaryCore.toUpperCase()}] ${rawLabel}` : rawLabel;

      currentFeature = {
        id: inCore ? `${primaryCore}_${val}` : val,
        label: displayLabel,
        description: desc || `Configuração para ${rawLabel}.`,
        type: type,
        default: 'auto',
        configKey: val,
        groupName: gName,
        values: values
      };

      if (inCore) {
        currentFeature.core = primaryCore;
      }

      if (line.endsWith('/>')) {
        if (currentFeature.type === 'select' && (!currentFeature.values || currentFeature.values.length === 0)) {
          currentFeature.values = [{ label: 'Automático', value: 'auto' }];
        }

        if (!inCore) {
          const info = GROUP_MAP[currentFeature.groupName] || { id: currentFeature.groupName.toLowerCase().replace(/\s+/g, '_'), title: currentFeature.groupName, icon: 'settings', order: 99 };
          const group = ensureGroup(info.id, info.title, info.icon, info.order);
          const { groupName, ...opt } = currentFeature;
          if (!group.options.some(o => o.id === opt.id)) {
            group.options.push(opt);
          }
        } else {
          const { groupName, ...opt } = currentFeature;
          if (!coreOptions.some(o => o.id === opt.id)) {
            coreOptions.push(opt);
          }
        }
        currentFeature = null;
      }
      continue;
    }

    if (currentFeature && line.startsWith('<choice')) {
      const cName = parseAttr(line, 'name');
      const cVal = parseAttr(line, 'value');
      if (cName && cVal !== null) {
        if (!currentFeature.values) currentFeature.values = [];
        currentFeature.values.push({ label: cName, value: cVal });
      }
      continue;
    }

    if (currentFeature && line.includes('</feature>')) {
      if (!inCore) {
        const info = GROUP_MAP[currentFeature.groupName] || { id: currentFeature.groupName.toLowerCase().replace(/\s+/g, '_'), title: currentFeature.groupName, icon: 'settings', order: 99 };
        const group = ensureGroup(info.id, info.title, info.icon, info.order);
        const { groupName, ...opt } = currentFeature;
        if (!group.options.some(o => o.id === opt.id)) {
          group.options.push(opt);
        }
      } else {
        const { groupName, ...opt } = currentFeature;
        if (!coreOptions.some(o => o.id === opt.id)) {
          coreOptions.push(opt);
        }
      }
      currentFeature = null;
      continue;
    }
  }

  // Create single "Cores Libretro" group
  const coreNamesList = Array.from(coreNamesSet).sort();
  const coreSelectOption = {
    id: 'retroarch_core',
    label: 'SELECIONAR CORE',
    description: 'Escolha o Core Libretro ativo para visualizar e alterar suas opções específicas.',
    type: 'select',
    default: 'auto',
    configKey: 'retroarch_core',
    values: [
      { label: 'Todos os Cores', value: 'auto' },
      ...coreNamesList.map(c => ({ label: c.toUpperCase(), value: c }))
    ]
  };

  const coresGroup = {
    id: 'cores',
    title: 'Cores Libretro',
    icon: 'cpu',
    order: 11,
    options: [coreSelectOption, ...coreOptions]
  };

  retroArchGroups['cores'] = coresGroup;

  const sortedGroups = Object.values(retroArchGroups).sort((a, b) => a.order - b.order);

  const retroArchSchema = {
    $schema: 'riescade-emulator-schema-v1',
    id: 'retroarch',
    name: 'RETROARCH',
    description: 'Configurações do emulador RetroArch e Cores Libretro.',
    icon: 'retroarch',
    configFiles: [],
    globalMappings: {
      forcefullscreen: { configKey: 'forcefullscreen', globalKey: 'fullscreen' },
      video_driver: { configKey: 'video_driver', globalKey: 'video_driver' },
      audio_driver: { configKey: 'audio_driver', globalKey: 'audio_driver' }
    },
    groups: sortedGroups
  };

  const retroArchSchemaPath = path.join(schemasDir, 'retroarch.schema.json');
  fs.writeFileSync(retroArchSchemaPath, JSON.stringify(retroArchSchema, null, 2), 'utf8');
  console.log(`Unified retroarch.schema.json created successfully! Core options tagged with core property.`);
}

run();
