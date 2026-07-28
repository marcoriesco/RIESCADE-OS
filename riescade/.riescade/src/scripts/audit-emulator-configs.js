const fs = require('fs')
const path = require('path')

const appRoot = path.resolve(__dirname, '..', '..')
const schemaRoot = path.join(appRoot, 'configs', 'emulators', 'schemas')
const generatorRoot = path.join(appRoot, 'launcher', 'src', 'src', 'generators')
const launcherIndex = fs.readFileSync(path.join(appRoot, 'launcher', 'src', 'src', 'index.ts'), 'utf8')
const reportPath = path.join(appRoot, 'state', 'emulator-config-audit.json')

const generatorFiles = fs.readdirSync(generatorRoot)
  .filter(name => name.endsWith('Generator.ts'))
  .map(name => ({
    name,
    normalized: name.replace(/Generator\.ts$/i, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    source: fs.readFileSync(path.join(generatorRoot, name), 'utf8')
  }))

const registry = new Map()
for (const match of launcherIndex.matchAll(/if\s*\(([\s\S]*?)\)\s*\{\s*return new (\w+Generator)\(args\);\s*\}/g)) {
  for (const emulatorMatch of match[1].matchAll(/emu\s*===\s*['"]([^'"]+)['"]/g)) {
    registry.set(emulatorMatch[1], match[2])
  }
}

function normalized(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findGenerator(schemaId) {
  const registeredClass = registry.get(schemaId)
  if (registeredClass) {
    const registered = generatorFiles.find(file => file.name === `${registeredClass}.ts`)
    if (registered) return registered
  }
  const id = normalized(schemaId)
  const direct = generatorFiles.find(file => file.normalized === id)
  if (direct) return direct
  return generatorFiles.find(file =>
    file.source.includes(`'${schemaId}'`) &&
    (file.source.includes('getEmulatorSetting') || file.source.includes('getCoreSetting'))
  ) || null
}

const schemas = fs.readdirSync(schemaRoot)
  .filter(name => name.endsWith('.schema.json') && name !== '_global.schema.json')
  .map(name => JSON.parse(fs.readFileSync(path.join(schemaRoot, name), 'utf8')))

const results = []
for (const schema of schemas) {
  const generator = findGenerator(schema.id)
  const options = (schema.groups || []).flatMap(group => group.options || [])
  const requestedKeys = generator
    ? [...generator.source.matchAll(/get(?:Emulator|Core)Setting\([^,]+,\s*['"]([^'"]+)['"]/g)]
        .map(match => match[1])
    : []
  const helperKeys = generator
    ? [...generator.source.matchAll(/(?:setting|writeBool)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1])
    : []
  requestedKeys.push(...helperKeys.filter(key => !requestedKeys.includes(key)))
  const duplicateKeys = [...new Set(
    options.map(option => option.configKey).filter((key, index, keys) => keys.indexOf(key) !== index)
  )]
  const invalidDefaults = options
    .filter(option => option.type === 'select' && Array.isArray(option.values))
    .filter(option => !option.values.some(value => String(value.value) === String(option.default)))
    .map(option => option.configKey)
  const unconsumed = generator
    ? options.filter(option => {
        const key = String(option.configKey || option.id)
        const keyMentioned = requestedKeys.includes(key)
        const schemaDriven = generator.source.includes('opt.realKey') && Boolean(option.realKey)
        return !keyMentioned && !schemaDriven
      }).map(option => option.configKey)
    : options.map(option => option.configKey)

  results.push({
    emulator: schema.id,
    generator: generator?.name || null,
    optionCount: options.length,
    consumedCount: options.length - unconsumed.length,
    unconsumed,
    duplicateKeys,
    invalidDefaults
    ,
    requestedKeysMissingFromSchema: requestedKeys.filter(key =>
      !['fullscreen', 'aspect_ratio', 'video_driver', 'vsync', 'audio_driver'].includes(key) &&
      !options.some(option => option.configKey === key)
    )
  })
}

const summary = {
  generatedAt: new Date().toISOString(),
  schemaCount: results.length,
  generatorCount: generatorFiles.length,
  schemasWithoutGenerator: results.filter(item => !item.generator).length,
  schemasWithUnconsumedOptions: results.filter(item => item.unconsumed.length > 0).length,
  totalOptions: results.reduce((total, item) => total + item.optionCount, 0),
  totalUnconsumed: results.reduce((total, item) => total + item.unconsumed.length, 0),
  duplicateKeySchemas: results.filter(item => item.duplicateKeys.length > 0).length,
  invalidDefaultSchemas: results.filter(item => item.invalidDefaults.length > 0).length
  ,
  generatorsRequestingUnknownKeys: results.filter(item => item.requestedKeysMissingFromSchema.length > 0).length
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify({ summary, emulators: results }, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(summary, null, 2))
console.log(`Relatório: ${reportPath}`)
