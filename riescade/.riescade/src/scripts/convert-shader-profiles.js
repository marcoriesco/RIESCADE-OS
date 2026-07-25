const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const shadersRoot = path.resolve(__dirname, '..', '..', '..', 'shaders')
const sourceFileName = 'rendering-defaults.yml'

function convertProfile(directoryName) {
  const sourcePath = path.join(shadersRoot, directoryName, sourceFileName)
  const source = yaml.load(fs.readFileSync(sourcePath, 'utf8'))

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('o YAML não contém um objeto na raiz')
  }

  const { default: defaultSettings = {}, ...systems } = source
  if (!defaultSettings || typeof defaultSettings !== 'object' || Array.isArray(defaultSettings)) {
    throw new Error('a seção "default" é inválida')
  }

  const profile = {
    $schema: 'riescade-shader-profile-v1',
    name: directoryName,
    default: defaultSettings,
    systems
  }
  const destinationPath = path.join(shadersRoot, `${directoryName}.json`)
  fs.writeFileSync(destinationPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
  return { destinationPath, systemCount: Object.keys(systems).length }
}

const directories = fs.readdirSync(shadersRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => fs.existsSync(path.join(shadersRoot, name, sourceFileName)))
  .sort((a, b) => a.localeCompare(b))

if (directories.length === 0) {
  console.log('Nenhum rendering-defaults.yml encontrado.')
  process.exit(0)
}

let failed = false
for (const directoryName of directories) {
  try {
    const result = convertProfile(directoryName)
    console.log(`${path.basename(result.destinationPath)}: ${result.systemCount} sistemas`)
  } catch (error) {
    failed = true
    console.error(`${directoryName}: ${error.message}`)
  }
}

if (failed) process.exitCode = 1
