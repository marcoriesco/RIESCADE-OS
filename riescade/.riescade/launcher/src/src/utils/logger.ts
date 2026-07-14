import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { getLogsPath } from './paths.js'; // Note the .js extension because we're using NodeNext resolution

export class Logger {
  private static logFile: string | null = null;

  private static init() {
    if (this.logFile) return;
    const logsDir = getLogsPath();
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    this.logFile = join(logsDir, 'riescadeLauncher.log');
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
