using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class Program {
    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_GUID {
        public byte b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_JoyAxisEvent {
        public uint type;
        public uint reserved;
        public ulong timestamp;
        public uint which;
        public byte axis;
        public byte padding1;
        public byte padding2;
        public byte padding3;
        public short value;
        public ushort padding4;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_JoyBallEvent {
        public uint type;
        public uint reserved;
        public ulong timestamp;
        public uint which;
        public byte ball;
        public byte padding1;
        public byte padding2;
        public byte padding3;
        public short xrel;
        public short yrel;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_JoyHatEvent {
        public uint type;
        public uint reserved;
        public ulong timestamp;
        public uint which;
        public byte hat;
        public byte value;
        public byte padding1;
        public byte padding2;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_JoyButtonEvent {
        public uint type;
        public uint reserved;
        public ulong timestamp;
        public uint which;
        public byte button;
        public byte down;
        public byte padding1;
        public byte padding2;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_GamepadAxisEvent {
        public uint type;
        public uint reserved;
        public ulong timestamp;
        public uint which;
        public byte axis;
        public byte padding1;
        public byte padding2;
        public byte padding3;
        public short value;
        public ushort padding4;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SDL_GamepadButtonEvent {
        public uint type;
        public uint reserved;
        public ulong timestamp;
        public uint which;
        public byte button;
        public byte down;
        public byte padding1;
        public byte padding2;
    }

    [StructLayout(LayoutKind.Explicit, Size = 128)]
    public struct SDL_Event {
        [FieldOffset(0)] public uint type;
        [FieldOffset(0)] public SDL_JoyAxisEvent jaxis;
        [FieldOffset(0)] public SDL_JoyBallEvent jball;
        [FieldOffset(0)] public SDL_JoyHatEvent jhat;
        [FieldOffset(0)] public SDL_JoyButtonEvent jbutton;
        [FieldOffset(0)] public SDL_GamepadAxisEvent gaxis;
        [FieldOffset(0)] public SDL_GamepadButtonEvent gbutton;
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

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern bool SDL_RumbleGamepad(IntPtr gamepad, ushort low_frequency_rumble, ushort high_frequency_rumble, uint duration_ms);

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SDL_GetVersion();

    private static Dictionary<uint, IntPtr> openGamepads = new Dictionary<uint, IntPtr>();
    private static Dictionary<uint, IntPtr> openJoysticks = new Dictionary<uint, IntPtr>();
    private static Dictionary<string, int> lastAxisValues = new Dictionary<string, int>();
    private const int AXIS_THRESHOLD = 1200;

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
                
                string escapedName = name.Replace("\\", "\\\\").Replace("\"", "\\\"");
                string escapedSerial = (serial ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");

                json.Append("{" +
                    "\"instanceId\":" + instanceId + "," +
                    "\"isGamepad\":" + (isGamepad ? "true" : "false") + "," +
                    "\"name\":\"" + escapedName + "\"," +
                    "\"guid\":\"" + guidStr + "\"," +
                    "\"vendorId\":\"" + vid.ToString("x4") + "\"," +
                    "\"productId\":\"" + pid.ToString("x4") + "\"," +
                    "\"playerIndex\":" + playerIndex + "," +
                    "\"serial\":\"" + escapedSerial + "\"," +
                    "\"buttons\":" + buttons + "," +
                    "\"axes\":" + axes + "," +
                    "\"hats\":" + hats +
                "}");
            }
            SDL_free(ptr);
        }
        json.Append("]");
        return json.ToString();
    }

    private static void OpenDevice(uint instanceId) {
        if (SDL_IsGamepad(instanceId)) {
            if (!openGamepads.ContainsKey(instanceId)) {
                IntPtr gp = SDL_OpenGamepad(instanceId);
                if (gp != IntPtr.Zero) {
                    openGamepads[instanceId] = gp;
                }
            }
        } else {
            if (!openJoysticks.ContainsKey(instanceId)) {
                IntPtr joy = SDL_OpenJoystick(instanceId);
                if (joy != IntPtr.Zero) {
                    openJoysticks[instanceId] = joy;
                }
            }
        }
    }

    private static void CloseDevice(uint instanceId) {
        if (openGamepads.ContainsKey(instanceId)) {
            SDL_CloseGamepad(openGamepads[instanceId]);
            openGamepads.Remove(instanceId);
        }
        if (openJoysticks.ContainsKey(instanceId)) {
            SDL_CloseJoystick(openJoysticks[instanceId]);
            openJoysticks.Remove(instanceId);
        }
    }

    public static void Main(string[] args) {
        bool watchMode = args.Length > 0 && args[0] == "--watch";

        if (!SDL_Init(0x00002000u)) { // SDL_INIT_GAMEPAD
            Console.WriteLine("[]");
            return;
        }

        try {
            int versionNum = SDL_GetVersion();
            int major = versionNum / 1000000;
            int minor = (versionNum / 1000) % 1000;
            int patch = versionNum % 1000;
            string sdlVersionStr = major + "." + minor + "." + patch;
            Console.WriteLine("SDL_VERSION:" + sdlVersionStr);

            if (watchMode) {
                // Open all existing devices at startup
                int existingCount = 0;
                IntPtr ptr = SDL_GetJoysticks(out existingCount);
                if (ptr != IntPtr.Zero && existingCount > 0) {
                    int[] ids = new int[existingCount];
                    Marshal.Copy(ptr, ids, 0, existingCount);
                    for (int i = 0; i < existingCount; i++) {
                        OpenDevice((uint)ids[i]);
                    }
                    SDL_free(ptr);
                }

                System.Threading.Thread stdinThread = new System.Threading.Thread(() => {
                    try {
                        string line;
                        while ((line = Console.ReadLine()) != null) {
                            string trimmed = line.Trim();
                            if (trimmed.StartsWith("RUMBLE:")) {
                                string[] parts = trimmed.Split(':');
                                if (parts.Length >= 3) {
                                    uint instId = uint.Parse(parts[1]);
                                    uint duration = uint.Parse(parts[2]);
                                    
                                    IntPtr gp = IntPtr.Zero;
                                    bool wasAlreadyOpen = openGamepads.TryGetValue(instId, out gp);
                                    if (!wasAlreadyOpen) {
                                        gp = SDL_OpenGamepad(instId);
                                    }
                                    
                                    if (gp != IntPtr.Zero) {
                                        SDL_RumbleGamepad(gp, 0xFFFF, 0xFFFF, duration);
                                        System.Threading.Thread.Sleep((int)duration + 50);
                                        if (!wasAlreadyOpen) {
                                            SDL_CloseGamepad(gp);
                                        }
                                    }
                                }
                            }
                        }
                    } catch { }
                    Environment.Exit(0);
                });
                stdinThread.IsBackground = true;
                stdinThread.Start();

                Console.WriteLine(GetDevicesJson());

                SDL_Event ev = new SDL_Event();
                while (true) {
                    if (SDL_WaitEventTimeout(ref ev, 50)) {
                        // 1. Device connection/disconnection events
                        if (ev.type == 0x605 || ev.type == 0x606 || ev.type == 0x653 || ev.type == 0x654) {
                            if (ev.type == 0x605 || ev.type == 0x653) {
                                OpenDevice(ev.type == 0x605 ? ev.jaxis.which : ev.gbutton.which);
                            } else if (ev.type == 0x606 || ev.type == 0x654) {
                                CloseDevice(ev.type == 0x606 ? ev.jaxis.which : ev.gbutton.which);
                            }
                            System.Threading.Thread.Sleep(150);
                            SDL_Event pendingEv = new SDL_Event();
                            while (SDL_PollEvent(ref pendingEv)) {
                                if (pendingEv.type == 0x605 || pendingEv.type == 0x653) {
                                    OpenDevice(pendingEv.type == 0x605 ? pendingEv.jaxis.which : pendingEv.gbutton.which);
                                } else if (pendingEv.type == 0x606 || pendingEv.type == 0x654) {
                                    CloseDevice(pendingEv.type == 0x606 ? pendingEv.jaxis.which : pendingEv.gbutton.which);
                                }
                            }
                            Console.WriteLine(GetDevicesJson());
                        }

                        // 2. Gamepad events (semantic mappings)
                        else if (ev.type == 0x650) { // SDL_EVENT_GAMEPAD_AXIS_MOTION
                            uint which = ev.gaxis.which;
                            byte axis = ev.gaxis.axis;
                            short val = ev.gaxis.value;
                            string key = which + "_" + axis + "_gp";
                            int lastVal = 0;
                            bool hasLast = lastAxisValues.TryGetValue(key, out lastVal);
                            if (!hasLast || Math.Abs(val - lastVal) >= AXIS_THRESHOLD || (val == 0 && lastVal != 0)) {
                                lastAxisValues[key] = val;
                                Console.WriteLine("GPAXIS:" + which + ":" + axis + ":" + val);
                            }
                        } else if (ev.type == 0x651 || ev.type == 0x652) { // DOWN or UP
                            uint which = ev.gbutton.which;
                            byte button = ev.gbutton.button;
                            int state = ev.type == 0x651 ? 1 : 0;
                            Console.WriteLine("GPBUTTON:" + which + ":" + button + ":" + state);
                        }

                        // 3. Joystick events (generic fallback for non-gamepads)
                        else if (ev.type == 0x600) { // SDL_EVENT_JOYSTICK_AXIS_MOTION
                            uint which = ev.jaxis.which;
                            if (!openGamepads.ContainsKey(which)) {
                                byte axis = ev.jaxis.axis;
                                short val = ev.jaxis.value;
                                string key = which + "_" + axis + "_joy";
                                int lastVal = 0;
                                bool hasLast = lastAxisValues.TryGetValue(key, out lastVal);
                                if (!hasLast || Math.Abs(val - lastVal) >= AXIS_THRESHOLD || (val == 0 && lastVal != 0)) {
                                    lastAxisValues[key] = val;
                                    Console.WriteLine("AXIS:" + which + ":" + axis + ":" + val);
                                }
                            }
                        } else if (ev.type == 0x602) { // SDL_EVENT_JOYSTICK_HAT_MOTION
                            uint which = ev.jhat.which;
                            if (!openGamepads.ContainsKey(which)) {
                                byte hat = ev.jhat.hat;
                                byte val = ev.jhat.value;
                                Console.WriteLine("HAT:" + which + ":" + hat + ":" + val);
                            }
                        } else if (ev.type == 0x603 || ev.type == 0x604) { // DOWN or UP
                            uint which = ev.jbutton.which;
                            if (!openGamepads.ContainsKey(which)) {
                                byte button = ev.jbutton.button;
                                int state = ev.type == 0x603 ? 1 : 0;
                                Console.WriteLine("BUTTON:" + which + ":" + button + ":" + state);
                            }
                        }
                    }
                }
            } else {
                Console.WriteLine(GetDevicesJson());
            }
        } finally {
            // Close all opened devices on quit
            foreach (var gp in openGamepads.Values) {
                SDL_CloseGamepad(gp);
            }
            foreach (var joy in openJoysticks.Values) {
                SDL_CloseJoystick(joy);
            }
            SDL_Quit();
        }
    }
}
