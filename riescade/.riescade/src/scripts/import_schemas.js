const fs = require('fs');
const path = require('path');

// Target emulator from command line arguments (e.g. "pcsx2")
const targetEmu = process.argv[2] ? process.argv[2].toLowerCase() : null;

// Paths
const projectSrcDir = path.resolve(__dirname, '..');
const esFeaturesPath = path.resolve(projectSrcDir, '..', '..', '..', 'es_features.cfg');
const programCsPath = path.resolve(projectSrcDir, 'docs', 'emulatorlauncher_src', 'emulatorLauncher', 'Program.cs');
const generatorsDir = path.resolve(projectSrcDir, 'docs', 'emulatorlauncher_src', 'emulatorLauncher', 'Generators');
const schemaOutputDir = path.resolve(projectSrcDir, '..', 'configs', 'emulator-schemas');

// Ensure output dir exists
if (!fs.existsSync(schemaOutputDir)) {
  fs.mkdirSync(schemaOutputDir, { recursive: true });
}

// 1. Load fast-xml-parser from project node_modules
const fastXmlParserPath = path.join(projectSrcDir, 'node_modules', 'fast-xml-parser');
if (!fs.existsSync(fastXmlParserPath)) {
  console.error(`Error: fast-xml-parser not found at ${fastXmlParserPath}`);
  process.exit(1);
}
const { XMLParser } = require(fastXmlParserPath);

// Translations table for Portuguese
const TRANSLATIONS = {
  // Groups
  'GENERAL SETTINGS': 'Configurações Gerais',
  'ADVANCED SETTINGS': 'Configurações Avançadas',
  'VIDEO': 'Vídeo',
  'VISUAL RENDERING': 'Visual / Renderização',
  'AUDIO': 'Áudio',
  'CONTROLS': 'Controles',
  'GAME FIXES': 'Correções de Jogo',
  'HACKS': 'Hacks / Velocidade',
  'SCREEN SYNC': 'Sincronização de Tela',
  'EMULATION': 'Emulação',
  'DRIVERS': 'Drivers',
  'USER INTERFACE': 'Interface de Usuário',
  'AI GAME TRANSLATION': 'Tradução por IA',

  // Options
  'SHADER SET': 'Conjunto de Shaders',
  'DECORATIONS': 'Molduras / Bezels',
  'GAME ASPECT RATIO': 'Proporção de Tela',
  'VERTICAL SYNC': 'Sincronização Vertical (V-Sync)',
  'INTERNAL RESOLUTION': 'Resolução Interna',
  'FMV RATIO': 'Proporção de FMV',
  'DEINTERLACE MODE': 'Modo de Desentrelaçamento',
  'DISABLE INTERLACE OFFSET': 'Desativar Offset de Interlace',
  'WIDESCREEN PATCHES': 'Patches Widescreen',
  'NO-INTERLACING PATCHES': 'Patches No-Interlace',
  'DISABLE FULLSCREEN': 'Desativar Tela Cheia',
  'ANTI-ALIASING': 'Anti-Aliasing (FXAA)',
  'BILINEAR FILTERING': 'Filtragem Bilinear',
  'TEXTURE FILTER': 'Filtragem de Texturas',
  'TRILINEAR FILTERING': 'Filtragem Trilinear',
  'ANISOTROPIC FILTERING': 'Filtragem Anisotrópica',
  'FAST BOOT': 'Inicialização Rápida (Fast Boot)',
  'FULL BOOT': 'Inicialização Completa (Full Boot)',
  'FORCED BIOS': 'Forçar Arquivo de BIOS',
  'ENABLE CHEATS': 'Ativar Cheats / Trapaças',
  'DISCORD RICH PRESENCE': 'Discord Rich Presence',
  'AUTOCONFIGURE CONTROLLERS': 'Autoconfigurar Controles',

  // Choices
  'YES': 'Sim',
  'NO': 'Não',
  'OFF': 'Desativado',
  'ON': 'Ativado',
  'AUTO': 'Automático',
  'DEFAULT': 'Padrão',
  'NONE': 'Nenhum',
  'STRETCH FIT TO WINDOW': 'Esticar para Preencher',
  'NATIVE (PS2)': 'Nativa (PS2)',
  'DOUBLE': 'Duplo',
  'TRIPLE': 'Triplo',
  'STRETCH': 'Esticar',
  'ADAPTATIVE': 'Adaptável',
  'AUTOMATIC': 'Automático'
};

function translate(text) {
  if (!text) return text;
  const upper = String(text).toUpperCase().trim();
  if (TRANSLATIONS[upper]) return TRANSLATIONS[upper];
  
  let translated = String(text);
  for (const [en, pt] of Object.entries(TRANSLATIONS)) {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(regex, pt);
  }
  return translated;
}

// 2. Parse C# class mappings from Program.cs
console.log('Parsing Program.cs for class mappings...');
const classMap = {}; // Lowercase emuId -> Prefix/Class Name
if (fs.existsSync(programCsPath)) {
  const programContent = fs.readFileSync(programCsPath, 'utf-8');
  const dictMatch = programContent.match(/Dictionary<string,\s*Func<Generator>>\s*generators\s*=\s*new\s*Dictionary<string,\s*Func<Generator>>\s*\{([\s\S]*?)\};/);
  if (dictMatch) {
    const lines = dictMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/\{\s*"([^"]+)"\s*,\s*\(\)\s*=>\s*new\s*([a-zA-Z0-9_]+)\(\)\s*\}/);
      if (match) {
        classMap[match[1].toLowerCase()] = match[2].replace('Generator', '');
      }
    }
  }
}
console.log(`Parsed ${Object.keys(classMap).length} mappings from Program.cs.`);

// 3. Helper to look up config keys in C# Generators
function findKeyInCSharp(emuId, key) {
  const prefix = classMap[emuId.toLowerCase()] || emuId;
  const files = fs.readdirSync(generatorsDir).filter(f => f.toLowerCase().startsWith(prefix.toLowerCase()) && f.endsWith('.cs'));
  if (files.length === 0) return null;

  for (const file of files) {
    const filePath = path.join(generatorsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const regex4 = new RegExp(`Bind[a-zA-Z0-9_]*Feature[a-zA-Z0-9_]*\\s*\\(\\s*[^,]+\\s*,\\s*"([^"]+)"\\s*,\\s*"([^"]+)"\\s*,\\s*"(${key})"` , 'i');
    const regex3 = new RegExp(`Bind[a-zA-Z0-9_]*Feature[a-zA-Z0-9_]*\\s*\\(\\s*[^,]+\\s*,\\s*"([^"]+)"\\s*,\\s*"(${key})"` , 'i');
    const regexDirect = new RegExp(`SystemConfig\\[\\s*"${key}"\\s*\\]`, 'i');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      let match4 = line.match(regex4);
      if (match4) {
        return { realSection: match4[1], realKey: match4[2], realFile: file };
      }

      let match3 = line.match(regex3);
      if (match3) {
        return { realKey: match3[1], realFile: file };
      }

      if (regexDirect.test(line)) {
        const scanOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
        for (const offset of scanOffsets) {
          const scanIdx = i + offset;
          if (scanIdx >= 0 && scanIdx < lines.length) {
            const scanLine = lines[scanIdx];
            const writeMatch = scanLine.match(/WriteValue\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/i);
            if (writeMatch) {
              return { realSection: writeMatch[1], realKey: writeMatch[2], realFile: file };
            }
            const indexMatch = scanLine.match(/\[\s*"([^"]+)"\s*\]\s*=/i);
            if (indexMatch) {
              return { realKey: indexMatch[1], realFile: file };
            }
          }
        }
      }
    }
  }
  return null;
}

// 4. Load & parse es_features.cfg
console.log('Loading es_features.cfg...');
if (!fs.existsSync(esFeaturesPath)) {
  console.error(`Error: es_features.cfg not found at ${esFeaturesPath}`);
  process.exit(1);
}
const xmlContent = fs.readFileSync(esFeaturesPath, 'utf-8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true
});
const jsonObj = parser.parse(xmlContent);

// Process shared features
const rawShared = (jsonObj.features && jsonObj.features.sharedFeatures) ? (jsonObj.features.sharedFeatures.feature || []) : [];
const sharedFeaturesArray = Array.isArray(rawShared) ? rawShared : [rawShared];
const sharedFeaturesMap = new Map();
for (const sf of sharedFeaturesArray) {
  if (sf.value) {
    sharedFeaturesMap.set(sf.value, sf);
  }
}

// Global mapping keys
const GLOBAL_MAP = {
  'forcefullscreen': 'fullscreen',
  'video_vsync': 'vsync',
  'pcsx2_vsync': 'vsync',
  'video_driver': 'video_driver',
  'MonitorIndex': 'monitor_index',
  'GPUIndex': 'gpu_index',
  'audio_driver': 'audio_driver',
  'shaderset': 'shaders',
  'bezel': 'bezels',
  'videofilters': 'filters',
  'discord': 'discord',
  'enable_hdr': 'hdr',
  'ratio': 'aspect_ratio'
};

function getGroupDef(feature) {
  const submenu = (feature.submenu || '').toUpperCase();
  const groupName = (feature.group || '').toUpperCase();
  const name = (feature.name || '').toUpperCase();
  const value = (feature.value || '').toLowerCase();

  if (submenu === 'TATTOO' || value.includes('tattoo')) {
    return null; // Ignore completely
  }

  // Group: Hacks / Corrections
  if (submenu === 'GAME FIXES' || submenu === 'HACKS' || 
      name.includes('HACK') || name.includes('PATCH') || name.includes('FIX') || name.includes('WOBBLE') || name.includes('CORRECTION') || name.includes('OFFSET') ||
      value.includes('hack') || value.includes('patch') || value.includes('fix') || value.includes('offset')) {
    return { id: 'hacks', title: 'Correções / Hacks', icon: 'wrench', order: 3 };
  }

  // Group: Controls
  if (submenu === 'CONTROLS' || submenu === 'GUNS' || submenu === 'WHEELS' || groupName === 'CONTROLS' || 
      name.includes('INPUT') || name.includes('JOY') || name.includes('KEYBOARD') || name.includes('MOUSE') || name.includes('BUTTON') || name.includes('GAMEPAD') || name.includes('ANALOG') || name.includes('WHEEL') || name.includes('GUN') ||
      value.includes('gun') || value.includes('wheel') || value.includes('stick') || value.includes('controller') || value.includes('deadzone') || value.includes('sensitivity') || value.includes('input') || value.includes('joy') || value.includes('keyboard') || value.includes('mouse') || value.includes('button') || value.includes('gamepad') || value.includes('analog') || value.includes('combo')) {
    return { id: 'controls', title: 'Controles', icon: 'gamepad2', order: 5 };
  }

  // Group: Audio
  if (submenu === 'AUDIO' || groupName === 'AUDIO' || 
      name.includes('AUDIO') || name.includes('SOUND') || name.includes('MUSIC') || name.includes('VOLUME') || name.includes('APU') ||
      value.includes('audio') || value.includes('volume') || value.includes('sound') || value.includes('resampler') || value.includes('mixer') || value.includes('apu') || value.includes('music') || value.includes('latency')) {
    return { id: 'audio', title: 'Áudio', icon: 'volume2', order: 4 };
  }

  // Group: Emulation / System
  if (submenu === 'EMULATION' || submenu === 'LATENCY REDUCTION' || groupName === 'COMPRESSION' || submenu === 'SYSTEM' || submenu === 'USER INTERFACE' || submenu === 'AI GAME TRANSLATION' ||
      name.includes('BOOT') || name.includes('BIOS') || name.includes('REGION') || name.includes('LANGUAGE') || name.includes('NETWORK') || name.includes('NET') || name.includes('ETH') || name.includes('DNS') || name.includes('DISCORD') || name.includes('SAVE') || name.includes('CHEAT') || name.includes('CARD') ||
      value.includes('fastboot') || value.includes('bios') || value.includes('region') || value.includes('autosave') || value.includes('rewind') || value.includes('net') || value.includes('eth') || value.includes('dns') || value.includes('network') || value.includes('ip') || value.includes('port') || value.includes('save') || value.includes('slot') || value.includes('lang') || value.includes('cheats') || value.includes('discord') || value.includes('mem') || value.includes('card')) {
    return { id: 'emulation', title: 'Emulação', icon: 'cpu', order: 2 };
  }

  return { id: 'graphics', title: 'Gráficos', icon: 'monitor', order: 1 };
}

function getPresetValues(preset) {
  if (preset === 'decorations') {
    return [
      { label: 'Automático', value: 'auto' },
      { label: 'Desativado', value: 'none' }
    ];
  }
  if (preset === 'shaders') {
    return [
      { label: 'Automático', value: 'auto' },
      { label: 'Desativado', value: 'none' }
    ];
  }
  if (preset === 'videofilters') {
    return [
      { label: 'Automático', value: 'auto' },
      { label: 'Desativado', value: 'none' }
    ];
  }
  if (preset === 'videomodes') {
    return [
      { label: 'Automático', value: 'auto' }
    ];
  }
  return null;
}

// 5. Parse emulators
const rawEmulators = jsonObj.features.emulator || [];
const emulatorsArray = Array.isArray(rawEmulators) ? rawEmulators : [rawEmulators];

console.log(`Processing emulators... target: ${targetEmu || 'ALL'}`);

for (const emu of emulatorsArray) {
  const nameAttr = emu.name;
  if (!nameAttr) continue;

  const names = nameAttr.split(',').map(n => n.trim().toLowerCase());
  
  for (const emuId of names) {
    if (targetEmu && emuId !== targetEmu) continue;

    console.log(`Generating schema for: ${emuId}`);

    // Gather features across emulator + cores
    const featuresList = [];
    const extract = (elem) => {
      if (!elem) return;
      if (elem.feature) {
        const arr = Array.isArray(elem.feature) ? elem.feature : [elem.feature];
        featuresList.push(...arr.map(f => ({ isShared: false, data: f })));
      }
      if (elem.sharedFeature) {
        const arr = Array.isArray(elem.sharedFeature) ? elem.sharedFeature : [elem.sharedFeature];
        featuresList.push(...arr.map(f => ({ isShared: true, data: f })));
      }
    };

    extract(emu);
    if (emu.core) {
      const cores = Array.isArray(emu.core) ? emu.core : [emu.core];
      for (const core of cores) {
        extract(core);
      }
    }

    const groupsMap = new Map();
    const globalMappings = {};

    for (const item of featuresList) {
      let f = item.data;
      if (item.isShared) {
        const sharedDef = sharedFeaturesMap.get(f.value);
        if (sharedDef) {
          f = { ...sharedDef, ...f };
        } else {
          continue; // Skip unresolved shared feature reference
        }
      }

      const valueKey = f.value;
      if (!valueKey) continue;

      const groupDef = getGroupDef(f);
      if (!groupDef) continue; // Ignored (Tattoo or other filter)

      if (!groupsMap.has(groupDef.id)) {
        groupsMap.set(groupDef.id, {
          id: groupDef.id,
          title: groupDef.title,
          icon: groupDef.icon,
          order: groupDef.order,
          options: []
        });
      }

      const group = groupsMap.get(groupDef.id);

      // Determine option parameters
      let type = 'toggle';
      let choices = null;
      let min, max, step, suffix;

      if (f.preset === 'switch' || f.preset === 'switchauto' || f.preset === 'switchon') {
        type = 'toggle';
      } else if (f.preset === 'slider' || f.preset === 'sliderauto') {
        type = 'slider';
        if (f['preset-parameters']) {
          const params = String(f['preset-parameters']).split(' ');
          min = parseFloat(params[0]);
          max = parseFloat(params[1]);
          step = parseFloat(params[2]);
          suffix = params[3] || undefined;
        }
      } else if (f.preset === 'input' || f.preset === 'folder' || f.preset === 'files') {
        type = 'input';
      } else if (f.choice) {
        type = 'select';
        const choiceArr = Array.isArray(f.choice) ? f.choice : [f.choice];
        choices = choiceArr.map(c => ({
          label: translate(c.name || c.value),
          value: String(c.value)
        }));
      } else {
        const presetVals = getPresetValues(f.preset);
        if (presetVals) {
          type = 'select';
          choices = presetVals;
        } else {
          type = 'toggle';
        }
      }

      const option = {
        id: valueKey,
        label: translate(f.name || valueKey),
        description: translate(f.description) || undefined,
        type: type,
        default: type === 'toggle' ? 'auto' : 'auto',
        configKey: valueKey
      };

      if (choices) option.values = choices;
      if (min !== undefined) option.min = min;
      if (max !== undefined) option.max = max;
      if (step !== undefined) option.step = step;
      if (suffix !== undefined) option.suffix = suffix;

      // Add inheritsGlobal
      if (GLOBAL_MAP[valueKey]) {
        option.inheritsGlobal = GLOBAL_MAP[valueKey];
        globalMappings[valueKey] = {
          configKey: valueKey,
          globalKey: GLOBAL_MAP[valueKey]
        };
      }

      // 6. Extract real key and real section from C# Generators
      const realMapping = findKeyInCSharp(emuId, valueKey);
      if (realMapping) {
        option.realKey = realMapping.realKey;
        if (realMapping.realSection) {
          option.realSection = realMapping.realSection;
        }
        option.realFile = realMapping.realFile;
      }

      // Avoid duplicates
      if (!group.options.some(opt => opt.id === option.id)) {
        group.options.push(option);
      }
    }

    // Sort options inside groups by order/label if needed
    const groupsList = Array.from(groupsMap.values()).sort((a, b) => a.order - b.order);

    const schemaObj = {
      $schema: 'riescade-emulator-schema-v1',
      id: emuId,
      name: emuId.toUpperCase(),
      description: `Configurações para o emulador ${emuId.toUpperCase()}`,
      icon: emuId,
      configFiles: [],
      globalMappings: globalMappings,
      groups: groupsList
    };

    const destPath = path.join(schemaOutputDir, `${emuId}.schema.json`);
    fs.writeFileSync(destPath, JSON.stringify(schemaObj, null, 2), 'utf-8');
    console.log(`Saved: ${destPath}`);
  }
}

console.log('Import completed successfully!');
