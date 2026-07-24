import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync, rmdirSync, renameSync, rmSync, mkdtempSync } from 'fs'
import { join, dirname, basename } from 'path'
import { getRetroBatPath, getRiescadePath } from '../utils/paths'
import https from 'https'
import { exec } from 'child_process'
import { tmpdir } from 'os'

export interface EmulatorStatus {
  installed: boolean
  name: string
  sourceUrl?: string
  installedVersion: string
  latestVersion: string
  updateAvailable: boolean
}

const EMULATOR_EXES: Record<string, string> = {
  'ryujinx': 'ryujinx/Ryujinx.exe',
  'eden': 'eden/eden.exe',
  'eden-nightly': 'eden-nightly/eden.exe',
  'citron': 'citron/citron-cmd.exe',
  'retroarch': 'retroarch/retroarch.exe',
  'libretro': 'retroarch/retroarch.exe',
  'pcsx2': 'pcsx2/pcsx2-qt.exe',
  'pcsx2-16': 'pcsx2-16/pcsx2.exe',
  'pcsx2x6': 'pcsx2x6/pcsx2-qt.exe',
  'cemu': 'cemu/Cemu.exe',
  'dolphin': 'dolphin-emu/Dolphin.exe',
  'dolphin-emu': 'dolphin-emu/Dolphin.exe',
  'duckstation': 'duckstation/duckstation-qt-x64-ReleaseLTC.exe',
  'ppsspp': 'ppsspp/PPSSPPWindows64.exe',
  'flycast': 'flycast/flycast.exe',
  'linuxloader': 'linuxloader/linuxloader.exe',
  'xemu': 'xemu/xemu.exe',
  'xenia': 'xenia/xenia.exe',
  'xenia-canary': 'xenia-canary/xenia-canary.exe',
  'ares': 'ares/ares.exe',
  'mame': 'mame/mame.exe',
  'mame64': 'mame/mame.exe',
  'model2': 'm2emulator/emulator.exe',
  'supermodel': 'supermodel/Supermodel.exe',
  'vita3k': 'vita3k/Vita3K.exe',
  'redream': 'redream/redream.exe',
  'shadps4': 'shadps4/shadPS4.exe'
}

interface EmulatorCatalogEntry {
  name: string
  aliases?: string[]
  executable?: string
  installDir: string
  source?: string
  provider?: 'github' | 'gitea' | 'direct'
  assetPattern?: string
  preserve?: string[]
  updateMode?: 'github-release' | 'release' | 'manual'
}

let emulatorCatalogCache: Record<string, EmulatorCatalogEntry> | null = null

function getEmulatorCatalog(): Record<string, EmulatorCatalogEntry> {
  if (emulatorCatalogCache) return emulatorCatalogCache
  const catalogPath = join(getRiescadePath(), 'configs', 'emulators-catalog.json')
  let loadedCatalog: Record<string, EmulatorCatalogEntry> = {}
  try {
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf8'))
    loadedCatalog = parsed.emulators || {}
  } catch (error) {
    console.warn(`[EmulatorInstaller] Could not load ${catalogPath}; using built-in paths.`, error)
  }
  emulatorCatalogCache = loadedCatalog
  return loadedCatalog
}

function getCatalogEntry(emulatorName: string): EmulatorCatalogEntry | undefined {
  const normalized = emulatorName.toLowerCase()
  const catalog = getEmulatorCatalog()
  if (catalog[normalized]) return catalog[normalized]
  return Object.values(catalog).find(entry =>
    entry.aliases?.some(alias => alias.toLowerCase() === normalized)
  )
}

function normalizeVersion(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function resolveReleaseApi(sourceUrl: string, provider?: string): { apiUrl: string; isGitea: boolean } {
  const parsed = new URL(sourceUrl)
  const pathParts = parsed.pathname.split('/').filter(Boolean)
  if (pathParts.length < 2) {
    throw new Error(`Invalid release repository source: ${sourceUrl}`)
  }
  const owner = pathParts[0]
  const repo = pathParts[1]

  if (provider === 'github' || parsed.hostname.toLowerCase() === 'github.com') {
    return {
      apiUrl: `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      isGitea: false
    }
  }

  if (provider === 'gitea' || sourceUrl.includes('/releases')) {
    return {
      apiUrl: `${parsed.protocol}//${parsed.host}/api/v1/repos/${owner}/${repo}/releases`,
      isGitea: true
    }
  }

  throw new Error(`Unsupported release repository source: ${sourceUrl}`)
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (res.headers.location) {
          fetchJson(res.headers.location).then(resolvePromise).catch(reject)
          return
        }
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolvePromise(JSON.parse(data))
        } catch (e: any) {
          reject(new Error(`Failed to parse JSON: ${e.message}`))
        }
      })
    }).on('error', reject)
  })
}

function downloadFile(url: string, destPath: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (res.headers.location) {
          downloadFile(res.headers.location, destPath, onProgress)
            .then(resolvePromise)
            .catch(reject)
          return
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${res.statusCode}`))
        return
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10)
      let downloadedSize = 0

      const fileStream = require('fs').createWriteStream(destPath)

      res.on('data', (chunk) => {
        downloadedSize += chunk.length
        fileStream.write(chunk)
        if (totalSize > 0) {
          const pct = Math.round((downloadedSize / totalSize) * 100)
          onProgress(pct)
        }
      })

      res.on('end', () => {
        fileStream.end()
        resolvePromise()
      })

      res.on('error', (err) => {
        fileStream.close()
        reject(err)
      })
    }).on('error', reject)
  })
}

function extractZip(zipPath: string, extractDir: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    mkdirSync(extractDir, { recursive: true })
    exec(`tar -xf "${zipPath}" -C "${extractDir}"`, (err) => {
      if (err) {
        const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`
        exec(`powershell -NoProfile -Command "${psCommand}"`, (psErr) => {
          if (psErr) {
            reject(new Error(`Extraction failed. Tar error: ${err.message}. PS error: ${psErr.message}`))
          } else {
            resolvePromise()
          }
        })
      } else {
        resolvePromise()
      }
    })
  })
}

function copyDirRecursive(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  const entries = readdirSync(src)
  for (const entry of entries) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

function rmDirRecursive(dir: string) {
  if (existsSync(dir)) {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const entryPath = join(dir, entry)
      if (statSync(entryPath).isDirectory()) {
        rmDirRecursive(entryPath)
      } else {
        unlinkSync(entryPath)
      }
    }
    rmdirSync(dir)
  }
}

function getFolderContainingExe(extractDir: string, exeName: string): string {
  if (existsSync(join(extractDir, exeName))) {
    return extractDir
  }
  const list = readdirSync(extractDir)
  for (const item of list) {
    const fullPath = join(extractDir, item)
    if (statSync(fullPath).isDirectory()) {
      if (existsSync(join(fullPath, exeName))) {
        return fullPath
      }
      // Depth 2 check
      try {
        const subList = readdirSync(fullPath)
        for (const subItem of subList) {
          const subPath = join(fullPath, subItem)
          if (statSync(subPath).isDirectory() && existsSync(join(subPath, exeName))) {
            return subPath
          }
        }
      } catch (e) {
        console.debug('[EmulatorInstaller] Could not remove temporary archive.', e)
      }
    }
  }
  return extractDir
}

export class EmulatorInstaller {
  public static async checkStatus(emulatorName: string, sourceUrl?: string): Promise<EmulatorStatus> {
    const retroBatPath = getRetroBatPath()
    const targetEmu = emulatorName.toLowerCase()
    const catalogEntry = getCatalogEntry(targetEmu)
    const relExe = catalogEntry?.executable || EMULATOR_EXES[targetEmu] || EMULATOR_EXES[emulatorName]
    sourceUrl = sourceUrl || catalogEntry?.source
    const fullExePath = relExe ? join(retroBatPath, 'emulators', relExe) : ''
    const installed = !!fullExePath && existsSync(fullExePath)

    let installedVersion = 'unknown'
    if (installed) {
      const emuDir = dirname(fullExePath)
      const versionFile = join(emuDir, '.version')
      if (existsSync(versionFile)) {
        try {
          installedVersion = readFileSync(versionFile, 'utf8').trim()
        } catch (e) {
          console.warn(`[EmulatorInstaller] Could not read installed version from ${versionFile}.`, e)
        }
      }
    }

    // Installation can still be detected even when no supported download source is registered.
    if (!sourceUrl) {
      return {
        installed,
        name: emulatorName,
        installedVersion,
        latestVersion: installedVersion,
        updateAvailable: false
      }
    }

    try {
      let latestVersion = installedVersion
      const releaseApi = resolveReleaseApi(sourceUrl, catalogEntry?.provider)
      const data = await fetchJson(releaseApi.apiUrl)
      if (releaseApi.isGitea) {
        if (Array.isArray(data) && data.length > 0) {
          // Gitea release names are human-readable and can change independently
          // from the immutable tag stored after installation.
          latestVersion = data[0].tag_name || data[0].name || installedVersion
        }
      } else {
        latestVersion = data.tag_name || data.name || installedVersion
      }

      return {
        installed,
        name: emulatorName,
        sourceUrl,
        installedVersion,
        latestVersion,
        updateAvailable: installed
          && installedVersion !== 'unknown'
          && normalizeVersion(installedVersion) !== normalizeVersion(latestVersion)
      }
    } catch (err) {
      console.error(`Failed to check latest release for ${emulatorName}:`, err)
      return {
        installed,
        name: emulatorName,
        sourceUrl,
        installedVersion,
        latestVersion: installedVersion,
        updateAvailable: false
      }
    }
  }

  public static async downloadAndInstall(
    emulatorName: string,
    sourceUrl: string,
    onProgress: (pct: number) => void
  ): Promise<void> {
    const retroBatPath = getRetroBatPath()
    const targetEmu = emulatorName.toLowerCase()
    const catalogEntry = getCatalogEntry(targetEmu)
    const relExe = catalogEntry?.executable || EMULATOR_EXES[targetEmu] || EMULATOR_EXES[emulatorName]
    sourceUrl = sourceUrl || catalogEntry?.source || ''
    if (!relExe) {
      throw new Error(`Emulator ${emulatorName} has no registered executable path.`)
    }

    const targetExePath = join(retroBatPath, 'emulators', relExe)
    const targetDir = dirname(targetExePath)
    const exeName = basename(targetExePath)

    const { apiUrl, isGitea } = resolveReleaseApi(sourceUrl, catalogEntry?.provider)

    const releaseData = await fetchJson(apiUrl)
    const latestRelease = isGitea ? releaseData[0] : releaseData
    if (!latestRelease) {
      throw new Error(`No releases found at API: ${apiUrl}`)
    }

    const winZipAsset = findWindowsAsset(latestRelease.assets || [], emulatorName, catalogEntry?.assetPattern)
    if (!winZipAsset) {
      throw new Error(`Could not find a valid Windows 64-bit .zip release asset for ${emulatorName}.`)
    }

    const downloadUrl = winZipAsset.browser_download_url
    const tempRoot = mkdtempSync(join(tmpdir(), 'riescade-emulator-'))
    const tempZipPath = join(tempRoot, 'download.zip')
    const tempExtractPath = join(tempRoot, 'extracted')
    const stagingDir = `${targetDir}.riescade-new`
    const backupDir = `${targetDir}.riescade-backup`

    try {
      await downloadFile(downloadUrl, tempZipPath, onProgress)
      await extractZip(tempZipPath, tempExtractPath)
      const srcFolder = getFolderContainingExe(tempExtractPath, exeName)

      rmSync(stagingDir, { recursive: true, force: true })
      mkdirSync(stagingDir, { recursive: true })
      copyDirRecursive(srcFolder, stagingDir)

      for (const relativePath of catalogEntry?.preserve || []) {
        const existingPath = join(targetDir, relativePath)
        const stagedPath = join(stagingDir, relativePath)
        if (!existsSync(existingPath)) continue
        if (statSync(existingPath).isDirectory()) {
          copyDirRecursive(existingPath, stagedPath)
        } else {
          mkdirSync(dirname(stagedPath), { recursive: true })
          copyFileSync(existingPath, stagedPath)
        }
      }

      if (!existsSync(join(stagingDir, exeName))) {
        throw new Error(`The downloaded package does not contain the expected executable ${exeName}.`)
      }

      const tag = latestRelease.tag_name || latestRelease.name || 'latest'
      writeFileSync(join(stagingDir, '.version'), tag, 'utf8')

      rmSync(backupDir, { recursive: true, force: true })
      if (existsSync(targetDir)) renameSync(targetDir, backupDir)
      try {
        renameSync(stagingDir, targetDir)
        rmSync(backupDir, { recursive: true, force: true })
      } catch (installError) {
        if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
        if (existsSync(backupDir)) renameSync(backupDir, targetDir)
        throw installError
      }
    } finally {
      rmSync(stagingDir, { recursive: true, force: true })
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }
}

function findWindowsAsset(assets: any[], emuName: string, assetPattern?: string): any | null {
  if (!assets || assets.length === 0) return null

  if (assetPattern) {
    const matcher = new RegExp(assetPattern, 'i')
    const catalogMatch = assets.find(asset => matcher.test(String(asset.name || '')))
    if (catalogMatch) return catalogMatch
  }

  // Filter zip files containing "win" or "windows"
  const winZipAssets = assets.filter(a => {
    const name = a.name.toLowerCase()
    return name.endsWith('.zip') && (name.includes('win') || name.includes('windows'))
  })

  if (winZipAssets.length === 0) return null

  // Prioritize MSVC or Clang builds for Windows
  const preferred = winZipAssets.find(a => a.name.toLowerCase().includes('msvc') || a.name.toLowerCase().includes('clang'))
  if (preferred) return preferred

  return winZipAssets[0]
}
