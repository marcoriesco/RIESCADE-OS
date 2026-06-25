import { exec } from 'child_process'
import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, statSync, openSync, readSync, closeSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { tmpdir } from 'os'
import { Game, System } from '../../shared/types'
import { getRetroBatPath } from '../utils/paths'
import { SettingsParser } from '../parsers/SettingsParser'

interface ControllerInfo {
  name: string
  guid: string
  path?: string
  buttons: number
  axes: number
  hats: number
}

export class LauncherService {
  public launch(game: Game, system: System, activeControllers: ControllerInfo[] = [], saveStateSlot?: number, netplayOptions?: any): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const { BrowserWindow } = require('electron')
      const sendLauncherStatus = (status: 'loading' | 'running' | 'closed') => {
        BrowserWindow.getAllWindows().forEach((win: any) => {
          if (!win.isDestroyed()) {
            win.webContents.send('launcher-status', { status })
          }
        })
      }

      const retroBatPath = getRetroBatPath()
      const launcherPath = join(retroBatPath, 'riescade', 'riescadeLauncher', 'riescadeLauncher.exe')
      
      // Resolve Rom Path relative to system.path instead of hardcoding roms directory
      const romPath = resolve(system.path, game.path)

      // If it's a retrobat/menu shortcut (.menu file), parse it and run the emulator directly
      if (game.path.endsWith('.menu') || (system.extension && system.extension.toLowerCase().includes('.menu'))) {
        try {
          const fs = require('fs')
          if (fs.existsSync(romPath)) {
            const menuContent = fs.readFileSync(romPath, 'utf-8')
            const lines = menuContent.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0)
            if (lines.length > 0) {
              const relativeExe = lines[0].startsWith('\\') ? lines[0] : '\\' + lines[0]
              const exePath = join(retroBatPath, 'emulators', relativeExe)
              const menuArgs = lines.slice(1).join(' ')
              const command = `"${exePath}" ${menuArgs}`
              console.log(`Launching menu shortcut: ${command}`)
              
              sendLauncherStatus('loading')
              const shortcutTimer = setTimeout(() => sendLauncherStatus('running'), 1000)

              exec(command, { cwd: dirname(exePath) }, (error) => {
                clearTimeout(shortcutTimer)
                sendLauncherStatus('closed')
                if (error) {
                  console.warn('Menu shortcut exited with code:', error.code)
                }
                resolvePromise()
              })
              return
            }
          }
        } catch (err) {
          console.error('Failed to read or launch .menu file:', err)
        }
      }
      
      // Create a temporary gameinfo XML as ES does
      const tempDir = join(tmpdir(), 'riescade.tmp')
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
      
      const resolvePath = (p?: string | null): string => {
        if (!p || typeof p !== 'string') return ''
        if (p.startsWith('http') || p.match(/^[a-zA-Z]:/) || p.startsWith('/')) {
          return p.replace(/\\/g, '/')
        }
        return resolve(system.path, p).replace(/\\/g, '/')
      }

      const gameXmlPath = join(tempDir, 'game.xml')
      const gameXmlContent = `<?xml version="1.0"?>
<gameList>
  <game>
    <path>${game.path}</path>
    <name>${game.name}</name>
    <desc>${game.desc || ''}</desc>
    <image>${resolvePath(game.image)}</image>
    <video>${resolvePath(game.video)}</video>
    <rating>${game.rating || 0}</rating>
    <releasedate>${game.releasedate || ''}</releasedate>
    <developer>${game.developer || ''}</developer>
    <publisher>${game.publisher || ''}</publisher>
    <genre>${game.genre || ''}</genre>
    <players>${game.players || ''}</players>
  </game>
</gameList>`
      
      writeFileSync(gameXmlPath, gameXmlContent)

      // Setup arguments
      const settingsParser = new SettingsParser()
      let emulator = 'libretro'
      let core = ''

      // 1. Resolve Emulator
      if (game.emulator && game.emulator !== 'auto') {
        emulator = game.emulator
      } else {
        const systemWideEmulator = settingsParser.getSetting(`${system.name}.emulator`, 'string')
        if (systemWideEmulator && systemWideEmulator !== 'auto') {
          emulator = systemWideEmulator
        } else if (system.emulators?.[0]?.name) {
          emulator = system.emulators[0].name
        }
      }

      // 2. Resolve Core
      if (game.core && game.core !== 'auto') {
        core = game.core
      } else {
        const hasGameEmulatorOverride = game.emulator && game.emulator !== 'auto'
        const systemWideCore = settingsParser.getSetting(`${system.name}.core`, 'string')

        if (hasGameEmulatorOverride) {
          const selectedEmulator = system.emulators?.find(e => e.name === emulator)
          core = selectedEmulator?.cores?.[0] || ''
        } else {
          if (systemWideCore && systemWideCore !== 'auto') {
            core = systemWideCore
          } else {
            const selectedEmulator = system.emulators?.find(e => e.name === emulator)
            if (selectedEmulator) {
              core = selectedEmulator.cores?.[0] || ''
            } else if (system.emulators?.[0]) {
              core = system.emulators[0].cores?.[0] || ''
            }
          }
        }
      }

      const selectedEmulator = system.emulators?.find(e => e.name === emulator)
      if (selectedEmulator && selectedEmulator.command) {
        // Parse command line arguments respecting double quotes first
        const parseCommandArgs = (cmdLine: string): string[] => {
          const args: string[] = []
          let current = ''
          let inQuotes = false
          for (let i = 0; i < cmdLine.length; i++) {
            const char = cmdLine[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ' ' && !inQuotes) {
              if (current.length > 0) {
                args.push(current)
                current = ''
              }
            } else {
              current += char
            }
          }
          if (current.length > 0) {
            args.push(current)
          }
          return args
        }

        const rawArgs = parseCommandArgs(selectedEmulator.command)
        
        // Perform placeholder replacements on each argument individually
        const replacePlaceholders = (str: string): string => {
          return str
            .replace(/%HOME%/g, join(retroBatPath, 'riescade'))
            .replace(/%ROM%/g, romPath)
            .replace(/%SYSTEM%/g, system.name)
            .replace(/%EMULATOR%/g, emulator)
            .replace(/%CORE%/g, core)
        }

        const processedArgs = rawArgs.map(arg => replacePlaceholders(arg))
        const rawExePath = processedArgs[0] || ''
        const exeArgs = processedArgs.slice(1)

        const resolvedExePath = resolve(retroBatPath, rawExePath)
        const execCwd = dirname(resolvedExePath)

        console.log(`Launching Custom Emulator Executable: ${resolvedExePath} with args:`, exeArgs)
        
        sendLauncherStatus('loading')
        const runTimer = setTimeout(() => sendLauncherStatus('running'), 1000)

        const { spawn } = require('child_process')
        const child = spawn(resolvedExePath, exeArgs, { cwd: execCwd })

        child.on('error', (err) => {
          clearTimeout(runTimer)
          sendLauncherStatus('closed')
          console.error('Failed to spawn custom emulator:', err)
          reject(new Error(err.message || 'Failed to launch emulator.'))
        })

        child.on('exit', (code) => {
          clearTimeout(runTimer)
          sendLauncherStatus('closed')
          if (code !== 0 && code !== null) {
            console.warn(`Custom emulator exited with code: ${code}`)
            reject(new Error(`Emulator exited with code ${code}`))
          } else {
            resolvePromise()
          }
        })
        return
      }

      let controllerArgs: string[] = []
      
      let finalControllers = activeControllers
      if (!finalControllers || finalControllers.length === 0) {
        console.log('No active controllers from renderer. Performing native detection...')
        finalControllers = this.detectConnectedControllers()
        console.log(`Natively detected controllers: ${finalControllers.length}`, finalControllers)
      }
      
      if (finalControllers.length > 0) {
        // Try to get a list of HID device IDs to match paths
        let devicePaths: string[] = []
        try {
          const stdout = require('child_process').execFileSync('powershell', [
            '-Command',
            'Get-PnpDevice -Status OK | Where-Object { $_.InstanceId -like "*VID_*" -and $_.InstanceId -like "*PID_*" } | Select-Object -ExpandProperty InstanceId'
          ], { encoding: 'utf8' })
          let rawPaths = stdout.split('\n').map(s => s.trim()).filter(s => s.length > 0)
          
          // Filter out parent/raw USB paths to ensure we pick the correct HID/IG node paths
          devicePaths = rawPaths.filter((dp: string) => {
            const dpUpper = dp.toUpperCase()
            if (dpUpper.startsWith('USB\\') && dpUpper.includes('&IG_')) {
              return false
            }
            // If it's a raw USB path like USB\VID_045E&PID_028E\01, filter it out if we have an IG node path for this controller
            const vidMatch = dpUpper.match(/VID_([0-9A-F]{4})/)
            const pidMatch = dpUpper.match(/PID_([0-9A-F]{4})/)
            if (vidMatch && pidMatch && dpUpper.startsWith('USB\\') && !dpUpper.includes('&IG_')) {
              const hasIg = rawPaths.some((x: string) => {
                const xUpper = x.toUpperCase()
                return xUpper.includes(`VID_${vidMatch[1]}`) && xUpper.includes(`PID_${pidMatch[1]}`) && xUpper.includes('&IG_')
              })
              if (hasIg) return false
            }
            return true
          })
        } catch (e) {
          console.error('Failed to get device paths via PowerShell', e)
        }

        finalControllers.forEach((controller, index) => {
          const p = `p${index + 1}`
          
          // Try to find the path for this controller
          // GUID format (SDL2): 03000000vVsS0000pPsS0000... (swapped bytes)
          let discoveredPath = ""
          if (controller.guid.length >= 20) {
            const vSwap = controller.guid.substring(8, 12)
            const pSwap = controller.guid.substring(16, 20)
            const vidMatch = vSwap.substring(2, 4) + vSwap.substring(0, 2)
            const pidMatch = pSwap.substring(2, 4) + pSwap.substring(0, 2)
            
            if (vidMatch && pidMatch) {
              // Find paths matching this VID/PID
              const matches = devicePaths.filter(dp => 
                dp.toUpperCase().includes(`VID_${vidMatch.toUpperCase()}`) && 
                dp.toUpperCase().includes(`PID_${pidMatch.toUpperCase()}`)
              )
              // Use the index to pick the correct one if multiple are connected
              if (matches.length > 0) {
                discoveredPath = matches[index] || matches[0]
              }
            }
          }

          // If still empty, use the provided path or default
          const finalPath = discoveredPath || controller.path || ""

          controllerArgs.push(
            `-${p}index`, index.toString(),
            `-${p}guid`, controller.guid,
            `-${p}name`, `"${controller.name}"`,
            `-${p}nbbuttons`, controller.buttons.toString(),
            `-${p}nbaxes`, controller.axes.toString(),
            `-${p}nbhats`, (controller.hats || 1).toString(),
            `-${p}path`, `"${finalPath}"`
          )
        })
      }

      let saveStateArgs: string[] = []
      if (saveStateSlot !== undefined) {
        if (saveStateSlot === -2) {
          saveStateArgs.push('-autosave', '0')
        } else if (saveStateSlot === -1) {
          saveStateArgs.push('-autosave', '1')
        } else if (saveStateSlot >= 0) {
          saveStateArgs.push('-state_slot', saveStateSlot.toString(), '-autosave', '1')
        }
      } else {
        const globalAutosave = settingsParser.getSetting('global.autosave', 'bool')
        if (globalAutosave === 'true' || globalAutosave === true || globalAutosave === '1') {
          saveStateArgs.push('-autosave', '1')
        }
      }

      // 3. Resolve Netplay arguments
      let netplayArgs: string[] = []
      if (netplayOptions) {
        const mode = netplayOptions.netPlayMode === 'host' ? 'host' : (netplayOptions.netPlayMode === 'spectator' ? 'client' : 'client')
        const nick = settingsParser.getSetting('global.netplay.nickname', 'string') || 'RIESCADE Player'
        netplayArgs.push(
          '-netplaymode', mode,
          '-netplayport', String(netplayOptions.port),
          '-netplaynick', `"${nick}"`
        )
        if (netplayOptions.ip && mode !== 'host') {
          netplayArgs.push('-netplayip', netplayOptions.ip)
        }
        if (netplayOptions.session) {
          netplayArgs.push('-netplaysession', netplayOptions.session)
        }
        if (netplayOptions.netPlayMode === 'spectator') {
          netplayArgs.push('-netplayspectate')
        }
        if (netplayOptions.password) {
          netplayArgs.push('-netplaypassword', netplayOptions.password)
        }
        if (netplayOptions.spectatorPassword) {
          netplayArgs.push('-netplayspectatepassword', netplayOptions.spectatorPassword)
        }
      } else {
        const netplayEnabled = settingsParser.getSetting('global.netplay', 'bool') === 'true' || settingsParser.getSetting('global.netplay', 'bool') === true || settingsParser.getSetting('global.netplay', 'bool') === '1' || settingsParser.getSetting('global.netplay', 'bool') === 1
        const netplayAutoLobby = settingsParser.getSetting('NetPlayAutomaticallyCreateLobby', 'bool') === 'true' || settingsParser.getSetting('NetPlayAutomaticallyCreateLobby', 'bool') === true || settingsParser.getSetting('NetPlayAutomaticallyCreateLobby', 'bool') === '1' || settingsParser.getSetting('NetPlayAutomaticallyCreateLobby', 'bool') === 1

        if (netplayEnabled && netplayAutoLobby) {
          const port = settingsParser.getSetting('global.netplay.port', 'string') || '55435'
          const nick = settingsParser.getSetting('global.netplay.nickname', 'string') || 'RIESCADE Player'
          netplayArgs.push(
            '-netplaymode', 'host',
            '-netplayport', port,
            '-netplaynick', `"${nick}"`
          )
        }
      }

      const args = [
        '-gameinfo', `"${gameXmlPath}"`,
        ...controllerArgs,
        '-system', system.name,
        '-emulator', emulator,
        '-core', core,
        ...saveStateArgs,
        ...netplayArgs,
        '-rom', `"${romPath}"`
      ]

      const errorLogPath = join(tmpdir(), 'emulationstation.tmp', 'launch_error.log')
      if (existsSync(errorLogPath)) {
        try {
          unlinkSync(errorLogPath)
        } catch (e) {
          console.warn('Failed to delete old launch_error.log', e)
        }
      }


      const logPath = join(retroBatPath, 'riescade', '.riescade', 'logs', 'riescadeLauncher.log')
      let hasSentRunning = false

      sendLauncherStatus('loading')

      const checkLog = () => {
        if (hasSentRunning) return
        if (!existsSync(logPath)) return
        try {
          const content = readFileSync(logPath, 'utf8')
          const sections = content.split(/[-]{10,}/)
          const lastSection = sections[sections.length - 1] || ''
          if (lastSection.includes('[Running]')) {
            sendLauncherStatus('running')
            hasSentRunning = true
          }
        } catch (e) {
          console.error('Error reading launcher log:', e)
        }
      }

      const logInterval = setInterval(checkLog, 150)

      const command = `"${launcherPath}" ${args.join(' ')}`
      console.log(`Launching: ${command}`)

      exec(command, { cwd: retroBatPath }, (error) => {
        clearInterval(logInterval)
        sendLauncherStatus('closed')

        if (error && error.code) {
          console.warn('Launcher exited with code:', error.code)
          let errorMessage = 'Failed to launch emulator.'
          if (existsSync(errorLogPath)) {
            try {
              errorMessage = readFileSync(errorLogPath, 'utf8').trim()
            } catch (e) {
              console.error('Failed to read launch_error.log', e)
            }
          } else {
            const exitCode = error.code
            if (exitCode === 200) {
              errorMessage = 'The emulator closed unexpectedly. Check settings or logs.'
            } else if (exitCode === 201) {
              errorMessage = 'Invalid command line or error in passed arguments.'
            } else if (exitCode === 202) {
              errorMessage = 'Invalid emulator configuration.'
            } else if (exitCode === 203) {
              errorMessage = 'Unknown emulator or not configured for this system.'
            } else if (exitCode === 204) {
              errorMessage = 'The emulator is not installed. Please install the emulator for this system.'
            } else if (exitCode === 205) {
              errorMessage = 'A required core to run the game is missing.'
            } else if (exitCode === 299) {
              errorMessage = 'Custom error in emulator.'
            } else {
              errorMessage = `An error occurred while launching the emulator (Code: ${exitCode}).`
            }
          }
          reject(new Error(errorMessage))
        } else {
          resolvePromise()
        }
      })
    })
  }

  private detectConnectedControllers(): any[] {
    const controllers: any[] = []
    try {
      const retroBatPath = getRetroBatPath()
      const inputFile = join(retroBatPath, 'riescade', '.riescade', 'configs', 'input.json')
      let configs: any[] = []
      if (existsSync(inputFile)) {
        try {
          const raw = readFileSync(inputFile, 'utf8')
          configs = JSON.parse(raw).inputConfigs || []
        } catch (e) {
          console.error('Failed to parse input.json in native detector', e)
        }
      }

      // Query gamepads via PowerShell (execFileSync prevents shell variable/quote expansion issues)
      const stdout = require('child_process').execFileSync('powershell', [
        '-Command',
        'Get-PnpDevice -Status OK | Where-Object { $_.FriendlyName -like "*Controlador*" -or $_.FriendlyName -like "*gamepad*" -or $_.FriendlyName -like "*joystick*" -or $_.InstanceId -like "*IG_*" } | Where-Object { $_.Class -eq "HIDClass" -or $_.Class -eq "Gamepad" -or $_.Class -eq "Xboxgip" } | Select-Object FriendlyName, InstanceId | ConvertTo-Json'
      ], { encoding: 'utf8' }).trim()
      if (stdout) {
        const parsed = JSON.parse(stdout)
        let devices = Array.isArray(parsed) ? parsed : [parsed]

        // Filter out duplicate driver/parent nodes to keep only the actual gamepad HID/IG node
        const seenInstances = new Set<string>()
        devices = devices.filter(device => {
          if (!device.InstanceId) return false
          const instanceId = device.InstanceId.toUpperCase()
          
          // Ignore parent USB driver nodes for XInput/Xbox controllers
          if (instanceId.startsWith('USB\\') && instanceId.includes('&IG_')) {
            return false
          }
          
          // Ignore raw USB node if we have an IG node path for this controller
          const vidMatch = instanceId.match(/VID_([0-9A-F]{4})/)
          const pidMatch = instanceId.match(/PID_([0-9A-F]{4})/)
          if (vidMatch && pidMatch && instanceId.startsWith('USB\\')) {
            const hasIg = devices.some(x => {
              if (!x.InstanceId) return false
              const xUpper = x.InstanceId.toUpperCase()
              return xUpper.includes(`VID_${vidMatch[1]}`) && xUpper.includes(`PID_${pidMatch[1]}`) && xUpper.includes('&IG_')
            })
            if (hasIg) return false
          }

          if (seenInstances.has(instanceId)) {
            return false
          }
          seenInstances.add(instanceId)
          return true
        })

        devices.forEach((device: any) => {
          if (!device.FriendlyName || !device.InstanceId) return
          
          const instanceId = device.InstanceId.toUpperCase()
          let vid = ''
          let pid = ''
          
          const vidMatch = instanceId.match(/VID_([0-9A-F]{4})/)
          const pidMatch = instanceId.match(/PID_([0-9A-F]{4})/)
          
          let finalGuid = ''
          let finalName = device.FriendlyName
          
          if (vidMatch && pidMatch) {
            vid = vidMatch[1].toLowerCase()
            pid = pidMatch[1].toLowerCase()
            
            const vidSwapped = vid.substring(2, 4) + vid.substring(0, 2)
            const pidSwapped = pid.substring(2, 4) + pid.substring(0, 2)
            
            const matchPrefix = `03000000${vidSwapped}0000${pidSwapped}0000`
            
            const matched = configs.find(c => c.deviceGUID?.toString().toLowerCase().startsWith(matchPrefix))
            if (matched) {
              finalGuid = matched.deviceGUID.toString()
              finalName = matched.deviceName
            } else {
              finalGuid = `03000000${vidSwapped}0000${pidSwapped}000000007200`
            }
            
            let isXbox = vid === '045e' && (pid === '028e' || pid === '02a1' || pid === '0b12' || pid === '0b20')
            if (matched || isXbox) {
              controllers.push({
                name: finalName,
                guid: finalGuid,
                buttons: 15,
                axes: 6,
                hats: 1
              })
            }
          }
        })
      }
    } catch (err) {
      console.error('Failed to detect controllers natively:', err)
    }
    return controllers
  }
}
