import { exec } from 'child_process'
import { join, resolve, dirname } from 'path'
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { Game, System } from '../../shared/types'
import { getRetroBatPath, getRiescadePath, getLogsPath } from '../utils/paths'
import { SettingsParser } from '../parsers/SettingsParser'

interface ControllerInfo {
  name: string
  guid: string
  path?: string
  buttons: number
  axes: number
  hats: number
}

function writeLog(msg: string): void {
  try {
    const logDir = getLogsPath()
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    const logPath = join(logDir, 'debug_launcher.log')
    const timestamp = new Date().toISOString()
    appendFileSync(logPath, `[${timestamp}] ${msg}\n`, 'utf-8')
  } catch (e) {
    console.error('[LauncherService] Failed to write to debug_launcher.log:', e)
  }
}


export class LauncherService {
  public launch(game: Game, system: System, activeControllers: ControllerInfo[] = [], saveStateSlot?: number): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const retroBatPath = getRetroBatPath()
      const launcherPath = join(retroBatPath, '.emulatorlauncher', 'emulatorLauncher.exe')
      
      // Resolve Rom Path relative to system.path instead of hardcoding roms directory
      const romPath = resolve(system.path, game.path)

      writeLog(`--------------------------------------------------------------------------------`)
      writeLog(`Starting launch request via emulatorLauncher: Game="${game.name}", System="${system.name}"`)
      writeLog(`ROM Path: "${romPath}"`)

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
              writeLog(`Launching menu shortcut command: ${command}`)
              exec(command, { cwd: dirname(exePath) }, (error) => {
                if (error) {
                  writeLog(`Menu shortcut exited with error: ${error.message}`)
                  console.warn('Menu shortcut exited with code:', error.code)
                } else {
                  writeLog(`Menu shortcut command completed successfully`)
                }
                resolvePromise()
              })
              return
            }
          }
        } catch (err) {
          writeLog(`Failed to read or launch .menu file: ${err}`)
          console.error('Failed to read or launch .menu file:', err)
        }
      }
      
      // Create a temporary gameinfo XML as ES does
      const tempDir = join(tmpdir(), 'riescade.tmp')
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
      
      const gameXmlPath = join(tempDir, 'game.xml')
      const gameXmlContent = `<?xml version="1.0"?>
<gameList>
  <game>
    <path>${game.path}</path>
    <name>${game.name}</name>
    <desc>${game.desc || ''}</desc>
    <image>${game.image || ''}</image>
    <video>${game.video || ''}</video>
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

      let controllerArgs: string[] = []
      
      if (activeControllers.length > 0) {
        // Try to get a list of HID device IDs to match paths
        let devicePaths: string[] = []
        try {
          // Broaden search to find any device with VID/PID
          const stdout = require('child_process').execSync('powershell -Command "Get-PnpDevice -Status \'OK\' | Where-Object { $_.InstanceId -like \'*VID_*\' -and $_.InstanceId -like \'*PID_*\' } | Select-Object -ExpandProperty InstanceId"', { encoding: 'utf8' })
          devicePaths = stdout.split('\n').map(s => s.trim()).filter(s => s.length > 0)
        } catch (e) {
          console.error('Failed to get device paths via PowerShell', e)
        }

        activeControllers.forEach((controller, index) => {
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

      const args = [
        '-gameinfo', `"${gameXmlPath}"`,
        ...controllerArgs,
        '-system', system.name,
        '-emulator', emulator,
        '-core', core,
        ...saveStateArgs,
        '-rom', `"${romPath}"`
      ]

      const command = `"${launcherPath}" ${args.join(' ')}`
      console.log(`Launching: ${command}`)
      writeLog(`Resolved emulator: "${emulator}", core: "${core}"`)
      writeLog(`Executing command line: ${command}`)

      exec(command, { cwd: retroBatPath }, (error) => {
        if (error) {
          writeLog(`Launcher exited with error: ${error.message} (code: ${error.code})`)
          console.warn('Launcher exited with code:', error.code)
        } else {
          writeLog(`Launcher exited successfully (code 0)`)
        }
        resolvePromise()
      })
    })
  }
}
