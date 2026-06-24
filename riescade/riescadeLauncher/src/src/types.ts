export interface LaunchArgs {
  system: string;
  emulator: string;
  core: string;
  rom: string;
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
  rawArgs: Record<string, string>;
  flags: string[];
}
