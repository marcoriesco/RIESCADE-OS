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

    [DllImport("SDL3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern bool SDL_RumbleGamepad(IntPtr gamepad, ushort low_frequency_rumble, ushort high_frequency_rumble, uint duration_ms);

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
                        string line;
                        while ((line = Console.ReadLine()) != null) {
                            string trimmed = line.Trim();
                            if (trimmed.StartsWith("RUMBLE:")) {
                                string[] parts = trimmed.Split(':');
                                if (parts.Length >= 3) {
                                    uint instId = uint.Parse(parts[1]);
                                    uint duration = uint.Parse(parts[2]);
                                    
                                    IntPtr gp = SDL_OpenGamepad(instId);
                                    if (gp != IntPtr.Zero) {
                                        SDL_RumbleGamepad(gp, 0xFFFF, 0xFFFF, duration);
                                        System.Threading.Thread.Sleep((int)duration + 50);
                                        SDL_CloseGamepad(gp);
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
                    if (SDL_WaitEventTimeout(ref ev, 100)) {
                        // ADDED (0x605 or 0x653) and REMOVED (0x606 or 0x654)
                        if (ev.type == 0x605 || ev.type == 0x606 || ev.type == 0x653 || ev.type == 0x654) {
                            System.Threading.Thread.Sleep(50);
                            while (SDL_PollEvent(ref ev)) { }
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
