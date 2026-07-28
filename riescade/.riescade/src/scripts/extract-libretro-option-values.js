const fs = require('fs')
const path = require('path')

const appRoot = path.resolve(__dirname, '..', '..')
const retroarchRoot = path.resolve(appRoot, '..', '..', 'emulators', 'retroarch')
const schemaPath = path.join(appRoot, 'configs', 'emulators', 'schemas', 'libretro.schema.json')
const mappingsPath = path.join(appRoot, 'configs', 'emulators', 'libretro-core-options.json')
const outputPath = path.join(appRoot, 'state', 'libretro-option-value-candidates.json')

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8')).cores || {}
const options = (schema.groups || []).flatMap(group => group.options || [])
const cfgKeys = new Set(
  fs.readFileSync(path.join(retroarchRoot, 'retroarch-core-options.cfg'), 'utf8')
    .split(/\r?\n/)
    .map(line => line.split('=')[0].trim())
    .filter(Boolean)
)

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function dllCore(core) {
  if (core === 'mupen64plus') return 'mupen64plus_next'
  return core
}

function stringsFromRange(buffer, start, end) {
  const result = []
  let current = ''
  for (let index = start; index < end; index++) {
    const value = buffer[index]
    if (value >= 32 && value < 127) {
      current += String.fromCharCode(value)
    } else {
      if (current.length >= 2) result.push(current)
      current = ''
    }
  }
  if (current.length >= 2) result.push(current)
  return result
}

function candidateSequences(buffer, targetKey) {
  const sequences = []
  const needle = Buffer.from(targetKey, 'ascii')
  let offset = 0
  while (offset < buffer.length && sequences.length < 8) {
    const found = buffer.indexOf(needle, offset)
    if (found < 0) break
    const before = found === 0 ? 0 : buffer[found - 1]
    const afterIndex = found + needle.length
    const after = afterIndex >= buffer.length ? 0 : buffer[afterIndex]
    if ((before < 32 || before >= 127) && (after < 32 || after >= 127)) {
      const strings = stringsFromRange(buffer, found, Math.min(buffer.length, found + 32768))
      const values = []
      for (const value of strings.slice(1, 100)) {
        if (cfgKeys.has(value)) break
        if (looksLikeValue(value) && !values.includes(value)) values.push(value)
      }
      if (values.length > 0) sequences.push(values)
    }
    offset = found + needle.length
  }
  return sequences
}

function looksLikeValue(value) {
  if (!value || value.length > 48) return false
  if (/^[A-Za-z]:[\\/]/.test(value)) return false
  if (/[.!?].*\s/.test(value)) return false
  if (/^(Copyright|http|Error |Failed |RetroArch)/i.test(value)) return false
  return /^[\w%+./:() -]+$/.test(value)
}

const results = []
const requestedOptions = options.filter(option =>
    option.type !== 'select'
      ? false
      : !option.dynamicSource
        && Array.isArray(option.values)
        && !option.values.some(value => String(value.value) !== 'auto')
        && Boolean(option.core)
)
const optionsByCore = new Map()
for (const option of requestedOptions) {
  const coreName = String(option.core)
  if (!optionsByCore.has(coreName)) optionsByCore.set(coreName, [])
  optionsByCore.get(coreName).push(option)
}

for (const [schemaCore, coreEntries] of optionsByCore) {
  const coreName = dllCore(schemaCore)
  const dllPath = path.join(retroarchRoot, 'cores', `${coreName}_libretro.dll`)
  if (!fs.existsSync(dllPath)) {
    for (const option of coreEntries) {
      results.push({
        core: option.core,
        configKey: option.configKey,
        targetKey: option.configKey,
        status: 'core-nao-instalado'
      })
    }
    continue
  }

  const buffer = fs.readFileSync(dllPath)
  for (const option of coreEntries) {
    const coreKey = normalize(option.core)
    const mapping = (mappings[coreKey] || []).find(item => item.configKey === option.configKey)
    const targetKey = mapping?.targetKey || option.configKey
    const candidates = candidateSequences(buffer, targetKey)

    results.push({
      core: option.core,
      configKey: option.configKey,
      targetKey,
      status: candidates.length > 0 ? 'candidatos-encontrados' : 'sem-candidatos',
      candidates
    })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    requested: results.length,
    coresNotInstalled: results.filter(item => item.status === 'core-nao-instalado').length,
    withCandidates: results.filter(item => item.status === 'candidatos-encontrados').length,
    withoutCandidates: results.filter(item => item.status === 'sem-candidatos').length
  },
  note: 'Candidatos extraídos dos DLLs instalados. Exigem validação antes de alterar o esquema.',
  options: results
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report.summary, null, 2))
console.log(`Relatório: ${outputPath}`)
