const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const appRoot = path.join(projectRoot, 'riescade', '.riescade');
const frontendSource = path.join(appRoot, 'src', 'src');
const launcherSource = path.join(appRoot, 'launcher', 'src', 'src');
const errors = [];
let checkedJson = 0;

function fail(message) {
  errors.push(message);
}

function walk(directory, visitor) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, visitor);
    else visitor(fullPath);
  }
}

function validateJsonFiles() {
  const configRoots = [
    path.join(appRoot, 'configs'),
    path.join(appRoot, 'launcher', 'configs')
  ];
  for (const root of configRoots) {
    walk(root, filePath => {
      if (!filePath.toLowerCase().endsWith('.json')) return;
      if (filePath.endsWith('teknoparrot-generated-hash.json') || filePath.endsWith('input-devices.json')) return;
      try {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        checkedJson++;
      } catch (error) {
        fail(`JSON inválido: ${path.relative(projectRoot, filePath)} (${error.message})`);
      }
    });
  }

  const settingsPath = path.join(appRoot, 'configs', 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    for (const [name, setting] of Object.entries(settings)) {
      if (!setting || typeof setting !== 'object' || !Object.hasOwn(setting, 'value') || typeof setting.type !== 'string') {
        fail(`Configuração padrão inválida em settings.json: ${name}`);
      }
    }
  } catch (error) {
    fail(`Não foi possível validar settings.json: ${error.message}`);
  }
}

function validateEmulatorSchemas() {
  const schemasRoot = path.join(appRoot, 'configs', 'emulator-schemas');
  const schemaIds = new Map();

  for (const fileName of fs.readdirSync(schemasRoot).filter(name => name.endsWith('.schema.json'))) {
    const relativePath = path.relative(projectRoot, path.join(schemasRoot, fileName));
    const schema = JSON.parse(fs.readFileSync(path.join(schemasRoot, fileName), 'utf8'));
    const expectedFileName = `${schema.id}.schema.json`;
    if (fileName !== '_global.schema.json' && fileName !== expectedFileName) {
      fail(`Nome de schema divergente do ID: ${fileName} deveria ser ${expectedFileName}.`);
    }
    if (schemaIds.has(schema.id)) {
      fail(`ID de schema duplicado "${schema.id}": ${schemaIds.get(schema.id)} e ${fileName}.`);
    } else {
      schemaIds.set(schema.id, fileName);
    }
    for (const group of schema.groups || []) {
      for (const option of group.options || []) {
        if (!option.id || !option.configKey || !Object.hasOwn(option, 'default')) {
          fail(`Configuração sem id, configKey ou default em ${relativePath}: ${option.id || '(sem ID)'}.`);
        }

        if (option.type !== 'select') continue;
        if (!Array.isArray(option.values) || option.values.length === 0) {
          fail(`Seleção sem opções em ${relativePath}: ${option.id}.`);
          continue;
        }

        const values = option.values.map(item => String(item.value));
        if (!values.includes(String(option.default))) {
          fail(`Valor padrão "${option.default}" não existe nas opções de ${relativePath}: ${option.id}.`);
        }

        if (String(option.default).toLowerCase() === 'auto') {
          const autoOption = option.values.find(item => String(item.value).toLowerCase() === 'auto');
          if (!autoOption || autoOption.label !== 'AUTO') {
            fail(`Opção padrão AUTO ausente ou inconsistente em ${relativePath}: ${option.id}.`);
          }
        }
      }
    }
  }
}

function validateGeneratorConfigLinks() {
  const schemasRoot = path.join(appRoot, 'configs', 'emulator-schemas');
  const generatorsRoot = path.join(launcherSource, 'generators');
  for (const fileName of fs.readdirSync(generatorsRoot).filter(name => name.endsWith('Generator.ts'))) {
    const source = fs.readFileSync(path.join(generatorsRoot, fileName), 'utf8');
    if (/process\.cwd\(\).*emulator-schemas/.test(source)) {
      fail(`Gerador usa diretório de trabalho para localizar schema: ${fileName}.`);
    }
    for (const match of source.matchAll(/emulator-schemas',\s*'([^']+\.schema\.json)'/g)) {
      if (!fs.existsSync(path.join(schemasRoot, match[1]))) {
        fail(`Gerador referencia schema inexistente: ${fileName} -> ${match[1]}.`);
      }
    }
  }

  const systems = JSON.parse(fs.readFileSync(path.join(appRoot, 'configs', 'systems.json'), 'utf8')).systems || [];
  const schemaIds = new Set(
    fs.readdirSync(schemasRoot)
      .filter(name => name.endsWith('.schema.json'))
      .map(name => JSON.parse(fs.readFileSync(path.join(schemasRoot, name), 'utf8')).id)
  );
  for (const system of systems) {
    const names = (system.emulators || []).map(emulator => emulator.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    for (const name of new Set(duplicates)) {
      fail(`Emulador duplicado no sistema ${system.name}: ${name}.`);
    }
    if (names.includes('mame64')) {
      fail(`Nome antigo mame64 encontrado no sistema ${system.name}; use mame.`);
    }
    for (const name of names) {
      if (!schemaIds.has(name)) {
        fail(`Emulador sem schema no sistema ${system.name}: ${name}.`);
      }
    }
  }
}

function validateGeneratorRegistry() {
  const indexPath = path.join(launcherSource, 'index.ts');
  const indexSource = fs.readFileSync(indexPath, 'utf8');
  const imports = [...indexSource.matchAll(/import\s+\{\s*(\w+Generator)\s*\}\s+from\s+'\.\/generators\/([^']+)'/g)];
  const importedNames = imports.map(match => match[1]);
  const duplicates = importedNames.filter((name, index) => importedNames.indexOf(name) !== index);
  for (const name of new Set(duplicates)) fail(`Gerador importado mais de uma vez: ${name}`);

  const ignored = new Set(['BaseGenerator.ts', 'GenericGenerator.ts']);
  for (const fileName of fs.readdirSync(path.join(launcherSource, 'generators'))) {
    if (!fileName.endsWith('Generator.ts') || ignored.has(fileName)) continue;
    const className = fileName.replace(/\.ts$/, '');
    if (!importedNames.includes(className)) fail(`Gerador não registrado no launcher: ${fileName}`);
  }

  if (!indexSource.includes('return new GenericGenerator(args)')) {
    fail('Fallback GenericGenerator ausente no launcher.');
  }
  if (!indexSource.includes("sdl3_detector.exe") || !indexSource.includes("getControllerMonitors(parsedArgs)")) {
    fail('Monitor global HOTKEY + START baseado em SDL3 ausente do launcher.');
  }
  if (/isLibRetro\s*\?\s*\[\]/.test(indexSource)) {
    fail('Monitor HOTKEY + START está desativado para Libretro.');
  }

  const libretroGenerator = fs.readFileSync(path.join(launcherSource, 'generators', 'LibRetroGenerator.ts'), 'utf8');
  if (!libretroGenerator.includes("input_enable_hotkey_btn") || !libretroGenerator.includes("input_exit_emulator_btn")) {
    fail('Mapeamento nativo redundante de saída ausente no LibretroGenerator.');
  }
}

function validateTeknoParrotControls() {
  const controlsPath = path.join(appRoot, 'launcher', 'configs', 'teknoparrot-controls.json');
  const controls = JSON.parse(fs.readFileSync(controlsPath, 'utf8'));
  const profiles = controls.profiles || {};
  const aliases = controls.aliases || {};
  const allowedCategories = new Set(['racing', 'fighter', 'lightgun', 'other']);

  for (const [name, profile] of Object.entries(profiles)) {
    if (!allowedCategories.has(profile.category)) fail(`Categoria inválida no perfil TeknoParrot ${name}.`);
    if (!profile.buttons || typeof profile.buttons !== 'object') fail(`Perfil TeknoParrot sem botões: ${name}.`);
  }
  for (const [alias, target] of Object.entries(aliases)) {
    if (typeof target !== 'string' || !target.trim() || alias === target) {
      fail(`Alias TeknoParrot inválido: ${alias} -> ${target}.`);
    }
    const seen = new Set([alias]);
    let cursor = target;
    while (aliases[cursor]) {
      if (seen.has(cursor)) {
        fail(`Ciclo de aliases TeknoParrot detectado a partir de ${alias}.`);
        break;
      }
      seen.add(cursor);
      cursor = aliases[cursor];
    }
  }
}

function validateScraperSources() {
  const forbidden = /\b(ArcadeDB|IGDB|TheGamesDB|HfsDB)\b/i;
  for (const root of [frontendSource, launcherSource]) {
    walk(root, filePath => {
      if (!/\.(ts|tsx|js)$/.test(filePath)) return;
      const source = fs.readFileSync(filePath, 'utf8');
      if (forbidden.test(source)) fail(`Fonte de scraper não autorizada em ${path.relative(projectRoot, filePath)}.`);
    });
  }
}

function validateEmulatorCatalog() {
  const systemsPath = path.join(appRoot, 'configs', 'systems.json');
  const catalogPath = path.join(appRoot, 'configs', 'emulators-catalog.json');
  const systems = JSON.parse(fs.readFileSync(systemsPath, 'utf8'));
  const catalogDocument = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const catalog = catalogDocument.emulators || {};
  const referenced = new Set();

  for (const system of systems.systems || []) {
    for (const emulator of system.emulators || []) {
      referenced.add(String(emulator.name || '').toLowerCase());
    }
  }

  for (const id of [...referenced].sort()) {
    const entry = catalog[id];
    if (!entry) {
      fail(`Emulador referenciado sem entrada no catálogo: ${id}.`);
      continue;
    }
    if (!entry.installDir) fail(`Emulador ${id} sem installDir no catálogo.`);
    if (!['github-release', 'release', 'manual'].includes(entry.updateMode)) {
      fail(`Emulador ${id} possui updateMode inválido: ${entry.updateMode}.`);
    }
    if (entry.updateMode !== 'manual' && !entry.executable) {
      fail(`Emulador atualizável ${id} não possui executável canônico.`);
    }
    if (entry.updateMode === 'github-release') {
      if (entry.provider !== 'github' || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/?$/.test(entry.source || '')) {
        fail(`Emulador ${id} não possui fonte GitHub Releases válida.`);
      }
      if (!entry.assetPattern) fail(`Emulador ${id} não possui assetPattern para Windows.`);
    }
  }
}

function validateReleaseContract() {
  const releasePath = path.join(appRoot, 'src', 'scripts', 'release.js');
  const releaseSource = fs.readFileSync(releasePath, 'utf8');
  for (const folder of ['bios', 'roms', 'saves', 'screenshots']) {
    if (!releaseSource.includes(`'${folder}'`)) fail(`Pasta vazia obrigatória ausente do release: ${folder}.`);
  }
  for (const runtimeFile of ['riescade.db-wal', 'riescade.db-shm', 'input-devices.json', 'teknoparrot-generated-hash.json']) {
    if (!releaseSource.includes(runtimeFile)) fail(`Arquivo transitório não excluído explicitamente do release: ${runtimeFile}.`);
  }
  if (!releaseSource.includes('sha256: sevenZipSha256') || !releaseSource.includes('size: sevenZipSize')) {
    fail('Manifesto de release não contém hash e tamanho do pacote.');
  }
  if (!releaseSource.includes("['ScreenScraperUser', 'ScreenScraperPass']")) {
    fail('Release não sanitiza as credenciais pessoais do ScreenScraper.');
  }
  if (releaseSource.includes('git add -A') || releaseSource.includes('--force')) {
    fail('Release contém operação Git abrangente ou forçada.');
  }
}

validateJsonFiles();
validateEmulatorSchemas();
validateGeneratorRegistry();
validateGeneratorConfigLinks();
validateTeknoParrotControls();
validateScraperSources();
validateEmulatorCatalog();
validateReleaseContract();

if (errors.length) {
  console.error(`Validação falhou com ${errors.length} problema(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`Validação concluída: ${checkedJson} JSONs, registro global de geradores, controles e ScreenScraper.`);
