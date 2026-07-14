import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { execFileSync, execFile } from 'child_process'
import { getRiescadePath } from '../utils/paths'

export interface ControllerInfo {
  guid: string
  name: string
  vendorId?: string
  productId?: string
  type: 'xinput' | 'dinput' | 'hid' | 'virtual' | 'unknown'
  connected: boolean
  playerIndex: number // 0-3 for P1-P4
  xinputIndex?: number // 0-3 if XInput
  buttons: number
  axes: number
  hats: number
  instanceId?: string
  isVirtual: boolean
  virtualSource?: 'steam' | 'vigem' | 'ds4windows' | 'moonlight' | 'parsec' | 'unknown'
}

export interface ControllerConfig {
  preferredPlayer?: number // 1-4
  deadzone?: number // 0.0 to 0.3
  invertLeftY?: boolean
  invertRightY?: boolean
}

export class ControllerManager {
  private static instance: ControllerManager | null = null
  private configPath: string
  private profilesPath: string
  private logPath: string
  private helperExePath: string
  
  private profiles: Record<string, any> = {}
  private userConfigs: Record<string, ControllerConfig> = {}
  private connectedControllers: ControllerInfo[] = []
  
  private pollingInterval: NodeJS.Timeout | null = null
  private onUpdateCallback: ((controllers: ControllerInfo[]) => void) | null = null
  private isDetecting = false

  public static getInstance(): ControllerManager {
    if (!ControllerManager.instance) {
      ControllerManager.instance = new ControllerManager()
    }
    return ControllerManager.instance
  }

  private constructor() {
    const riescadePath = getRiescadePath()
    this.configPath = join(riescadePath, 'configs', 'controllerConfigs.json')
    this.profilesPath = join(riescadePath, 'configs', 'controllers.json')
    this.logPath = join(riescadePath, 'logs', 'controllers.log')
    this.helperExePath = join(riescadePath, 'bin', 'xinput_detector.exe')

    this.loadProfiles()
    this.loadConfigs()
    this.compileHelper()
  }

  private loadProfiles(): void {
    if (existsSync(this.profilesPath)) {
      try {
        this.profiles = JSON.parse(readFileSync(this.profilesPath, 'utf8'))
      } catch (err) {
        console.error('Failed to load controllers.json:', err)
      }
    }
  }

  private loadConfigs(): void {
    if (existsSync(this.configPath)) {
      try {
        this.userConfigs = JSON.parse(readFileSync(this.configPath, 'utf8'))
      } catch (err) {
        console.error('Failed to load controllerConfigs.json:', err)
      }
    }
  }

  public saveConfig(guid: string, config: ControllerConfig): void {
    this.userConfigs[guid] = {
      ...(this.userConfigs[guid] || {}),
      ...config
    }
    try {
      const configDir = join(getRiescadePath(), 'configs')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      writeFileSync(this.configPath, JSON.stringify(this.userConfigs, null, 2), 'utf8')
      this.log(`Saved config for GUID ${guid}: ${JSON.stringify(config)}`)
    } catch (err) {
      console.error('Failed to write controllerConfigs.json:', err)
    }
    // Trigger update asynchronously to apply player slots immediately
    this.detectAll()
  }

  public getConfigs(): Record<string, ControllerConfig> {
    return this.userConfigs
  }

  private log(message: string): void {
    const logDir = join(getRiescadePath(), 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
    try {
      appendFileSync(this.logPath, `[${timestamp}] ${message}\n`, 'utf8')
    } catch (e) {
      console.error('Failed to write to controllers.log:', e)
    }
  }

  private compileHelper(): void {
    const riescadePath = getRiescadePath()
    const binDir = join(riescadePath, 'bin')
    const csFile = join(binDir, 'xinput_detector.cs')

    if (!existsSync(binDir)) {
      mkdirSync(binDir, { recursive: true })
    }

    if (existsSync(this.helperExePath)) {
      return // Already compiled
    }

    const sourceCode = `
using System;
using System.Runtime.InteropServices;

public class Program {
    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_GAMEPAD {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_STATE {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_CAPABILITIES {
        public byte Type;
        public byte SubType;
        public ushort Flags;
        public XINPUT_GAMEPAD Gamepad;
        public ushort Vibration;
    }

    [DllImport("xinput1_4.dll")]
    public static extern uint XInputGetState(uint dwUserIndex, ref XINPUT_STATE pState);

    [DllImport("xinput1_4.dll")]
    public static extern uint XInputGetCapabilities(uint dwUserIndex, uint dwFlags, ref XINPUT_CAPABILITIES pCapabilities);

    public static void Main() {
        Console.Write("[");
        bool first = true;
        for (uint i = 0; i < 4; i++) {
            XINPUT_STATE state = new XINPUT_STATE();
            uint result = XInputGetState(i, ref state);
            if (result == 0) {
                XINPUT_CAPABILITIES caps = new XINPUT_CAPABILITIES();
                XInputGetCapabilities(i, 1, ref caps);
                if (!first) Console.Write(",");
                first = false;
                Console.Write("{" +
                    "\\\"index\\\":" + i + "," +
                    "\\\"connected\\\":true," +
                    "\\\"subType\\\":" + caps.SubType + "," +
                    "\\\"buttons\\\":" + state.Gamepad.wButtons + "," +
                    "\\\"leftTrigger\\\":" + state.Gamepad.bLeftTrigger + "," +
                    "\\\"rightTrigger\\\":" + state.Gamepad.bRightTrigger + "," +
                    "\\\"thumbLX\\\":" + state.Gamepad.sThumbLX + "," +
                    "\\\"thumbLY\\\":" + state.Gamepad.sThumbLY + "," +
                    "\\\"thumbRX\\\":" + state.Gamepad.sThumbRX + "," +
                    "\\\"thumbRY\\\":" + state.Gamepad.sThumbRY +
                "}");
            }
        }
        Console.Write("]");
    }
}
`
    try {
      writeFileSync(csFile, sourceCode, 'utf8')
      const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      if (existsSync(cscPath)) {
        execFileSync(cscPath, ['/out:' + this.helperExePath, '/target:exe', '/optimize', csFile])
        this.log('Successfully compiled native xinput_detector.exe helper')
      } else {
        this.log('csc.exe not found. Native helper compilation skipped.')
      }
    } catch (err: any) {
      console.error('Failed to compile xinput_detector.exe:', err)
      this.log(`Compilation error: ${err.message}`)
    }
  }

  private execFileAsync(file: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
      execFile(file, args, { encoding: 'utf8' }, (err, stdout) => {
        if (err) resolve('')
        else resolve(stdout || '')
      })
    })
  }

  private runPowerShellAsync(command: string): Promise<string> {
    return new Promise((resolve) => {
      execFile('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' }, (err, stdout) => {
        if (err) resolve('')
        else resolve(stdout || '')
      })
    })
  }

  public async detectAll(): Promise<ControllerInfo[]> {
    if (this.isDetecting) return this.connectedControllers
    this.isDetecting = true

    const list: ControllerInfo[] = []

    // 1. Get XInput controllers via compiled executable (Asynchronous, no event loop blocking!)
    let xinputPads: any[] = []
    if (existsSync(this.helperExePath)) {
      try {
        const stdout = await this.execFileAsync(this.helperExePath, [])
        const trimmed = stdout.trim()
        if (trimmed) {
          xinputPads = JSON.parse(trimmed)
        }
      } catch (err: any) {
        console.error('Error running xinput_detector.exe:', err)
      }
    }

    // 2. Enumerate HID Devices via PowerShell (Asynchronous, no event loop blocking!)
    let hidList: any[] = []
    try {
      const psCommand = `Get-PnpDevice -Status OK | Where-Object { ($_.Class -eq 'HIDClass' -or $_.Class -eq 'XnaComposite' -or $_.Class -eq 'Xboxgip' -or $_.Class -eq 'XboxComposite') -and $_.InstanceId -like "*VID_*" } | Select-Object FriendlyName, InstanceId | ConvertTo-Json`
      const stdout = await this.runPowerShellAsync(psCommand)
      const trimmed = stdout.trim()
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        hidList = Array.isArray(parsed) ? parsed : [parsed]
      }
    } catch (err: any) {
      console.error('Error listing HID devices:', err)
    }

    // Filter game controller candidates
    const rawCandidates = hidList.filter(d => {
      const name = (d.FriendlyName || '').toLowerCase()
      const inst = (d.InstanceId || '').toLowerCase()
      if (inst.includes('root\\system')) return false
      
      return (
        name.includes('gamepad') ||
        name.includes('controller') ||
        name.includes('joystick') ||
        name.includes('controle') ||
        name.includes('xbox') ||
        name.includes('playstation') ||
        name.includes('dualshock') ||
        name.includes('dualsense') ||
        name.includes('8bitdo') ||
        inst.includes('ig_') ||
        inst.includes('xusb')
      )
    })

    // Process XInput pads
    xinputPads.forEach(pad => {
      const matchingHid = rawCandidates.find(d => {
        const inst = (d.InstanceId || '').toUpperCase()
        const name = (d.FriendlyName || '').toLowerCase()
        return (inst.includes('VID_045E') && inst.includes('PID_028E')) || inst.includes('XUSB') || name.includes('xbox') || name.includes('xinput')
      })

      let guid = `xinput-${pad.index}`
      let name = `Xbox Controller (XInput P${pad.index + 1})`
      let vid = '045e'
      let pid = '028e'
      let instanceId = matchingHid ? matchingHid.InstanceId : undefined

      if (matchingHid) {
        const vidMatch = matchingHid.InstanceId.match(/VID_([0-9A-F]{4})/i)
        const pidMatch = matchingHid.InstanceId.match(/PID_([0-9A-F]{4})/i)
        if (vidMatch && pidMatch) {
          vid = vidMatch[1].toLowerCase()
          pid = pidMatch[1].toLowerCase()
          const vSwap = vid.substring(2, 4) + vid.substring(0, 2)
          const pSwap = pid.substring(2, 4) + pid.substring(0, 2)
          guid = `03000000${vSwap}0000${pSwap}000000007200`
          name = matchingHid.FriendlyName
        }
      }

      const profile = this.findProfile(guid, name)
      if (profile) {
        name = profile.name
      }

      const virtualInfo = this.checkVirtual(name, instanceId || '')

      list.push({
        guid,
        name,
        vendorId: vid,
        productId: pid,
        type: 'xinput',
        connected: true,
        playerIndex: -1,
        xinputIndex: pad.index,
        buttons: profile ? profile.buttons : 15,
        axes: profile ? profile.axes : 6,
        hats: profile ? profile.hats : 1,
        instanceId,
        isVirtual: virtualInfo.isVirtual,
        virtualSource: virtualInfo.source
      })
    })

    // Process other DirectInput / Bluetooth controllers
    rawCandidates.forEach(hid => {
      if (list.some(c => c.instanceId === hid.InstanceId)) {
        return
      }

      const vidMatch = hid.InstanceId.match(/VID_([0-9A-F]{4})/i)
      const pidMatch = hid.InstanceId.match(/PID_([0-9A-F]{4})/i)
      if (!vidMatch || !pidMatch) return

      const vid = vidMatch[1].toLowerCase()
      const pid = pidMatch[1].toLowerCase()

      if (vid === '045e' && (pid === '028e' || pid === '02a1')) {
        return
      }

      const vSwap = vid.substring(2, 4) + vid.substring(0, 2)
      const pSwap = pid.substring(2, 4) + pid.substring(0, 2)
      const guid = `03000000${vSwap}0000${pSwap}000000007200`
      let name = hid.FriendlyName

      const profile = this.findProfile(guid, name)
      if (profile) {
        name = profile.name
      }

      const virtualInfo = this.checkVirtual(name, hid.InstanceId)

      list.push({
        guid,
        name,
        vendorId: vid,
        productId: pid,
        type: profile && profile.type ? profile.type : 'dinput',
        connected: true,
        playerIndex: -1,
        buttons: profile ? profile.buttons : 16,
        axes: profile ? profile.axes : 6,
        hats: profile ? profile.hats : 1,
        instanceId: hid.InstanceId,
        isVirtual: virtualInfo.isVirtual,
        virtualSource: virtualInfo.source
      })
    })

    // Assign player slots
    const assigned = this.rebuildPlayerAssignments(list)

    // Compare with previous state to log changes (ONLY logs on actual hardware change!)
    const previousNames = this.connectedControllers.map(c => `${c.name}(P${c.playerIndex + 1})`).join(', ')
    const currentNames = assigned.map(c => `${c.name}(P${c.playerIndex + 1})`).join(', ')

    if (previousNames !== currentNames) {
      this.log(`Controllers list changed: [${currentNames}]`)
    }

    this.connectedControllers = assigned
    this.isDetecting = false
    return this.connectedControllers
  }

  private findProfile(guid: string, name: string): any | null {
    if (this.profiles[guid]) {
      return this.profiles[guid]
    }
    for (const [pGuid, pData] of Object.entries(this.profiles)) {
      if (pData.aliases && pData.aliases.some((alias: string) => alias.toLowerCase() === name.toLowerCase())) {
        return pData
      }
    }
    return null
  }

  private checkVirtual(name: string, instanceId: string): { isVirtual: boolean, source: ControllerInfo['virtualSource'] } {
    const cleanName = name.toLowerCase()
    const cleanInst = instanceId.toLowerCase()

    if (cleanName.includes('steam') || cleanInst.includes('steam')) {
      return { isVirtual: true, source: 'steam' }
    }
    if (cleanName.includes('vigem') || cleanInst.includes('vigem') || cleanInst.includes('root\\system')) {
      return { isVirtual: true, source: 'vigem' }
    }
    if (cleanName.includes('ds4windows') || cleanName.includes('dualshock 4 virtual')) {
      return { isVirtual: true, source: 'ds4windows' }
    }
    if (cleanName.includes('moonlight')) {
      return { isVirtual: true, source: 'moonlight' }
    }
    if (cleanName.includes('parsec')) {
      return { isVirtual: true, source: 'parsec' }
    }
    if (cleanName.includes('virtual') || cleanInst.includes('virtual')) {
      return { isVirtual: true, source: 'unknown' }
    }

    return { isVirtual: false }
  }

  private rebuildPlayerAssignments(connected: ControllerInfo[]): ControllerInfo[] {
    const assigned = connected.map(c => {
      const config = this.userConfigs[c.guid] || {}
      return {
        controller: c,
        preferred: config.preferredPlayer || null
      }
    })

    const slots: (ControllerInfo | null)[] = [null, null, null, null]

    assigned.forEach(item => {
      if (item.preferred !== null) {
        const preferredIndex = item.preferred - 1
        if (preferredIndex >= 0 && preferredIndex < 4 && slots[preferredIndex] === null) {
          slots[preferredIndex] = item.controller
          item.controller.playerIndex = preferredIndex
        }
      }
    })

    assigned.forEach(item => {
      if (item.controller.playerIndex === -1) {
        const emptyIdx = slots.indexOf(null)
        if (emptyIdx !== -1) {
          slots[emptyIdx] = item.controller
          item.controller.playerIndex = emptyIdx
        } else {
          item.controller.playerIndex = slots.length
          slots.push(item.controller)
        }
      }
    })

    const activeOnly = slots.filter(c => c !== null) as ControllerInfo[]
    activeOnly.forEach((c, idx) => {
      c.playerIndex = idx
    })

    return activeOnly
  }

  public getConnected(): ControllerInfo[] {
    return this.connectedControllers
  }

  public getState(xinputIndex: number): any {
    return { connected: false }
  }

  public startPolling(onUpdate: (controllers: ControllerInfo[]) => void, intervalMs = 2000): void {
    this.onUpdateCallback = onUpdate
    if (this.pollingInterval) return

    this.pollingInterval = setInterval(async () => {
      if (this.isDetecting) return
      
      const previousStr = JSON.stringify(this.connectedControllers)
      const current = await this.detectAll()
      const currentStr = JSON.stringify(current)

      if (previousStr !== currentStr && this.onUpdateCallback) {
        this.onUpdateCallback(current)
      }
    }, intervalMs)

    // Run first scan immediately
    this.detectAll()
  }

  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    this.onUpdateCallback = null
  }
}
