import { DateTime } from 'luxon';

export class Logger {
  private static get timestamp(): string {
    return DateTime.now().toFormat('HH:mm:ss.SSS');
  }

  static info(message: string, ...args: any[]) {
    console.log(`[${this.timestamp}] [INFO] ${message}`, ...args);
  }
  static error(message: string, ...args: any[]) {
    console.error(`[${this.timestamp}] [ERROR] ${message}`, ...args);
  }
  static debug(message: string, ...args: any[]) {
    if (process.env.DEBUG || true) { // Force debug for now to help troubleshooting
      console.log(`[${this.timestamp}] [DEBUG] ${message}`, ...args);
    }
  }
}
