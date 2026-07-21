import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { execFileSync, execFile, spawn } from 'child_process'
import { BrowserWindow } from 'electron'
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
  private logPath: string
  private helperExePath: string
  private inputJsonPath: string
  
  private userConfigs: Record<string, ControllerConfig> = {}
  private connectedControllers: ControllerInfo[] = []
  private inputJsonData: { version: number; inputConfigs: any[] } = { version: 1, inputConfigs: [] }
  public sdlVersion = '3.0.0'
  
  private watchProcess: any | null = null
  private stdoutBuffer = ''
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
    this.configPath = join(riescadePath, 'configs', 'controllers.json')
    this.logPath = join(riescadePath, 'logs', 'controllers.log')
    this.helperExePath = join(riescadePath, 'bin', 'sdl3_detector.exe')
    this.inputJsonPath = join(riescadePath, 'configs', 'input.json')

    this.loadConfigs()
    this.loadInputJson()
    this.compileHelper()
  }

  private loadInputJson(): void {
    if (existsSync(this.inputJsonPath)) {
      try {
        this.inputJsonData = JSON.parse(readFileSync(this.inputJsonPath, 'utf8'))
        if (!this.inputJsonData.inputConfigs) {
          this.inputJsonData.inputConfigs = []
        }
      } catch (err) {
        console.error('Failed to load input.json:', err)
      }
    }
  }

  public findInputConfig(guid: string, name: string, vid?: string, pid?: string): any | null {
    const configs = this.inputJsonData.inputConfigs || []
    
    // 1. Match by VendorID & ProductID
    if (vid && pid) {
      const match = configs.find(c => c.device && c.device.vendorId === vid && c.device.productId === pid)
      if (match) return match
    }
    
    // 2. Match by GUID
    if (guid) {
      const match = configs.find(c => c.device && c.device.deviceGUID === guid)
      if (match) return match
    }
    
    // 3. Match by name fallback
    if (name) {
      const cleanName = name.split('(')[0].trim().toLowerCase()
      const match = configs.find(c => c.device && c.device.deviceName.split('(')[0].trim().toLowerCase() === cleanName)
      if (match) return match
    }
    
    return null
  }

  private loadConfigs(): void {
    if (existsSync(this.configPath)) {
      try {
        this.userConfigs = JSON.parse(readFileSync(this.configPath, 'utf8'))
      } catch (err) {
        console.error('Failed to load controllers.json:', err)
      }
    }
  }

  public saveConfig(guid: string, config: ControllerConfig): void {
    const connectedDev = this.connectedControllers.find(c => c.guid === guid)
    const deviceName = connectedDev ? connectedDev.name : 'Unknown Device'
    const vendorId = connectedDev ? connectedDev.vendorId : undefined
    const productId = connectedDev ? connectedDev.productId : undefined
    
    const configs = this.inputJsonData.inputConfigs || []
    
    let existingIndex = -1
    if (vendorId && productId) {
      existingIndex = configs.findIndex(c => c.device && c.device.vendorId === vendorId && c.device.productId === productId)
    }
    if (existingIndex === -1 && guid) {
      existingIndex = configs.findIndex(c => c.device && c.device.deviceGUID === guid)
    }
    
    const now = new Date().toISOString()
    
    if (existingIndex !== -1) {
      const entry = configs[existingIndex]
      if (config.preferredPlayer !== undefined) {
        entry.preferredPlayer = config.preferredPlayer
        entry.lastPlayer = config.preferredPlayer
      }
      if (config.deadzone !== undefined) {
        if (!entry.analog) entry.analog = {}
        entry.analog.leftDeadzone = Math.round(config.deadzone * 100)
        entry.analog.rightDeadzone = Math.round(config.deadzone * 100)
      }
      if (config.invertLeftY !== undefined || config.invertRightY !== undefined) {
        if (!entry.analog) entry.analog = {}
        entry.analog.invertLeftY = config.invertLeftY
        entry.analog.invertRightY = config.invertRightY
      }
      entry.updatedAt = now
    } else {
      const entry: any = {
        device: {
          deviceName,
          deviceGUID: guid,
          vendorId: vendorId || '',
          productId: productId || ''
        },
        profileId: 'default-profile',
        profileVersion: 1,
        source: 'sdl-auto',
        createdAt: now,
        updatedAt: now,
        analog: {
          leftDeadzone: config.deadzone !== undefined ? Math.round(config.deadzone * 100) : 15,
          rightDeadzone: config.deadzone !== undefined ? Math.round(config.deadzone * 100) : 15,
          invertLeftY: config.invertLeftY,
          invertRightY: config.invertRightY
        },
        inputs: []
      }
      if (config.preferredPlayer !== undefined) {
        entry.preferredPlayer = config.preferredPlayer
        entry.lastPlayer = config.preferredPlayer
      }
      configs.push(entry)
    }
    
    try {
      const configDir = join(getRiescadePath(), 'configs')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      writeFileSync(this.inputJsonPath, JSON.stringify(this.inputJsonData, null, 2), 'utf8')
      this.log(`Saved configuration to input.json for GUID ${guid}`)
    } catch (err) {
      console.error('Failed to write input.json:', err)
    }
    
    this.detectAll()
  }

  public getConfigs(): Record<string, ControllerConfig> {
    const result: Record<string, ControllerConfig> = {}
    const configs = this.inputJsonData.inputConfigs || []
    
    configs.forEach(c => {
      if (c.device && c.device.deviceGUID) {
        result[c.device.deviceGUID] = {
          preferredPlayer: c.preferredPlayer,
          deadzone: c.analog ? (c.analog.leftDeadzone / 100) : 0.15,
          invertLeftY: c.analog ? c.analog.invertLeftY : false,
          invertRightY: c.analog ? c.analog.invertRightY : false
        }
      }
    })
    
    return result
  }

  public saveInputConfig(data: {
    deviceName: string
    deviceGUID: string
    vendorId?: string
    productId?: string
    profileId?: string
    inputs: any[]
    hotkey?: any
    analog?: any
  }): boolean {
    const configs = this.inputJsonData.inputConfigs || []
    
    let existingIndex = -1
    if (data.vendorId && data.productId) {
      existingIndex = configs.findIndex(c => c.device && c.device.vendorId === data.vendorId && c.device.productId === data.productId)
    }
    if (existingIndex === -1 && data.deviceGUID) {
      existingIndex = configs.findIndex(c => c.device && c.device.deviceGUID === data.deviceGUID)
    }
    
    const now = new Date().toISOString()
    const newConfig = {
      device: {
        deviceName: data.deviceName,
        deviceGUID: data.deviceGUID,
        vendorId: data.vendorId || '',
        productId: data.productId || ''
      },
      profileId: data.profileId || 'custom-profile',
      profileVersion: 1,
      source: 'wizard',
      createdAt: existingIndex !== -1 ? configs[existingIndex].createdAt : now,
      updatedAt: now,
      preferredPlayer: existingIndex !== -1 ? configs[existingIndex].preferredPlayer : undefined,
      lastPlayer: existingIndex !== -1 ? configs[existingIndex].lastPlayer : undefined,
      analog: data.analog || (existingIndex !== -1 ? configs[existingIndex].analog : { leftDeadzone: 15, rightDeadzone: 15 }),
      hotkey: data.hotkey || (existingIndex !== -1 ? configs[existingIndex].hotkey : undefined),
      inputs: data.inputs
    }
    
    if (existingIndex !== -1) {
      configs[existingIndex] = newConfig
    } else {
      configs.push(newConfig)
    }
    
    try {
      const configDir = join(getRiescadePath(), 'configs')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      writeFileSync(this.inputJsonPath, JSON.stringify(this.inputJsonData, null, 2), 'utf8')
      this.log(`Saved mapping to input.json for device: ${data.deviceName}`)
      
      this.detectAll()
      return true
    } catch (err) {
      console.error('Failed to write input.json:', err)
      return false
    }
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
    const csFile = join(binDir, 'sdl3_detector.cs')

    if (!existsSync(binDir)) {
      mkdirSync(binDir, { recursive: true })
    }

    if (existsSync(this.helperExePath)) {
      return // Already compiled
    }

    let sourceCode = ''
    if (existsSync(csFile)) {
      sourceCode = readFileSync(csFile, 'utf8')
    } else {
      sourceCode = `
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Program {
    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_GUID {
        public byte b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15;
    }

    [StructLayout(LayoutKind.Sequential, Size = 128)]
    public struct SDL_Event {
        public uint type;
    }

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern bool SDL_Init(uint flags);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void SDL_Quit();

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_GetJoysticks(out int count);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void SDL_free(IntPtr mem);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern bool SDL_IsGamepad(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_GetGamepadNameForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern ushort SDL_GetGamepadVendorForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern ushort SDL_GetGamepadProductForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern SDL_GUID SDL_GetGamepadGUIDForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SDL_GetGamepadPlayerIndexForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_OpenGamepad(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void SDL_CloseGamepad(IntPtr gamepad);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_GetGamepadSerial(IntPtr gamepad);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_GetGamepadJoystick(IntPtr gamepad);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_GetJoystickNameForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern ushort SDL_GetJoystickVendorForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern ushort SDL_GetJoystickProductForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern SDL_GUID SDL_GetJoystickGUIDForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SDL_GetJoystickPlayerIndexForID(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_OpenJoystick(uint instance_id);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void SDL_CloseJoystick(IntPtr joystick);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr SDL_GetJoystickSerial(IntPtr joystick);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SDL_GetNumJoystickButtons(IntPtr joystick);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SDL_GetNumJoystickAxes(IntPtr joystick);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SDL_GetNumJoystickHats(IntPtr joystick);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern bool SDL_WaitEventTimeout(ref SDL_Event ev, int timeoutMS);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern bool SDL_PollEvent(ref SDL_Event ev);

    private static string GetDevicesJson() {
        int count = 0;
        IntPtr ptr = SDL_GetJoysticks(out count);
        StringBuilder json = new StringBuilder();
        json.Append("[");
        
        if (ptr != IntPtr.Zero && count > 0) {
            int[] ids = new int[count];
            Marshal.Copy(ptr, ids, 0, count);

            bool first = true;
            for (int i = 0; i < count; i++) {
                uint instanceId = (uint)ids[i];
                bool isGamepad = SDL_IsGamepad(instanceId);

                string name = "Unknown Device";
                ushort vid = 0;
                ushort pid = 0;
                SDL_GUID guid = new SDL_GUID();
                int playerIndex = -1;
                string serial = "";
                int buttons = 0;
                int axes = 0;
                int hats = 0;

                if (isGamepad) {
                    IntPtr namePtr = SDL_GetGamepadNameForID(instanceId);
                    if (namePtr != IntPtr.Zero) name = Marshal.PtrToStringAnsi(namePtr);
                    vid = SDL_GetGamepadVendorForID(instanceId);
                    pid = SDL_GetGamepadProductForID(instanceId);
                    guid = SDL_GetGamepadGUIDForID(instanceId);
                    playerIndex = SDL_GetGamepadPlayerIndexForID(instanceId);

                    IntPtr gamepad = SDL_OpenGamepad(instanceId);
                    if (gamepad != IntPtr.Zero) {
                        IntPtr serialPtr = SDL_GetGamepadSerial(gamepad);
                        if (serialPtr != IntPtr.Zero) serial = Marshal.PtrToStringAnsi(serialPtr);

                        IntPtr joystick = SDL_GetGamepadJoystick(gamepad);
                        if (joystick != IntPtr.Zero) {
                            buttons = SDL_GetNumJoystickButtons(joystick);
                            axes = SDL_GetNumJoystickAxes(joystick);
                            hats = SDL_GetNumJoystickHats(joystick);
                        }
                        SDL_CloseGamepad(gamepad);
                    }
                } else {
                    IntPtr namePtr = SDL_GetJoystickNameForID(instanceId);
                    if (namePtr != IntPtr.Zero) name = Marshal.PtrToStringAnsi(namePtr);
                    vid = SDL_GetJoystickVendorForID(instanceId);
                    pid = SDL_GetJoystickProductForID(instanceId);
                    guid = SDL_GetJoystickGUIDForID(instanceId);
                    playerIndex = SDL_GetJoystickPlayerIndexForID(instanceId);

                    IntPtr joystick = SDL_OpenJoystick(instanceId);
                    if (joystick != IntPtr.Zero) {
                        IntPtr serialPtr = SDL_GetJoystickSerial(joystick);
                        if (serialPtr != IntPtr.Zero) serial = Marshal.PtrToStringAnsi(serialPtr);

                        buttons = SDL_GetNumJoystickButtons(joystick);
                        axes = SDL_GetNumJoystickAxes(joystick);
                        hats = SDL_GetNumJoystickHats(joystick);

                        SDL_CloseJoystick(joystick);
                    }
                }

                string guidStr = string.Format("{0:x2}{1:x2}{2:x2}{3:x2}{4:x2}{5:x2}{6:x2}{7:x2}{8:x2}{9:x2}{10:x2}{11:x2}{12:x2}{13:x2}{14:x2}{15:x2}",
                    guid.b0, guid.b1, guid.b2, guid.b3, guid.b4, guid.b5, guid.b6, guid.b7,
                    guid.b8, guid.b9, guid.b10, guid.b11, guid.b12, guid.b13, guid.b14, guid.b15);

                if (!first) json.Append(",");
                first = false;
                
                string escapedName = name.Replace("\\\\", "\\\\\\\\").Replace("\\\"", "\\\\\\\"");
                string escapedSerial = (serial ?? "").Replace("\\\\", "\\\\\\\\").Replace("\\\"", "\\\\\\\"");

                json.Append("{" +
                    "\\\"instanceId\\\":" + instanceId + "," +
                    "\\\"isGamepad\\\":" + (isGamepad ? "true" : "false") + "," +
                    "\\\"name\\\":\\\"" + escapedName + "\\\"," +
                    "\\\"guid\\\":\\\"" + guidStr + "\\\"," +
                    "\\\"vendorId\\\":\\\"" + vid.ToString("x4") + "\\\"," +
                    "\\\"productId\\\":\\\"" + pid.ToString("x4") + "\\\"," +
                    "\\\"playerIndex\\\":" + playerIndex + "," +
                    "\\\"serial\\\":\\\"" + escapedSerial + "\\\"," +
                    "\\\"buttons\\\":" + buttons + "," +
                    "\\\"axes\\\":" + axes + "," +
                    "\\\"hats\\\":" + hats +
                "}");
            }
            SDL_free(ptr);
        }
        json.Append("]");
        return json.ToString();
    }

    public static void Main(string[] args) {
        bool watchMode = args.Length > 0 && args[0] == "--watch";

        if (!SDL_Init(0x00002000u)) { // SDL_INIT_GAMEPAD (includes joystick)
            Console.WriteLine("[]");
            return;
        }

        try {
            if (watchMode) {
                System.Threading.Thread stdinThread = new System.Threading.Thread(() => {
                    try {
                        while (Console.ReadLine() != null) { }
                    } catch { }
                    Environment.Exit(0);
                });
                stdinThread.IsBackground = true;
                stdinThread.Start();

                Console.WriteLine(GetDevicesJson());

                SDL_Event ev = new SDL_Event();
                while (true) {
                    if (SDL_WaitEventTimeout(ref ev, 100)) {
                        // ADDED (0x605 or 0x653) and REMOVED (0x606 or 0x654)
                        if (ev.type == 0x605 || ev.type == 0x606 || ev.type == 0x653 || ev.type == 0x654) {
                            System.Threading.Thread.Sleep(150);
                            SDL_Event pendingEv = new SDL_Event();
                            while (SDL_PollEvent(ref pendingEv)) { }
                            Console.WriteLine(GetDevicesJson());
                        }
                    }
                }
            } else {
                Console.WriteLine(GetDevicesJson());
            }
        } finally {
            SDL_Quit();
        }
    }
}
`
    }
    try {
      if (!existsSync(csFile)) {
        writeFileSync(csFile, sourceCode, 'utf8')
      }
      const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
      if (existsSync(cscPath)) {
        execFileSync(cscPath, ['/out:' + this.helperExePath, '/target:exe', '/optimize', csFile])
        this.log('Successfully compiled native sdl3_detector.exe helper')
      } else {
        this.log('csc.exe not found. Native helper compilation skipped.')
      }
    } catch (err: any) {
      console.error('Failed to compile sdl3_detector.exe:', err)
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

  public async detectAll(): Promise<ControllerInfo[]> {
    if (this.isDetecting) return this.connectedControllers
    this.isDetecting = true

    let sdlPads: any[] = []
    if (existsSync(this.helperExePath)) {
      try {
        const stdout = await this.execFileAsync(this.helperExePath, [])
        const lines = stdout.split('\n')
        const jsonLine = lines.find(l => l.trim().startsWith('['))
        if (jsonLine) {
          sdlPads = JSON.parse(jsonLine.trim())
        }
      } catch (err: any) {
        console.error('Error running sdl3_detector.exe:', err)
        this.log(`Error running sdl3_detector.exe: ${err.message}`)
      }
    }

    const list: ControllerInfo[] = []

    sdlPads.forEach(pad => {
      const guid = pad.guid
      let name = pad.name
      const vid = pad.vendorId
      const pid = pad.productId
      const serial = pad.serial
      
      const config = this.findInputConfig(guid, name, vid, pid)
      if (config && config.device && config.device.deviceName) {
        name = config.device.deviceName
      }

      const virtualInfo = this.checkVirtual(name, serial || pad.instanceId.toString() || '')

      let type: ControllerInfo['type'] = pad.isGamepad ? 'dinput' : 'hid'
      const lowerName = name.toLowerCase()
      if (lowerName.includes('xbox') || lowerName.includes('xinput') || (vid === '045e' && (pid === '028e' || pid === '02a1'))) {
        type = 'xinput'
      }

      list.push({
        guid,
        name,
        vendorId: vid,
        productId: pid,
        type,
        connected: true,
        playerIndex: -1,
        xinputIndex: pad.playerIndex !== -1 ? pad.playerIndex : undefined,
        buttons: pad.buttons,
        axes: pad.axes,
        hats: pad.hats,
        instanceId: pad.instanceId.toString(),
        isVirtual: virtualInfo.isVirtual,
        virtualSource: virtualInfo.source
      })
    })

    const assigned = this.rebuildPlayerAssignments(list)

    const previousNames = this.connectedControllers.map(c => `${c.name}(P${c.playerIndex + 1})`).join(', ')
    const currentNames = assigned.map(c => `${c.name}(P${c.playerIndex + 1})`).join(', ')

    if (previousNames !== currentNames) {
      this.log(`Controllers list changed (detectAll): [${currentNames}]`)
    }

    this.connectedControllers = assigned
    this.isDetecting = false
    return this.connectedControllers
  }

  private updateDebounceTimer: NodeJS.Timeout | null = null

  private handleSdlPadsUpdate(sdlPads: any[]): void {
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer)
    }

    this.updateDebounceTimer = setTimeout(() => {
      this.processSdlPadsUpdate(sdlPads)
    }, 100)
  }

  private processSdlPadsUpdate(sdlPads: any[]): void {
    const list: ControllerInfo[] = []

    sdlPads.forEach(pad => {
      const guid = pad.guid
      let name = pad.name
      const vid = pad.vendorId
      const pid = pad.productId
      const serial = pad.serial
      
      const config = this.findInputConfig(guid, name, vid, pid)
      if (config && config.device && config.device.deviceName) {
        name = config.device.deviceName
      }

      const virtualInfo = this.checkVirtual(name, serial || pad.instanceId.toString() || '')

      let type: ControllerInfo['type'] = pad.isGamepad ? 'dinput' : 'hid'
      const lowerName = name.toLowerCase()
      if (lowerName.includes('xbox') || lowerName.includes('xinput') || (vid === '045e' && (pid === '028e' || pid === '02a1'))) {
        type = 'xinput'
      }

      list.push({
        guid,
        name,
        vendorId: vid,
        productId: pid,
        type,
        connected: true,
        playerIndex: -1,
        xinputIndex: pad.playerIndex !== -1 ? pad.playerIndex : undefined,
        buttons: pad.buttons,
        axes: pad.axes,
        hats: pad.hats,
        instanceId: pad.instanceId.toString(),
        isVirtual: virtualInfo.isVirtual,
        virtualSource: virtualInfo.source
      })
    })

    const assigned = this.rebuildPlayerAssignments(list)

    const previousNames = this.connectedControllers.map(c => `${c.guid}:${c.name}(P${c.playerIndex + 1})`).join(', ')
    const currentNames = assigned.map(c => `${c.guid}:${c.name}(P${c.playerIndex + 1})`).join(', ')

    if (previousNames !== currentNames) {
      this.log(`Controllers list changed (watch): [${currentNames}]`)
      this.connectedControllers = assigned
      if (this.onUpdateCallback) {
        this.onUpdateCallback(assigned)
      }
    } else {
      this.connectedControllers = assigned
    }
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
      const config = this.findInputConfig(c.guid, c.name, c.vendorId, c.productId)
      return {
        controller: c,
        preferred: config ? config.preferredPlayer : null
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
    if (this.watchProcess) return

    const spawnWatch = () => {
      if (!existsSync(this.helperExePath)) {
        this.log('Helper executable not found, waiting to compile or re-check')
        return
      }

      this.log('Starting sdl3_detector.exe in watch mode...')
      this.watchProcess = spawn(this.helperExePath, ['--watch'], {
        stdio: ['pipe', 'pipe', 'ignore']
      })

      this.stdoutBuffer = ''

      this.watchProcess.stdout.on('data', (data: Buffer) => {
        this.stdoutBuffer += data.toString('utf8')
        const lines = this.stdoutBuffer.split('\n')
        this.stdoutBuffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed) {
            if (trimmed.startsWith('SDL_VERSION:')) {
              const version = trimmed.split(':')[1]
              this.log(`SDL3 Runtime Version detected: ${version}`)
              this.sdlVersion = version
            } else if (trimmed.startsWith('GPAXIS:') || trimmed.startsWith('GPBUTTON:') || 
                       trimmed.startsWith('AXIS:') || trimmed.startsWith('HAT:') || 
                       trimmed.startsWith('BUTTON:')) {
              const parts = trimmed.split(':')
              const payload = {
                type: parts[0],
                instanceId: parseInt(parts[1], 10),
                index: parseInt(parts[2], 10),
                value: parseInt(parts[3], 10)
              }
              BrowserWindow.getAllWindows().forEach(w => {
                if (!w.isDestroyed()) {
                  w.webContents.send('controller-input', payload)
                }
              })
            } else if (trimmed.startsWith('[')) {
              try {
                const sdlPads = JSON.parse(trimmed)
                this.handleSdlPadsUpdate(sdlPads)
              } catch (err: any) {
                this.log(`Error parsing watch JSON line: ${err.message}. Line: ${trimmed}`)
              }
            }
          }
        }
      })

      this.watchProcess.on('close', (code: number) => {
        this.log(`sdl3_detector.exe exited with code ${code}`)
        this.watchProcess = null
        if (this.onUpdateCallback) {
          setTimeout(() => spawnWatch(), 2000)
        }
      })

      this.watchProcess.on('error', (err: any) => {
        this.log(`sdl3_detector.exe error: ${err.message}`)
      })
    }

    spawnWatch()
  }

  public stopPolling(): void {
    if (this.watchProcess) {
      try {
        this.watchProcess.kill()
      } catch (err) {
        // ignore
      }
      this.watchProcess = null
    }
    this.onUpdateCallback = null
  }

  public rumble(instanceId: string, durationMs = 1000): void {
    if (this.watchProcess && this.watchProcess.stdin) {
      try {
        this.watchProcess.stdin.write(`RUMBLE:${instanceId}:${durationMs}\n`)
        this.log(`Sent rumble command to helper: instanceId=${instanceId}, durationMs=${durationMs}`)
      } catch (err: any) {
        this.log(`Failed to write rumble to helper stdin: ${err.message}`)
      }
    } else {
      this.log(`Cannot rumble: watchProcess is not running`)
    }
  }
}
