const fs = require('fs');
const path = require('path');

// Paths
const projectSrcDir = path.resolve(__dirname, '..');
const emulatorJsonPath = path.resolve(projectSrcDir, '..', 'configs', 'emulator.json');
const schemaOutputDir = path.resolve(projectSrcDir, '..', 'configs', 'emulator-schemas');
const emulatorsDir = path.resolve(projectSrcDir, '..', '..', 'emulators');

// Helper to map emulator IDs to standard configuration files relative to "emulators" folder
const CONFIG_FILE_MAPS = {
  'altirra': ['altirra/Altirra.ini'],
  'amigaforever': [],
  'applewin': [],
  'arcadeflashweb': [],
  'ares': ['ares/settings.bml'],
  'azahar': ['azahar/qt-config.ini'],
  'bigpemu': ['bigpemu/Config/bigpemu.json'],
  'bizhawk': ['bizhawk/config.ini'],
  'capriceforever': ['capriceforever/Caprice.ini'],
  'cemu': ['cemu/settings.xml'],
  'citra': ['citra/user/config/qt-config.ini', 'citra/qt-config.ini'],
  'citron': ['citron/user/config/qt-config.ini', 'citron/qt-config.ini'],
  'cxbx': ['cxbx-reloaded/settings.ini'],
  'daphne': [],
  'demul': ['demul/Demul.ini'],
  'desmume': ['desmume/desmume.ini'],
  'devilutionx': ['devilutionx/diablo.ini'],
  'dolphin': ['dolphin-emu/User/Config/Dolphin.ini', 'dolphin-emu/Dolphin.ini'],
  'dosbox': ['dosbox/dosbox.conf', 'dosbox/dosbox.cfg'],
  'dosboxpure': ['dosboxpure/DOSBoxPure.cfg'],
  'dosboxstaging': ['dosboxstaging/dosbox-staging.conf'],
  'duckstation': ['duckstation/settings.ini'],
  'easyrpg': [],
  'eden': ['eden/qt-config.ini'],
  'eduke32': ['eduke32/eduke32.cfg'],
  'eka2l1': ['eka2l1/config.yml'],
  'exodos': ['exodos/options.conf'],
  'exowin3x': ['exowin3x/options.conf'],
  'exowin9x': ['exowin9x/options9x.conf'],
  'fbneo': [],
  'flycast': ['flycast/emu.cfg'],
  'fpinball': [],
  'gemrb': [],
  'gopher64': [],
  'gsplus': [],
  'gzdoom': [],
  'hatari': [],
  'jgenesis': [],
  'jynx': [],
  'jzintv': [],
  'kegafusion': [],
  'kronos': [],
  'lime3ds': ['lime3ds/user/config/qt-config.ini'],
  'linuxloader': [],
  'mame64': ['mame64/mame.ini'],
  'mandarine': [],
  'mednafen': [],
  'melonds': [],
  'mesen': [],
  'mgba': [],
  'model2': ['model2/emulator.ini'],
  'model3': ['supermodel/Supermodel.ini'],
  'mupen64': [],
  'n64recomp': [],
  'openbor': [],
  'openmsx': [],
  'oricutron': [],
  'pcsx2': ['pcsx2/inis/PCSX2.ini', 'pcsx2/PCSX2.ini'],
  'pcsx2-nightly': ['pcsx2/inis/PCSX2.ini', 'pcsx2/PCSX2.ini'],
  'pcsx2x6': ['pcsx2x6/inis/PCSX2.ini', 'pcsx2x6/PCSX2.ini'],
  'play': [],
  'ppsspp': ['ppsspp/memstick/PSP/SYSTEM/ppsspp.ini', 'ppsspp/ppsspp.ini'],
  'project64': [],
  'psxmame': [],
  'raine': [],
  'raze': [],
  'redream': ['redream/config.json'],
  'retroarch': [],
  'rpcs3': ['rpcs3/config.yml'],
  'ryujinx': ['ryujinx/Config.json'],
  'scummvm': [],
  'shadps4': ['shadps4/config.toml'],
  'simcoupe': [],
  'simple64': [],
  'singe2': [],
  'snes9x': [],
  'solarus': [],
  'ssf': [],
  'stella': [],
  'sudachi': ['sudachi/user/config/qt-config.ini'],
  'suyu': ['suyu/user/config/qt-config.ini'],
  'teknoparrot': [],
  'tsugaru': [],
  'uae': [],
  'vita3k': ['vita3k/config.yml'],
  'vpinball': [],
  'winarcadia': [],
  'xemu': ['xemu/xemu.toml'],
  'xenia': ['xenia/xenia-canary.config.toml', 'xenia/xenia.config.toml'],
  'yabasanshiro': [],
  'ymir': [],
  'yuzu': ['yuzu/user/config/qt-config.ini'],
  'zesarux': [],
  'zinc': []
};

// Helper to read INI value
function readIniValue(filePath, section, key) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  let currentSection = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.substring(1, trimmed.length - 1).trim();
      continue;
    }
    if (currentSection.toLowerCase() === section.toLowerCase()) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const lineKey = trimmed.substring(0, eqIdx).trim();
        if (lineKey.toLowerCase() === key.toLowerCase()) {
          let val = trimmed.substring(eqIdx + 1).trim();
          const hashIdx = val.indexOf('#');
          const semiIdx = val.indexOf(';');
          const commentIdx = hashIdx !== -1 ? hashIdx : (semiIdx !== -1 ? semiIdx : -1);
          if (commentIdx !== -1) {
            val = val.substring(0, commentIdx).trim();
          }
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          return val;
        }
      }
    }
  }
  return null;
}

// Main execution
console.log('Loading emulator.json...');
let emulatorData = {};
if (fs.existsSync(emulatorJsonPath)) {
  try {
    emulatorData = JSON.parse(fs.readFileSync(emulatorJsonPath, 'utf-8'));
  } catch (e) {
    console.error('Error parsing emulator.json:', e);
    process.exit(1);
  }
}

// Remove legacy core_* and libretro/angle keys from emulator.json
for (const key of Object.keys(emulatorData)) {
  if (key.startsWith('core_') || key === 'libretro' || key === 'angle') {
    delete emulatorData[key];
  }
}

// Make sure global exists
if (!emulatorData.global) {
  emulatorData.global = {};
}

// Get all schemas
console.log('Reading schemas...');
const files = fs.readdirSync(schemaOutputDir).filter(f => f.endsWith('.schema.json'));

for (const file of files) {
  const emuId = file.replace('.schema.json', '');
  const schemaPath = path.join(schemaOutputDir, file);
  
  let schema = {};
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch (e) {
    console.error(`Error parsing schema ${file}:`, e);
    continue;
  }

  console.log(`Processing emulator: ${emuId}`);
  if (!emulatorData[emuId]) {
    emulatorData[emuId] = {};
  }

  // Find candidate config files
  let configPath = null;
  const candidates = CONFIG_FILE_MAPS[emuId] || [];
  for (const candidate of candidates) {
    const fullPath = path.join(emulatorsDir, candidate);
    if (fs.existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }

  // Iterate schema options
  for (const group of (schema.groups || [])) {
    for (const opt of (group.options || [])) {
      const optionId = opt.id;
      
      // 1. If emulator.json already has a value, preserve it
      if (emulatorData[emuId][optionId] !== undefined) {
        continue;
      }

      // 2. Try to read from the emulator's real configuration file
      let val = null;
      if (configPath && opt.realKey) {
        const section = opt.realSection || 'Settings';
        val = readIniValue(configPath, section, opt.realKey);
      }

      // 3. Map values
      if (val !== null) {
        if (opt.type === 'toggle') {
          const lowerVal = val.toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(lowerVal)) {
            emulatorData[emuId][optionId] = 'true';
          } else if (['false', '0', 'no', 'off'].includes(lowerVal)) {
            emulatorData[emuId][optionId] = 'false';
          } else {
            emulatorData[emuId][optionId] = val;
          }
        } else if (opt.type === 'select' && opt.values) {
          const matched = opt.values.find(v => String(v.value).toLowerCase() === val.toLowerCase());
          if (matched) {
            emulatorData[emuId][optionId] = String(matched.value);
          } else {
            emulatorData[emuId][optionId] = val;
          }
        } else {
          emulatorData[emuId][optionId] = val;
        }
      } else {
        // 4. Fallback to default from schema or "auto"
        emulatorData[emuId][optionId] = opt.default || 'auto';
      }
    }
  }
}

// Save back
fs.writeFileSync(emulatorJsonPath, JSON.stringify(emulatorData, null, 2), 'utf-8');
console.log('emulator.json updated successfully!');
