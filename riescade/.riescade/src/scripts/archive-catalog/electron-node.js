const { spawnSync } = require('child_process')
const path = require('path')

const script = process.argv[2]
if (!script || !/^[a-z-]+\.js$/.test(script)) {
  console.error('Informe um script válido do módulo archive-catalog.')
  process.exit(1)
}

const electronExecutable = require('electron')
const result = spawnSync(electronExecutable, [path.join(__dirname, script)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(result.status || 0)
