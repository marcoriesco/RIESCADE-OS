import { exec } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { LibraryService } from './LibraryService'

export class SystemService {
  private libraryService: LibraryService

  constructor(libraryService: LibraryService) {
    this.libraryService = libraryService
  }

  public executeCommand(command: string): void {
    console.log(`Executing system command: ${command}`)
    
    const isWindows = process.platform === 'win32'
    
    switch (command) {
      case 'reboot':
        this.run(isWindows ? 'shutdown /r /t 0' : 'reboot')
        break
      case 'shutdown':
        this.run(isWindows ? 'shutdown /s /t 0' : 'shutdown -h now')
        break
      case 'fast-shutdown':
        this.run(isWindows ? 'shutdown /s /t 0' : 'shutdown -h now')
        break
      case 'restart-es':
      case 'restart-frontend':
        app.relaunch()
        app.exit(0)
        break
      case 'reload-frontend':
        try {
          LibraryService.clearCache()
        } catch (e) {}
        BrowserWindow.getAllWindows().forEach(w => w.reload())
        break
      case 'exit-frontend':
        app.quit()
        break
      case 'update-gamelists':
        try {
          LibraryService.clearCache()
          this.libraryService.preloadAll(true).then(() => {
            BrowserWindow.getAllWindows().forEach(w => w.reload())
          }).catch(err => {
            console.error('Failed to update gamelists:', err)
            BrowserWindow.getAllWindows().forEach(w => w.reload())
          })
        } catch (e) {
          console.error(e)
          BrowserWindow.getAllWindows().forEach(w => w.reload())
        }
        break
      case 'configure-input':
        console.log('Open input configuration UI')
        break
      case 'pair-bluetooth-auto':
        console.log('Trigger auto bluetooth pairing')
        break
      case 'pair-bluetooth-manual':
        console.log('Trigger manual bluetooth pairing')
        if (isWindows) this.run('start ms-settings:bluetooth')
        break
      case 'list-bluetooth-devices':
        console.log('Show bluetooth devices list')
        break
      default:
        console.warn(`Unknown command: ${command}`)
    }
  }

  private run(cmd: string): void {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command ${cmd}:`, error)
        return
      }
      if (stdout) console.log(`STDOUT: ${stdout}`)
      if (stderr) console.error(`STDERR: ${stderr}`)
    })
  }
}
