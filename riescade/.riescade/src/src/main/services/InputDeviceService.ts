import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getRiescadePath } from '../utils/paths';

const execAsync = promisify(exec);

export interface PointingDevice {
  id: string;
  name: string;
  friendlyName: string;
  manufacturer: string;
  instanceId: string;
  /** Exact Raw Input device path returned by GetRawInputDeviceInfo. */
  devicePath?: string;
  hardwareIds: string[];
  type: 'sinden' | 'gun4ir' | 'aimtrak' | 'mouse' | 'keyboard' | 'touchscreen' | 'other';
  capabilities: {
    mouse: boolean;
    lightgun: boolean;
    keyboard: boolean;
    touchscreen: boolean;
  };
  playerHint?: 1 | 2;
}

export interface InputDeviceScanResult {
  lastScan: number;
  devices: PointingDevice[];
}

let cachedScanResult: InputDeviceScanResult | null = null;

interface RawInputDevice {
  devicePath: string;
  deviceType: 'mouse' | 'keyboard';
}

async function scanRawInputDevices(): Promise<RawInputDevice[]> {
  const script = String.raw`
$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class RiescadeRawInput {
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICELIST {
        public IntPtr hDevice;
        public uint dwType;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputDeviceList(
        [In, Out] RAWINPUTDEVICELIST[] devices,
        ref uint count,
        uint size);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetRawInputDeviceInfo(
        IntPtr device,
        uint command,
        StringBuilder data,
        ref uint size);

    public static string[] GetDevicePaths() {
        uint count = 0;
        uint structSize = (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
        if (GetRawInputDeviceList(null, ref count, structSize) != 0 || count == 0)
            return new string[0];

        var devices = new RAWINPUTDEVICELIST[count];
        if (GetRawInputDeviceList(devices, ref count, structSize) == uint.MaxValue)
            return new string[0];

        var result = new List<string>();
        for (int i = 0; i < count; i++) {
            if (devices[i].dwType != 0 && devices[i].dwType != 1) continue;
            uint chars = 0;
            GetRawInputDeviceInfo(devices[i].hDevice, 0x20000007, null, ref chars);
            if (chars == 0) continue;
            var name = new StringBuilder((int)chars + 1);
            if (GetRawInputDeviceInfo(devices[i].hDevice, 0x20000007, name, ref chars) > 0)
                result.Add(devices[i].dwType.ToString() + "|" + name.ToString());
        }
        return result.ToArray();
    }
}
'@
Add-Type -TypeDefinition $source
[RiescadeRawInput]::GetDevicePaths() | ForEach-Object {
  $parts = $_ -split '\|', 2
  [PSCustomObject]@{
    deviceType = $(if ($parts[0] -eq '1') { 'keyboard' } else { 'mouse' })
    devicePath = $parts[1]
  }
} | ConvertTo-Json -Compress
`;

  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: 10000, encoding: 'utf8' }
    );
    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim());
    return (Array.isArray(parsed) ? parsed : [parsed])
      .filter((item: any) => item?.devicePath)
      .map((item: any) => ({
        devicePath: String(item.devicePath),
        deviceType: item.deviceType === 'keyboard' ? 'keyboard' : 'mouse'
      }));
  } catch (e) {
    console.error('[InputDeviceService] Failed to enumerate Raw Input devices:', e);
    return [];
  }
}

function rawPathMatchKey(value: string): string {
  return value
    .replace(/^\\\\\?\\/, '')
    .replace(/[\\#]/g, '\\')
    .replace(/\{[^}]+\}$/g, '')
    .toUpperCase();
}

function sanitizeName(str: string): string {
  if (!str) return '';
  // Fix common PowerShell UTF-8 replacement char issues for Portuguese/Spanish Windows names
  let clean = str.replace(/\uFFFD/g, 'í').replace(/\?/g, (match, offset, string) => {
    // If 'Mouse compat?vel' -> replace ? with í
    if (string.toLowerCase().includes('compat') && offset > 0) return 'í';
    return match;
  });
  if (clean.includes('Mouse compat') && !clean.includes('compatível')) {
    clean = clean.replace(/compat[^\s]*vel/i, 'compatível');
  }
  return clean.trim();
}

export class InputDeviceService {
  public static async scanPointingDevices(forceRefresh: boolean = false): Promise<InputDeviceScanResult> {
    if (!forceRefresh && cachedScanResult && (Date.now() - cachedScanResult.lastScan < 60000)) {
      return cachedScanResult;
    }

    const devices: PointingDevice[] = [];

    // Always include built-in fallback device
    devices.push({
      id: 'windows_mouse_cursor',
      name: 'Windows Mouse Cursor',
      friendlyName: 'Windows Mouse Cursor (Cursor Padrão)',
      manufacturer: 'Microsoft',
      instanceId: 'BUILTIN_WINDOWS_CURSOR',
      hardwareIds: [],
      type: 'mouse',
      capabilities: { mouse: true, lightgun: true, keyboard: false, touchscreen: false }
    });

    try {
      const rawDevices = await scanRawInputDevices();
      const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; OutputEncoding = [System.Text.Encoding]::UTF8; Get-PnpDevice -PresentOnly | Where-Object { $_.Class -match 'Mouse|Keyboard|HIDClass|Input' -or $_.FriendlyName -match 'Lightgun|Sinden|Gun4IR|AimTrak|Mouse|Keyboard|Teclado|Touch' } | Select-Object FriendlyName, Name, InstanceId, Manufacturer, Class, HardwareID | ConvertTo-Json -Compress"`;
      const { stdout } = await execAsync(psCommand, { timeout: 10000, encoding: 'utf8' });

      if (stdout && stdout.trim()) {
        const rawList = JSON.parse(stdout.trim());
        const items = Array.isArray(rawList) ? rawList : [rawList];

        const seenIds = new Set<string>();

        for (const item of items) {
          const rawName = String(item.FriendlyName || item.Name || '').trim();
          const friendlyName = sanitizeName(rawName);
          const instanceId = String(item.InstanceId || '').trim();
          const manufacturer = sanitizeName(String(item.Manufacturer || ''));
          const hwIds: string[] = Array.isArray(item.HardwareID) ? item.HardwareID.map(String) : [String(item.HardwareID || '')];
          const hwIdStr = hwIds.join(' ').toUpperCase();
          const nameUpper = (friendlyName + ' ' + manufacturer + ' ' + hwIdStr).toUpperCase();

          if (!friendlyName || seenIds.has(instanceId)) continue;

          // Filter out system hubs / root enumerators
          if (nameUpper.includes('ROOT_HUB') || nameUpper.includes('VIRTUAL BUS') || nameUpper.includes('SOFTWARE DEVICE') || nameUpper.includes('CONSUMER CONTROL')) {
            continue;
          }

          let type: PointingDevice['type'] = 'mouse';
          const capabilities = { mouse: false, lightgun: false, keyboard: false, touchscreen: false };

          if (nameUpper.includes('KEYBOARD') || nameUpper.includes('TECLADO') || String(item.Class || '').toLowerCase().includes('keyboard')) {
            type = 'keyboard';
            capabilities.keyboard = true;
          } else if (nameUpper.includes('SINDEN') || hwIdStr.includes('VID_16C0')) {
            type = 'sinden';
            capabilities.lightgun = true;
            capabilities.mouse = true;
          } else if (nameUpper.includes('GUN4IR') || (nameUpper.includes('GUN') && nameUpper.includes('IR'))) {
            type = 'gun4ir';
            capabilities.lightgun = true;
            capabilities.mouse = true;
          } else if (nameUpper.includes('AIMTRAK') || hwIdStr.includes('VID_D209')) {
            type = 'aimtrak';
            capabilities.lightgun = true;
            capabilities.mouse = true;
          } else if (nameUpper.includes('TOUCH') || nameUpper.includes('DIGITIZER') || nameUpper.includes('TABLET')) {
            type = 'touchscreen';
            capabilities.touchscreen = true;
          } else if (nameUpper.includes('MOUSE') || String(item.Class || '').toLowerCase().includes('mouse')) {
            type = 'mouse';
            capabilities.mouse = true;
          } else if (nameUpper.includes('LIGHTGUN') || nameUpper.includes('LIGHT GUN')) {
            type = 'other';
            capabilities.lightgun = true;
          } else {
            capabilities.mouse = true;
          }

          if (capabilities.mouse || capabilities.lightgun || capabilities.keyboard || capabilities.touchscreen) {
            const instanceKey = rawPathMatchKey(instanceId);
            const rawMatch = rawDevices.find(raw =>
              raw.deviceType === (type === 'keyboard' ? 'keyboard' : 'mouse') &&
              rawPathMatchKey(raw.devicePath).includes(instanceKey)
            );
            seenIds.add(instanceId);
            devices.push({
              id: instanceId || friendlyName,
              name: friendlyName,
              friendlyName: friendlyName,
              manufacturer: manufacturer || 'Desconhecido',
              instanceId: instanceId,
              devicePath: rawMatch?.devicePath,
              hardwareIds: hwIds,
              type,
              capabilities
            });
          }
        }

        // Keep Raw Input devices that Windows did not expose through the PnP
        // query. They remain selectable and, crucially, retain their exact path.
        for (const raw of rawDevices) {
          if (devices.some(device => device.devicePath === raw.devicePath)) continue;
          const shortName = raw.devicePath
            .replace(/^\\\\\?\\/, '')
            .split('#')
            .slice(0, 2)
            .join(' ');
          devices.push({
            id: raw.devicePath,
            name: shortName || `Raw Input ${raw.deviceType}`,
            friendlyName: shortName || `Raw Input ${raw.deviceType}`,
            manufacturer: 'Raw Input',
            instanceId: raw.devicePath,
            devicePath: raw.devicePath,
            hardwareIds: [],
            type: raw.deviceType,
            capabilities: raw.deviceType === 'keyboard'
              ? { mouse: false, lightgun: false, keyboard: true, touchscreen: false }
              : { mouse: true, lightgun: true, keyboard: false, touchscreen: false }
          });
        }
      }
    } catch (e) {
      console.error('[InputDeviceService] Failed to scan PnP pointing devices:', e);
    }

    cachedScanResult = {
      lastScan: Date.now(),
      devices
    };

    // The launcher is a separate process. Persist a small Raw Input inventory
    // so it can auto-select a keyboard without needing the settings screen open.
    try {
      const inventoryPath = join(getRiescadePath(), 'configs', 'input-devices.json');
      writeFileSync(inventoryPath, JSON.stringify({
        updatedAt: cachedScanResult.lastScan,
        devices: devices
          .filter(device => device.devicePath)
          .map(device => ({
            type: device.type,
            name: device.friendlyName || device.name,
            devicePath: device.devicePath
          }))
      }, null, 2), 'utf8');
    } catch (e) {
      console.error('[InputDeviceService] Failed to persist Raw Input inventory:', e);
    }

    return cachedScanResult;
  }
}
