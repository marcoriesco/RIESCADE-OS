const fs = require('fs')
const path = require('path')

const appRoot = path.resolve(__dirname, '..', '..')
const schemaPath = path.join(appRoot, 'configs', 'emulators', 'schemas', 'libretro.schema.json')
const generatorPath = path.join(appRoot, 'launcher', 'src', 'src', 'generators', 'LibRetroGenerator.ts')
const legacyPath = path.join(
  appRoot,
  'src',
  'docs',
  'emulatorlauncher_src',
  'emulatorLauncher',
  'Generators',
  'LibRetro.CoreOptions.cs'
)
const installedOptionsPath = path.resolve(appRoot, '..', '..', 'emulators', 'retroarch', 'retroarch-core-options.cfg')
const reportPath = path.join(appRoot, 'state', 'libretro-config-audit.json')
const mappingPath = path.join(appRoot, 'configs', 'emulators', 'libretro-core-options.json')

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const generatorSource = fs.readFileSync(generatorPath, 'utf8')
const legacySource = fs.readFileSync(legacyPath, 'utf8')

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function schemaCoreAliases(core) {
  const normalized = normalize(core)
  if (normalized === 'mupen64plusnext' || normalized === 'mupen64plusnextgles3') {
    return ['mupen64plus']
  }
  return []
}

function parseCfg(filePath) {
  if (!fs.existsSync(filePath)) return new Map()
  const result = new Map()
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]*?)\s*=\s*"(.*)"\s*$/)
    if (match) result.set(match[1].trim(), match[2])
  }
  return result
}

function parseLegacyBindings(source) {
  const bindings = []
  const callPattern = /\b(BindFeatureSlider|BindBoolFeatureAuto|BindBoolFeatureOn|BindBoolFeature|BindFeature)\s*\(\s*(coreSettings|retroarchConfig)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?/g
  const methodPattern = /private void (Configure\w+)\s*\([^)]*string core\)\s*\{/g
  for (const methodMatch of source.matchAll(methodPattern)) {
    let depth = 1
    let cursor = methodMatch.index + methodMatch[0].length
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth++
      else if (source[cursor] === '}') depth--
      cursor++
    }
    const body = source.slice(methodMatch.index + methodMatch[0].length, cursor - 1)
    const cores = [...new Set(
      [...body.matchAll(/\bcore\s*(?:==|!=)\s*"([^"]+)"/g)].map(match => match[1])
    )]
    for (const match of body.matchAll(callPattern)) {
      bindings.push({
        method: methodMatch[1],
        cores,
        kind: match[1],
        destination: match[2] === 'coreSettings' ? 'core-options' : 'retroarch',
        targetKey: match[3],
        configKey: match[4],
        values: match.slice(5, 8).filter(value => value !== undefined)
      })
    }
  }
  return bindings
}

const options = (schema.groups || []).flatMap(group =>
  (group.options || []).map(option => ({ ...option, group: group.id }))
)
const coreOptions = options.filter(option => option.core)
const frontendOptions = options.filter(option => !option.core)
const degenerateSelects = options
  .filter(option => option.type === 'select' && Array.isArray(option.values))
  .filter(option => !option.dynamicSource)
  .filter(option => option.values.filter(value => String(value.value) !== 'auto').length === 0)
  .map(option => ({
    core: option.core || null,
    configKey: String(option.configKey || option.id)
  }))
const dynamicSelects = options
  .filter(option => option.type === 'select' && option.dynamicSource)
  .map(option => ({
    core: option.core || null,
    configKey: String(option.configKey || option.id),
    dynamicSource: option.dynamicSource
  }))
const installedOptions = parseCfg(installedOptionsPath)
const legacyBindings = parseLegacyBindings(legacySource)
const legacyCoreBindings = legacyBindings.filter(binding => binding.destination === 'core-options')
const legacyByCoreFeature = new Map()

for (const binding of legacyCoreBindings) {
  for (const core of binding.cores) {
    for (const indexedCore of [normalize(core), ...schemaCoreAliases(core)]) {
      const key = `${indexedCore}:${binding.configKey}`
      if (!legacyByCoreFeature.has(key)) legacyByCoreFeature.set(key, [])
      legacyByCoreFeature.get(key).push(binding)
    }
  }
}

const generatorRequestedKeys = new Set(
  [...generatorSource.matchAll(/get(?:Emulator|Core)Setting\([^,]+,\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1])
)
for (const match of generatorSource.matchAll(/\b(?:boolSetting|valueSetting)\(\s*['"]([^'"]+)['"]/g)) {
  generatorRequestedKeys.add(match[1])
}
const generatorUsesMappingCatalog = generatorSource.includes('libretro-core-options.json')
const explicitlyHandledCompositeKeys = new Set([
  'fbalpha_freeplay',
  'fbalpha2012_freeplay',
  'fbalpha2012ng_freeplay'
])
const sharedFrontendKeys = new Set([
  'autosave',
  'rewind',
  'retroachievements.hardcore',
  'GameFocus',
  'applyPatch',
  'bios_overrides'
])
const specialFrontendKeys = new Map([
  ['retroarch_core', 'seletor-de-core'],
  ['videomode', 'resolucao-do-sistema'],
  ['analogToDpad', 'controle-ou-remapeamento'],
  ['force1pOnly', 'controle-ou-remapeamento']
])

function specialOptionCategory(core, configKey) {
  if (core === 'dolphin') return 'patch-externo-dolphin'
  if (core === 'mame') return 'maquina-ou-softlist-mame'
  if (core === 'scummvm') return 'configuracao-externa-scummvm'
  if (configKey === 'lr_n64_buttons') return 'controle-ou-remapeamento'
  if (core === 'kronos' && configKey === 'saturn_meshmode') return 'opcao-de-emulador-standalone'
  if (/(^|_)bios$|bios_|_bios|ipl_bios|original_bios|hatari_tos/i.test(configKey)) return 'arquivo-de-bios'
  if (configKey === 'nvram_storage' || configKey === 'soundfont') return 'arquivo-ou-diretorio-externo'
  if (sharedFrontendKeys.has(configKey)) return 'frontend-compartilhado'
  if (/(controller|control|layout|pad|multitap|buttonsInvert|rotate_buttons|rotatekeymap|triggerswap|invert_triggers|keyboard|mouse|device_type|rightanalog|6button|shoulders|wheel)/i.test(configKey)) {
    return 'controle-ou-remapeamento'
  }
  if (/(gun|sinden|lightgun)/i.test(configKey)) return 'lightgun'
  if (/(turbo)/i.test(configKey)) return 'turbo'
  return null
}

const coreNames = [...new Set(coreOptions.map(option => String(option.core)))].sort()
const cores = coreNames.map(core => {
  const entries = coreOptions.filter(option => option.core === core)
  const keyCounts = new Map()
  for (const option of entries) {
    const key = String(option.configKey || option.id)
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1)
  }

  const details = entries.map(option => {
    const configKey = String(option.configKey || option.id)
    const bindings = legacyByCoreFeature.get(`${normalize(core)}:${configKey}`) || []
    const targetKeys = [...new Set(bindings.map(binding => binding.targetKey))]
    const directTargetPresent = installedOptions.has(configKey)
    return {
      id: option.id,
      configKey,
      targetKeys,
      legacyBindingKinds: [...new Set(bindings.map(binding => binding.kind))],
      installedTargetKeys: targetKeys.filter(key => installedOptions.has(key)),
      directTargetPresent,
      specialCategory: bindings.length === 0 && !directTargetPresent
        ? specialOptionCategory(core, configKey)
        : null,
      status: bindings.length === 0
        ? directTargetPresent
          ? 'mapeamento-direto-confirmado'
          : generatorRequestedKeys.has(configKey) || explicitlyHandledCompositeKeys.has(configKey)
            ? 'gerador-composto'
          : specialOptionCategory(core, configKey)
            ? 'opcao-especial'
          : 'sem-mapeamento-confirmado'
        : targetKeys.some(key => installedOptions.has(key))
          ? 'mapeado-e-presente'
          : 'mapeado-ausente-na-instalacao'
    }
  })

  return {
    core,
    normalizedCore: normalize(core),
    optionCount: entries.length,
    legacyMappedCount: details.filter(item => item.targetKeys.length > 0).length,
    directMappedCount: details.filter(item => item.status === 'mapeamento-direto-confirmado').length,
    confirmedMappedCount: details.filter(item =>
      item.status === 'mapeado-e-presente'
        || item.status === 'mapeamento-direto-confirmado'
        || item.status === 'gerador-composto'
    ).length,
    compositeGeneratorCount: details.filter(item => item.status === 'gerador-composto').length,
    installedTargetCount: details.filter(item => item.installedTargetKeys.length > 0).length,
    duplicateConfigKeys: [...keyCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([configKey, count]) => ({ configKey, count })),
    missingLegacyMappings: details
      .filter(item => item.status === 'sem-mapeamento-confirmado')
      .map(item => item.configKey),
    specialOptions: details
      .filter(item => item.status === 'opcao-especial')
      .map(item => ({ configKey: item.configKey, category: item.specialCategory })),
    mappedButMissingFromInstalledCfg: details
      .filter(item => item.status === 'mapeado-ausente-na-instalacao')
      .map(item => ({ configKey: item.configKey, targetKeys: item.targetKeys })),
    options: details
  }
})

const allSchemaKeys = new Set(options.map(option => String(option.configKey || option.id)))
const report = {
  generatedAt: new Date().toISOString(),
  files: {
    schema: schemaPath,
    generator: generatorPath,
    legacyReference: legacyPath,
    installedCoreOptions: installedOptionsPath
  },
  summary: {
    totalOptions: options.length,
    frontendOptions: frontendOptions.length,
    frontendOptionsHandled: frontendOptions.filter(option => {
      const key = String(option.configKey || option.id)
      return generatorRequestedKeys.has(key) || specialFrontendKeys.has(key)
    }).length,
    frontendOptionsWithoutTreatment: frontendOptions.filter(option => {
      const key = String(option.configKey || option.id)
      return !generatorRequestedKeys.has(key) && !specialFrontendKeys.has(key)
    }).length,
    coreOptions: coreOptions.length,
    cores: cores.length,
    generatorUsesMappingCatalog,
    coreOptionsAppliedByGeneratedCatalog: cores.reduce((sum, core) => sum + core.confirmedMappedCount, 0),
    coreOptionsWithLegacyMapping: cores.reduce((sum, core) => sum + core.legacyMappedCount, 0),
    coreOptionsWithDirectInstalledMapping: cores.reduce((sum, core) => sum + core.directMappedCount, 0),
    coreOptionsWithConfirmedMapping: cores.reduce((sum, core) => sum + core.confirmedMappedCount, 0),
    coreOptionsHandledByCompositeGenerator: cores.reduce((sum, core) => sum + core.compositeGeneratorCount, 0),
    coreSpecialOptions: cores.reduce((sum, core) => sum + core.specialOptions.length, 0),
    coreOptionsWithInstalledTarget: cores.reduce((sum, core) => sum + core.installedTargetCount, 0),
    coresWithDuplicateConfigKeys: cores.filter(core => core.duplicateConfigKeys.length > 0).length,
    coreOptionsWithoutConfirmedMapping: cores.reduce((sum, core) => sum + core.missingLegacyMappings.length, 0),
    installedCoreOptionKeys: installedOptions.size,
    legacyCoreBindings: legacyCoreBindings.length
    ,
    degenerateSelects: degenerateSelects.length
    ,
    dynamicSelects: dynamicSelects.length
  },
  conclusions: [
    'O gerador atual configura o frontend RetroArch, mas não aplica opções específicas dos cores.',
    'O arquivo retroarch-core-options.cfg instalado é compatível com a estratégia global_core_options usada pelo gerador.',
    'Os mapeamentos legados identificam a chave da interface, a chave real do core e conversões booleanas que precisam ser preservadas na migração.'
  ],
  currentGeneratorRequestedKeys: [...generatorRequestedKeys].sort(),
  degenerateSelects,
  dynamicSelects,
  frontendOptions: frontendOptions.map(option => {
    const configKey = String(option.configKey || option.id)
    const readByCurrentGenerator = generatorRequestedKeys.has(configKey)
    return {
      id: option.id,
      configKey,
      readByCurrentGenerator,
      specialCategory: readByCurrentGenerator ? null : specialFrontendKeys.get(configKey) || null,
      status: readByCurrentGenerator
        ? 'gerador'
        : specialFrontendKeys.has(configKey)
          ? 'opcao-especial'
          : 'sem-tratamento'
    }
  }),
  legacyCoreBindingsMissingFromSchema: legacyCoreBindings
    .filter(binding => !allSchemaKeys.has(binding.configKey))
    .map(binding => ({
      configKey: binding.configKey,
      targetKey: binding.targetKey,
      kind: binding.kind
    })),
  cores
}

const generatedMappings = {}
const ambiguousGeneratedTargets = []
for (const core of cores) {
  const mappings = []
  for (const option of core.options) {
    if (option.status === 'mapeado-e-presente') {
      const binding = legacyByCoreFeature
        .get(`${normalize(core.core)}:${option.configKey}`)
        ?.find(item => installedOptions.has(item.targetKey))
      if (!binding) continue
      mappings.push({
        configKey: option.configKey,
        targetKey: binding.targetKey,
        kind: binding.kind,
        values: binding.values
      })
    } else if (option.status === 'mapeamento-direto-confirmado') {
      const schemaOption = coreOptions.find(item =>
        item.core === core.core && String(item.configKey || item.id) === option.configKey
      )
      mappings.push({
        configKey: option.configKey,
        targetKey: option.configKey,
        kind: 'BindFeature',
        values: [String(schemaOption?.default ?? 'auto')]
      })
    }
  }
  const targetCounts = new Map()
  for (const mapping of mappings) {
    targetCounts.set(mapping.targetKey, (targetCounts.get(mapping.targetKey) || 0) + 1)
  }
  const ambiguousTargets = [...targetCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([targetKey]) => targetKey)
  for (const targetKey of ambiguousTargets) {
    ambiguousGeneratedTargets.push({
      core: core.core,
      targetKey,
      configKeys: mappings.filter(mapping => mapping.targetKey === targetKey).map(mapping => mapping.configKey)
    })
  }
  const safeMappings = mappings.filter(mapping => !ambiguousTargets.includes(mapping.targetKey))
  if (safeMappings.length > 0) generatedMappings[core.normalizedCore] = safeMappings
}
report.summary.coreOptionsAppliedByGeneratedCatalog = Object.values(generatedMappings)
  .reduce((sum, mappings) => sum + mappings.length, 0)
report.summary.ambiguousMappingsExcluded = ambiguousGeneratedTargets
report.summary.ambiguousMappingsHandledByCompositeGenerator = ambiguousGeneratedTargets
  .filter(item => item.configKeys.every(key => generatorRequestedKeys.has(key)))
report.ambiguousGeneratedTargets = ambiguousGeneratedTargets

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
fs.writeFileSync(mappingPath, `${JSON.stringify({
  $schema: 'riescade-libretro-core-options-v1',
  generatedFrom: 'LibRetro.CoreOptions.cs',
  cores: generatedMappings
}, null, 2)}\n`, 'utf8')

console.log(JSON.stringify(report.summary, null, 2))
console.log(`Relatório: ${reportPath}`)
console.log(`Mapeamentos: ${mappingPath}`)
