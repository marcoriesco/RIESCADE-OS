/**
 * Structured controller information passed from the frontend to the launcher.
 * Contains full device metadata for advanced matching and per-emulator configuration.
 */
export interface ControllerInfo {
  player: number          // 1-based player index (1-4)
  type: 'xinput' | 'dinput' | 'hid' | 'virtual' | 'unknown'
  guid: string            // SDL GUID string
  name: string            // Human-readable device name
  vendorId?: number       // USB Vendor ID (decimal)
  productId?: number      // USB Product ID (decimal)
  index: number           // 0-based device index (XInput slot or SDL joystick index)
  buttons: number         // Number of buttons
  axes: number            // Number of axes
  hats: number            // Number of hats/dpads
  instanceId?: string     // OS device instance path (PnP or HID path)
}

export interface LaunchArgs {
  system: string;
  emulator: string;
  core: string;
  rom: string;
  controllers: ControllerInfo[];
  // Legacy per-player fields (kept for backward compatibility during migration)
  p1guid?: string;
  p2guid?: string;
  p3guid?: string;
  p4guid?: string;
  p1index?: string;
  p2index?: string;
  p3index?: string;
  p4index?: string;
  p1name?: string;
  p2name?: string;
  p3name?: string;
  p4name?: string;
  p1type?: string;
  p2type?: string;
  p3type?: string;
  p4type?: string;
  p1path?: string;
  p2path?: string;
  p3path?: string;
  p4path?: string;
  rawArgs: Record<string, string>;
  flags: string[];
}
