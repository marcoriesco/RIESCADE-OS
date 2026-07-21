import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync, rmdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { getRetroBatPath } from '../utils/paths'
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
  'pcsx2': 'pcsx2/pcsx2-qt.exe',
  'pcsx2-16': 'pcsx2-16/pcsx2.exe',
  'pcsx2x6': 'pcsx2x6/pcsx2-qt.exe',
  'cemu': 'cemu/Cemu.exe',
  'dolphin': 'dolphin-emu/Dolphin.exe',
  'dolphin-emu': 'dolphin-emu/Dolphin.exe',
  'duckstation': 'duckstation/duckstation-qt-x64-ReleaseLTC.exe',
  'ppsspp': 'ppsspp/PPSSPPWindows64.exe',
  'flycast': 'flycast/flycast.exe',
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
      } catch (e) {}
    }
  }
  return extractDir
}

export class EmulatorInstaller {
  public static async checkStatus(emulatorName: string, sourceUrl?: string): Promise<EmulatorStatus> {
    const retroBatPath = getRetroBatPath()
    const targetEmu = emulatorName === 'libretro' ? 'retroarch' : emulatorName
    const relExe = EMULATOR_EXES[targetEmu] || EMULATOR_EXES[emulatorName]
    const fullExePath = relExe ? join(retroBatPath, 'emulators', relExe) : ''
    const installed = !!fullExePath && existsSync(fullExePath)

    let installedVersion = 'unknown'
    if (installed) {
      const emuDir = dirname(fullExePath)
      const versionFile = join(emuDir, '.version')
      if (existsSync(versionFile)) {
        try {
          installedVersion = readFileSync(versionFile, 'utf8').trim()
        } catch (e) {}
      }
    }

    // If no sourceUrl is defined, we do not support auto-download/update. Return status as fully installed to bypass.
    if (!sourceUrl) {
      return {
        installed: true,
        name: emulatorName,
        installedVersion,
        latestVersion: installedVersion,
        updateAvailable: false
      }
    }

    try {
      let latestVersion = installedVersion
      let apiUrl = ''

      if (sourceUrl.includes('github.com')) {
        const match = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
        if (match) {
          const owner = match[1]
          const repo = match[2].replace(/\/releases.*$/, '')
          apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`
          const data = await fetchJson(apiUrl)
          latestVersion = data.tag_name || data.name || installedVersion
        }
      } else if (sourceUrl.includes('git.eden-emu.dev')) {
        const match = sourceUrl.match(/git\.eden-emu\.dev\/([^/]+)\/([^/]+)/)
        if (match) {
          const owner = match[1]
          const repo = match[2].replace(/\/releases.*$/, '')
          apiUrl = `https://git.eden-emu.dev/api/v1/repos/${owner}/${repo}/releases`
          const data = await fetchJson(apiUrl)
          if (Array.isArray(data) && data.length > 0) {
            latestVersion = data[0].name || data[0].tag_name || installedVersion
          }
        }
      }

      return {
        installed,
        name: emulatorName,
        sourceUrl,
        installedVersion,
        latestVersion,
        updateAvailable: installed && installedVersion !== 'unknown' && installedVersion !== latestVersion
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
    const targetEmu = emulatorName === 'libretro' ? 'retroarch' : emulatorName
    const relExe = EMULATOR_EXES[targetEmu] || EMULATOR_EXES[emulatorName]
    if (!relExe) {
      throw new Error(`Emulator ${emulatorName} has no registered executable path.`)
    }

    const targetExePath = join(retroBatPath, 'emulators', relExe)
    const targetDir = dirname(targetExePath)
    const exeName = targetExePath.substring(targetExePath.lastIndexOf(join('/')) + 1).split(/[\/\\]/).pop() || ''

    let apiUrl = ''
    let isGitea = false

    if (sourceUrl.includes('github.com')) {
      const match = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      if (match) {
        const owner = match[1]
        const repo = match[2].replace(/\/releases.*$/, '')
        apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`
      }
    } else if (sourceUrl.includes('git.eden-emu.dev')) {
      isGitea = true
      const match = sourceUrl.match(/git\.eden-emu\.dev\/([^/]+)\/([^/]+)/)
      if (match) {
        const owner = match[1]
        const repo = match[2].replace(/\/releases.*$/, '')
        apiUrl = `https://git.eden-emu.dev/api/v1/repos/${owner}/${repo}/releases`
      }
    }

    if (!apiUrl) {
      throw new Error(`Unsupported release repository source: ${sourceUrl}`)
    }

    const releaseData = await fetchJson(apiUrl)
    const latestRelease = isGitea ? releaseData[0] : releaseData
    if (!latestRelease) {
      throw new Error(`No releases found at API: ${apiUrl}`)
    }

    const winZipAsset = findWindowsAsset(latestRelease.assets || [], emulatorName)
    if (!winZipAsset) {
      throw new Error(`Could not find a valid Windows 64-bit .zip release asset for ${emulatorName}.`)
    }

    const downloadUrl = winZipAsset.browser_download_url
    const tempZipPath = join(tmpdir(), `riescade_dl_${emulatorName}.zip`)
    const tempExtractPath = join(tmpdir(), `riescade_ext_${emulatorName}`)

    // 1. Download File
    await downloadFile(downloadUrl, tempZipPath, onProgress)

    // 2. Extract File
    await extractZip(tempZipPath, tempExtractPath)

    // 3. Locate folder containing the .exe
    const srcFolder = getFolderContainingExe(tempExtractPath, exeName)

    // 4. Move files to target directory
    mkdirSync(targetDir, { recursive: true })
    copyDirRecursive(srcFolder, targetDir)

    // 5. Write version file
    const tag = latestRelease.name || latestRelease.tag_name || 'latest'
    writeFileSync(join(targetDir, '.version'), tag, 'utf8')

    // 6. Cleanup temp files
    try {
      unlinkSync(tempZipPath)
      rmDirRecursive(tempExtractPath)
    } catch (e) {
      console.warn('Failed to clean up temp files:', e)
    }
  }
}

function findWindowsAsset(assets: any[], emuName: string): any | null {
  if (!assets || assets.length === 0) return null

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
