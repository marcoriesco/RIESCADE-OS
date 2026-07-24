import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { getConfigsPath, getLogsPath } from './paths.js'; // Note the .js extension because we're using NodeNext resolution

export class Logger {
  private static logFile: string | null = null;
  private static level = 'default';

  private static init() {
    if (this.logFile) return;
    const logsDir = getLogsPath();
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    this.logFile = join(logsDir, 'riescadeLauncher.log');
    try {
      const settingsPath = join(getConfigsPath(), 'settings.json');
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
        this.level = String(settings?.LogLevel?.value || 'default').toLowerCase();
      }
    } catch {
      this.level = 'default';
    }
  }

  public static info(message: string) {
    this.write('INFO', message);
  }

  public static warn(message: string) {
    this.write('WARN', message);
  }

  public static error(message: string, error?: any) {
    let msg = message;
    if (error) {
      if (error instanceof Error) {
        msg += ` - ${error.message}\n${error.stack}`;
      } else {
        msg += ` - ${JSON.stringify(error)}`;
      }
    }
    this.write('ERROR', msg);
  }

  public static debug(message: string) {
    this.write('DEBUG', message);
  }

  private static write(level: string, message: string) {
    this.init();
    const priorities: Record<string, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
    const thresholds: Record<string, number> = {
      debug: 10,
      default: 20,
      warning: 30,
      error: 40,
      disabled: Number.POSITIVE_INFINITY
    };
    if ((priorities[level] || 20) < (thresholds[this.level] ?? thresholds.default)) return;
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    console.log(logLine.trim());
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, logLine, 'utf8');
      } catch (err) {
        console.error(`Failed to write log to ${this.logFile}:`, err);
      }
    }
  }
}
