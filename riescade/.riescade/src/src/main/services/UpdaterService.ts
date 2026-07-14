import { ipcMain, app, BrowserWindow } from 'electron'
import { existsSync, createWriteStream } from 'fs'
import { join } from 'path'
import { lookup as dnsLookup } from 'dns/promises'
import { spawn } from 'child_process'
import { getRetroBatPath, getRiescadePath } from '../utils/paths'

export function registerUpdaterIpc(getMainWindow: () => BrowserWindow | null): void {
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
        const response = await fetch('https://raw.githubusercontent.com/marcoriesco/RIESCADE-OS/main/updater.json', {
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

    const releaseVersion = responseData.version || ''
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
    const zipUrl = responseData.zipUrl || null

    return {
      updateAvailable,
      version: cleanTag,
      releaseNotes: responseData.releaseNotes || '',
      zipUrl,
      diagnostics: attempts
    }
  })

  ipcMain.handle('download-and-install-update', async (event, zipUrl: string) => {
    if (!zipUrl) throw new Error('No zip URL provided')
    try {
      const ext = zipUrl.endsWith('.7z') ? '.7z' : '.zip'
      const zipPath = join(app.getPath('temp'), `riescade-update${ext}`)
      const response = await fetch(zipUrl)
      if (!response.ok) {
        throw new Error(`Failed to download update: ${response.statusText}`)
      }

      const totalBytesStr = response.headers.get('content-length')
      const totalBytes = totalBytesStr ? parseInt(totalBytesStr, 10) : 0
      let downloadedBytes = 0

      const fileStream = createWriteStream(zipPath)
      for await (const chunk of response.body as any) {
        fileStream.write(chunk)
        downloadedBytes += chunk.length
        const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
        event.sender.send('update-progress', {
          status: 'downloading',
          percent,
          downloadedBytes,
          totalBytes
        })
      }
      fileStream.end()

      await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve)
        fileStream.on('error', reject)
      })

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
