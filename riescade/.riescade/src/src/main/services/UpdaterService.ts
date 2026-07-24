import { ipcMain, app, BrowserWindow } from 'electron'
import { existsSync, createWriteStream } from 'fs'
import { join } from 'path'
import { lookup as dnsLookup } from 'dns/promises'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { getRetroBatPath, getRiescadePath } from '../utils/paths'

interface VerifiedUpdate {
  version: string
  zipUrl: string
  sha256: string
  size?: number
}

const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/marcoriesco/RIESCADE-OS/main/updater.json'
const ALLOWED_UPDATE_HOSTS = new Set(['github.com', 'objects.githubusercontent.com'])
const MAX_UPDATE_SIZE = 4 * 1024 * 1024 * 1024

function parseVerifiedUpdate(data: any): VerifiedUpdate {
  const version = typeof data?.version === 'string' ? data.version.replace(/^v/, '') : ''
  const zipUrl = typeof data?.zipUrl === 'string' ? data.zipUrl : ''
  const sha256 = typeof data?.sha256 === 'string' ? data.sha256.toLowerCase() : ''
  const size = Number.isSafeInteger(data?.size) && data.size > 0 ? data.size : undefined
  const parsedUrl = new URL(zipUrl)

  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Manifesto de atualização possui versão inválida.')
  if (parsedUrl.protocol !== 'https:' || !ALLOWED_UPDATE_HOSTS.has(parsedUrl.hostname)) {
    throw new Error('Manifesto de atualização aponta para uma origem não autorizada.')
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('Manifesto de atualização não possui um SHA-256 válido.')
  }
  if (!/\.(zip|7z)$/i.test(parsedUrl.pathname)) {
    throw new Error('Manifesto de atualização aponta para um formato não suportado.')
  }
  if (size && size > MAX_UPDATE_SIZE) throw new Error('Pacote de atualização excede o tamanho permitido.')

  return { version, zipUrl, sha256, size }
}

export function registerUpdaterIpc(getMainWindow: () => BrowserWindow | null): void {
  let verifiedUpdate: VerifiedUpdate | null = null

  ipcMain.handle('check-for-updates', async () => {
    interface DiagnosticAttempt {
      attempt: number
      success: boolean
      dnsIp: string
      dnsFamily: string
      dnsError?: string
      responseTimeMs: number
      httpStatus?: number
      errorName?: string
      errorMessage?: string
      errorCode?: string
      errorCause?: string
    }

    const getDnsDiagnostics = async (hostname: string): Promise<{ ip: string; family: string; error?: string }> => {
      try {
        const result = await dnsLookup(hostname)
        return { ip: result.address, family: result.family === 6 ? 'IPv6' : 'IPv4' }
      } catch (err: any) {
        return { ip: 'Unknown', family: 'Unknown', error: err.code || err.message }
      }
    }

    const attempts: DiagnosticAttempt[] = []
    let responseData: any = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      const dnsInfo = await getDnsDiagnostics('raw.githubusercontent.com')
      const startTime = Date.now()
      let success = false
      let httpStatus: number | undefined
      let errorName: string | undefined
      let errorMessage: string | undefined
      let errorCode: string | undefined
      let errorCause: string | undefined

      try {
        const response = await fetch(UPDATE_MANIFEST_URL, {
          headers: {
            'User-Agent': 'RIESCADE-Updater'
          },
          signal: AbortSignal.timeout(5000)
        })

        httpStatus = response.status
        if (!response.ok) {
          throw new Error(`GitHub raw content returned status ${response.status}`)
        }
        responseData = await response.json()
        success = true
      } catch (err: any) {
        errorName = err.name
        errorMessage = err.message
        errorCode = err.code || err.cause?.code
        errorCause = err.cause ? String(err.cause) : undefined
      }

      const endTime = Date.now()
      const responseTimeMs = endTime - startTime

      attempts.push({
        attempt,
        success,
        dnsIp: dnsInfo.ip,
        dnsFamily: dnsInfo.family,
        dnsError: dnsInfo.error,
        responseTimeMs,
        httpStatus,
        errorName,
        errorMessage,
        errorCode,
        errorCause
      })

      console.warn(
        `[check-for-updates] Attempt ${attempt}: ` +
        `Success=${success}, ` +
        `DNS=${dnsInfo.ip} (${dnsInfo.family})` + (dnsInfo.error ? ` [DNS Error: ${dnsInfo.error}]` : '') + `, ` +
        `Time=${responseTimeMs}ms` + (httpStatus ? `, HTTP=${httpStatus}` : '') +
        (errorMessage ? `, Error: ${errorName} (${errorMessage})` : '')
      )

      if (success) {
        break
      }

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    if (!responseData) {
      const dnsFail = attempts.some(a => a.dnsError)
      const isTimeout = attempts.some(a => a.errorName === 'TimeoutError' || a.errorCode === 'UND_ERR_CONNECT_TIMEOUT' || a.errorCause?.includes('timeout') || a.errorMessage?.includes('timeout'))
      const isRateLimit = attempts.some(a => a.httpStatus === 403 || a.httpStatus === 429)

      let friendlyMsg = 'Não foi possível conectar ao GitHub. Verifique VPN, firewall ou conexão com a internet.'
      if (dnsFail) {
        friendlyMsg = 'Não foi possível resolver o endereço do GitHub. Verifique sua conexão com a internet ou servidor DNS.'
      } else if (isRateLimit) {
        friendlyMsg = 'O limite de requisições ao GitHub foi excedido ou o serviço está temporariamente indisponível.'
      } else if (isTimeout) {
        friendlyMsg = 'A conexão com o GitHub expirou. Verifique VPN, firewall ou instabilidade na sua rede.'
      }

      return {
        updateAvailable: false,
        version: '',
        releaseNotes: '',
        zipUrl: null,
        error: true,
        errorMsg: friendlyMsg,
        diagnostics: attempts
      }
    }

    let manifest: VerifiedUpdate
    try {
      manifest = parseVerifiedUpdate(responseData)
      verifiedUpdate = manifest
    } catch (error: any) {
      verifiedUpdate = null
      return {
        updateAvailable: false,
        version: '',
        releaseNotes: '',
        error: true,
        errorMsg: error.message || 'Manifesto de atualização inválido.',
        diagnostics: attempts
      }
    }

    const releaseVersion = manifest.version
    const currentVersion = app.getVersion()

    const cleanTag = releaseVersion.replace(/^v/, '')
    const cleanApp = currentVersion.replace(/^v/, '')

    const compareSemver = (v1: string, v2: string): number => {
      const a = v1.split('.').map(Number)
      const b = v2.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        const na = a[i] || 0
        const nb = b[i] || 0
        if (na > nb) return 1
        if (na < nb) return -1
      }
      return 0
    }

    const updateAvailable = compareSemver(cleanTag, cleanApp) > 0
    return {
      updateAvailable,
      version: cleanTag,
      releaseNotes: responseData.releaseNotes || '',
      diagnostics: attempts
    }
  })

  ipcMain.handle('download-and-install-update', async (event) => {
    if (!verifiedUpdate) throw new Error('Verifique a atualização novamente antes de instalar.')
    const { zipUrl, sha256: expectedSha256, size: expectedSize } = verifiedUpdate
    try {
      const ext = zipUrl.endsWith('.7z') ? '.7z' : '.zip'
      const zipPath = join(app.getPath('temp'), `riescade-update${ext}`)
      const response = await fetch(zipUrl)
      if (!response.ok) {
        throw new Error(`Failed to download update: ${response.statusText}`)
      }

      const totalBytesStr = response.headers.get('content-length')
      const totalBytes = totalBytesStr ? parseInt(totalBytesStr, 10) : 0
      if (totalBytes > MAX_UPDATE_SIZE || (expectedSize && totalBytes && totalBytes !== expectedSize)) {
        throw new Error('O tamanho do pacote não corresponde ao manifesto.')
      }
      let downloadedBytes = 0
      const hash = createHash('sha256')

      const fileStream = createWriteStream(zipPath)
      for await (const chunk of response.body as any) {
        hash.update(chunk)
        fileStream.write(chunk)
        downloadedBytes += chunk.length
        if (downloadedBytes > MAX_UPDATE_SIZE) {
          fileStream.destroy()
          throw new Error('O pacote excede o tamanho máximo permitido.')
        }
        const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
        event.sender.send('update-progress', {
          status: 'downloading',
          percent,
          downloadedBytes,
          totalBytes
        })
      }
      fileStream.end()

      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', () => resolve())
        fileStream.on('error', reject)
      })

      if (expectedSize && downloadedBytes !== expectedSize) {
        throw new Error('O pacote baixado está incompleto.')
      }
      const actualSha256 = hash.digest('hex')
      if (actualSha256 !== expectedSha256) {
        throw new Error('A verificação de integridade da atualização falhou.')
      }
      verifiedUpdate = null

      const tempExtractDir = join(app.getPath('temp'), 'rcupd')
      const currentAppDir = getRetroBatPath()
      const wrapperLauncherPath = join(currentAppDir, 'RIESCADE.exe')
      const execPath = existsSync(wrapperLauncherPath) ? wrapperLauncherPath : process.execPath

      const updaterPath = join(getRiescadePath(), 'updater', 'RIESCADEUpdater.exe')
      if (existsSync(updaterPath)) {
        const child = spawn(updaterPath, [zipPath, currentAppDir, execPath], {
          detached: true,
          stdio: 'ignore'
        })
        child.unref()
        app.quit()
        return
      }

      if (existsSync(tempExtractDir)) {
        try {
          const fs = require('fs')
          fs.rmSync(tempExtractDir, { recursive: true, force: true })
        } catch (err) {
          console.error('Failed to clean tempExtractDir:', err)
        }
      }
      const fs = require('fs')
      fs.mkdirSync(tempExtractDir, { recursive: true })

      const psCommand = `Start-Sleep -s 1;
$zipPath = '${zipPath.replace(/'/g, "''")}';
$tempExtractDir = '${tempExtractDir.replace(/'/g, "''")}';
$currentAppDir = '${currentAppDir.replace(/'/g, "''")}';
$execPath = '${execPath.replace(/'/g, "''")}';

try {
    if ($zipPath.EndsWith('.7z')) {
        $sevenZip = Join-Path $currentAppDir "riescade\\7z.exe";
        if (!(Test-Path $sevenZip)) { $sevenZip = "C:\\Program Files\\7-Zip\\7z.exe"; }
        if (!(Test-Path $sevenZip)) { $sevenZip = "7z"; }
        & $sevenZip x $zipPath "-o$tempExtractDir" -y | Out-Null;
    } else {
        Expand-Archive -Path $zipPath -DestinationPath $tempExtractDir -Force;
    }
    $exes = Get-ChildItem -Path $tempExtractDir -Filter "RIESCADE.exe" -Recurse | Sort-Object {$_.FullName.Length};
    $exe = if ($exes) { $exes[0] } else { $null };
    $srcDir = if ($exe) { $exe.DirectoryName } else { $tempExtractDir };

    # Retry copying up to 20 times (with 1s sleep in between) to allow file locks to clear
    $copied = $false;
    for ($i = 1; $i -le 20; $i++) {
        try {
            Copy-Item -Path "$srcDir\\*" -Destination $currentAppDir -Recurse -Force -ErrorAction Stop;
            $copied = $true;
            break;
        } catch {
            Start-Sleep -s 1;
        }
    }

    if ($copied) {
        Start-Process -FilePath $execPath;
    } else {
        Out-File -FilePath "$currentAppDir\\update_error.log" -InputObject "Failed to copy update files after 20 attempts. File locks might still be active." -Encoding UTF8;
    }
} catch {
    Out-File -FilePath "$currentAppDir\\update_error.log" -InputObject $_.Exception.Message -Encoding UTF8;
} finally {
    if (Test-Path $tempExtractDir) { Remove-Item -Path $tempExtractDir -Recurse -Force; }
    if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force; }
}
`

      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', psCommand
      ], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()

      app.quit()
    } catch (e: any) {
      const isNetworkError =
        e.name === 'TimeoutError' ||
        e.message?.includes('fetch failed') ||
        e.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        e.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        e.cause?.message?.includes('timeout') ||
        e.cause?.code === 'ENOTFOUND' ||
        e.cause?.code === 'EAI_AGAIN';

      if (isNetworkError) {
        console.warn('download-and-install-update: Network error or offline. Could not download update zip.')
        throw new Error('Failed to download update file. Please check your internet connection.')
      }

      console.error('download-and-install-update error:', e)
      throw e
    }
  })
}
