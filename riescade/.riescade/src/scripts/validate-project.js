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

  for (const fileName of fs.readdirSync(schemasRoot).filter(name => name.endsWith('.schema.json'))) {
    const relativePath = path.relative(projectRoot, path.join(schemasRoot, fileName));
    const schema = JSON.parse(fs.readFileSync(path.join(schemasRoot, fileName), 'utf8'));
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
validateTeknoParrotControls();
validateScraperSources();
validateReleaseContract();

if (errors.length) {
  console.error(`Validação falhou com ${errors.length} problema(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`Validação concluída: ${checkedJson} JSONs, registro global de geradores, controles e ScreenScraper.`);
