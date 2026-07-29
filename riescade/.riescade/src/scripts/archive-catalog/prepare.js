const { spawnSync } = require('child_process')
const path = require('path')

for (const script of ['download.js', 'build.js', 'validate.js']) {
  const usesSqlite = script !== 'download.js'
  const executable = usesSqlite ? require('electron') : process.execPath
  const result = spawnSync(executable, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: usesSqlite
      ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      : process.env
  })
  if (result.status !== 0) process.exit(result.status || 1)
}
