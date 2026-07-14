
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
                    "\"index\":" + i + "," +
                    "\"connected\":true," +
                    "\"subType\":" + caps.SubType + "," +
                    "\"buttons\":" + state.Gamepad.wButtons + "," +
                    "\"leftTrigger\":" + state.Gamepad.bLeftTrigger + "," +
                    "\"rightTrigger\":" + state.Gamepad.bRightTrigger + "," +
                    "\"thumbLX\":" + state.Gamepad.sThumbLX + "," +
                    "\"thumbLY\":" + state.Gamepad.sThumbLY + "," +
                    "\"thumbRX\":" + state.Gamepad.sThumbRX + "," +
                    "\"thumbRY\":" + state.Gamepad.sThumbRY +
                "}");
            }
        }
        Console.Write("]");
    }
}
