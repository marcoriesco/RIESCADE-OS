const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const sourceDir = path.join(__dirname, '..', 'docs', 'es_systems');
const targetFile = path.join(__dirname, '..', 'src', 'renderer', 'src', 'resources', 'riescade_systems.json');

console.log(`Source Directory: ${sourceDir}`);
console.log(`Target File: ${targetFile}`);

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory does not exist: ${sourceDir}`);
  process.exit(1);
}

// 1. Initialize XML parser
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  ignoreDeclaration: true
});

const systemsMap = new Map();

// Helper to parse a single .cfg file
function parseFile(filePath) {
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = parser.parse(xmlContent);
    const systemList = parsed.systemList?.system;
    if (!systemList) return [];
    return Array.isArray(systemList) ? systemList : [systemList];
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err);
    return [];
  }
}

// Helper to format emulator/core configurations
function formatEmulators(emulatorsNode) {
  if (!emulatorsNode || !emulatorsNode.emulator) return [];
  const list = Array.isArray(emulatorsNode.emulator) ? emulatorsNode.emulator : [emulatorsNode.emulator];
  return list.map(e => {
    const coresNode = e.cores;
    let coresList = [];
    if (coresNode && coresNode.core) {
      coresList = Array.isArray(coresNode.core) ? coresNode.core : [coresNode.core];
    }
    return {
      name: e['@_name'] || '',
      cores: coresList
    };
  });
}

// 2. Parse main es_systems.cfg first (if exists)
const mainCfg = path.join(sourceDir, 'es_systems.cfg');
if (fs.existsSync(mainCfg)) {
  console.log(`Parsing main config: ${mainCfg}`);
  const systems = parseFile(mainCfg);
  systems.forEach(s => {
    const sysName = String(s.name).toLowerCase();
    const emulatorsList = formatEmulators(s.emulators);
    const systemObj = {
      name: String(s.name),
      fullname: String(s.fullname || s.name),
      extension: String(s.extension || ''),
      platform: String(s.platform || ''),
      theme: String(s.theme || s.name),
      hardware: String(s.hardware || 'console'),
      group: s.group ? String(s.group) : undefined,
      emulators: emulatorsList
    };

    if (emulatorsList.length === 0) {
      systemObj.command = String(s.command || '');
    }

    systemsMap.set(sysName, systemObj);
  });
}

// 3. Parse and merge all override es_systems_*.cfg files
const files = fs.readdirSync(sourceDir);
files.forEach(file => {
  if (file.startsWith('es_systems_') && file.endsWith('.cfg')) {
    const fullPath = path.join(sourceDir, file);
    console.log(`Parsing override config: ${file}`);
    const systems = parseFile(fullPath);
    
    systems.forEach(s => {
      const sysName = String(s.name).toLowerCase();
      const emulatorsList = formatEmulators(s.emulators);
      const systemObj = {
        name: String(s.name),
        fullname: String(s.fullname || s.name),
        extension: String(s.extension || ''),
        platform: String(s.platform || ''),
        theme: String(s.theme || s.name),
        hardware: String(s.hardware || 'console'),
        group: s.group ? String(s.group) : undefined,
        emulators: emulatorsList
      };

      if (emulatorsList.length === 0) {
        systemObj.command = String(s.command || '');
      }

      systemsMap.set(sysName, systemObj);
    });
  }
});

// 4. Save to JSON file
const finalSystems = Array.from(systemsMap.values());

const pathsToSave = [
  targetFile,
  path.join(__dirname, '..', 'src', 'main', 'resources', 'riescade_systems.json')
];

pathsToSave.forEach(filePath => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(finalSystems, null, 2), 'utf-8');
    console.log(`Successfully saved riescade_systems.json to: ${filePath}`);
  } catch (err) {
    console.error(`Failed to save to ${filePath}:`, err);
  }
});

console.log(`Successfully converted ${finalSystems.length} systems!`);
