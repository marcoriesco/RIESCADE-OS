import { LaunchArgs } from '../types.js';

export abstract class BaseGenerator {
  protected system: string;
  protected emulator: string;
  protected core: string;
  protected rom: string;
  protected args: LaunchArgs;

  constructor(args: LaunchArgs) {
    this.system = args.system;
    this.emulator = args.emulator;
    this.core = args.core;
    this.rom = args.rom;
    this.args = args;
  }

  // Prepares emulator configurations, mapped inputs, etc.
  public abstract configure(): void | Promise<void>;

  // Generates the executable path and arguments to spawn
  public abstract getLaunchCommand(): { executable: string; args: string[] };

  // Cleanup runs after the emulator exits
  public cleanup(): void {}
}
