const fs = require('fs')
const path = require('path')
const {
  xmlRoot, snapshotPath, downloadStatePath, resolveCatalogConfig,
  readPlatforms, ensureDirectories
} = require('./common')

async function discoverPublishedIdentifiers() {
  const uploader = process.env.RIESCADE_ARCHIVE_UPLOADER || 'riescade@gmail.com'
  const query = encodeURIComponent(`uploader:"${uploader}"`)
  const url = `https://archive.org/advancedsearch.php?q=${query}&fl%5B%5D=identifier&rows=10000&page=1&output=json`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'RIESCADE-Catalog-Builder/1.0' },
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) {
    throw new Error(`Busca dos uploads de ${uploader} respondeu ${response.status}`)
  }
  const payload = await response.json()
  const docs = payload?.response?.docs
  if (!Array.isArray(docs)) throw new Error('A busca da conta do Archive.org retornou um formato inválido.')
  return new Set(docs.map(item => item?.identifier).filter(identifier => typeof identifier === 'string'))
}

async function downloadPlatform(platform, previousState) {
  const identifier = platform.archive.identifier
  const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(identifier)}_files.xml`
  const destination = path.join(xmlRoot, `${identifier}_files.xml`)
  const temporary = `${destination}.download`
  const previous = previousState[identifier] || {}
  const headers = { 'User-Agent': 'RIESCADE-Catalog-Builder/1.0' }
  if (previous.etag) headers['If-None-Match'] = previous.etag
  if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified

  let response
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000)
    })
    if (![429, 500, 502, 503, 504].includes(response.status)) break
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 1500 * 2 ** attempt)
    console.warn(`aguardando ${platform.id} (${response.status}, tentativa ${attempt + 1}/4)`)
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  if (response.status === 304 && fs.existsSync(destination)) {
    console.log(`cache ${platform.id}`)
    return previous
  }
  if (!response.ok || !response.body) {
    throw new Error(`${platform.id}: Archive.org respondeu ${response.status}`)
  }

  const file = fs.createWriteStream(temporary)
  try {
    for await (const chunk of response.body) {
      if (!file.write(chunk)) await new Promise(resolve => file.once('drain', resolve))
    }
    await new Promise((resolve, reject) => file.end(error => error ? reject(error) : resolve()))
    fs.renameSync(temporary, destination)
  } catch (error) {
    file.destroy()
    fs.rmSync(temporary, { force: true })
    throw error
  }
  console.log(`baixado ${platform.id}`)
  return {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    downloadedAt: new Date().toISOString(),
    bytes: fs.statSync(destination).size
  }
}

async function main() {
  ensureDirectories()
  const source = resolveCatalogConfig()
  const platforms = readPlatforms(source)
  const publishedIdentifiers = await discoverPublishedIdentifiers()
  const publishedPlatforms = platforms.filter(platform =>
    publishedIdentifiers.has(platform.archive.identifier)
  )
  const previousState = fs.existsSync(downloadStatePath)
    ? JSON.parse(fs.readFileSync(downloadStatePath, 'utf8'))
    : {}
  const nextState = { ...previousState }
  const availableIdentifiers = new Set()

  let cursor = 0
  const failures = []
  let unavailableCount = 0
  let abortRequested = false
  const workers = Array.from({ length: Math.min(2, publishedPlatforms.length) }, async () => {
    while (cursor < publishedPlatforms.length && !abortRequested) {
      const platform = publishedPlatforms[cursor++]
      try {
        const state = await downloadPlatform(platform, previousState)
        if (state) {
          nextState[platform.archive.identifier] = state
          availableIdentifiers.add(platform.archive.identifier)
        }
        unavailableCount = 0
      } catch (error) {
        failures.push(error)
        if (/respondeu (429|500|502|503|504)/.test(error.message)) {
          unavailableCount++
          if (unavailableCount >= 4) abortRequested = true
        }
      }
    }
  })
  await Promise.all(workers)
  fs.writeFileSync(downloadStatePath, JSON.stringify(nextState, null, 2))
  if (failures.length) {
    const suffix = abortRequested ? '\nSincronização interrompida: Archive.org temporariamente indisponível.' : ''
    throw new Error(`${failures.length} download(s) falharam:\n${failures.map(error => error.message).join('\n')}${suffix}`)
  }
  const availablePlatforms = publishedPlatforms.filter(platform =>
    availableIdentifiers.has(platform.archive.identifier)
  )
  // The snapshot makes subsequent build/validation independent from the website checkout.
  fs.writeFileSync(snapshotPath, JSON.stringify({ source, platforms: availablePlatforms }, null, 2))
  console.log(`${availablePlatforms.length} plataforma(s) publicadas e preparadas; ${platforms.length - availablePlatforms.length} ignorada(s).`)
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { discoverPublishedIdentifiers }
