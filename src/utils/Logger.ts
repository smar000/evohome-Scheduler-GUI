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
  static warn(message: string, ...args: any[]) {
    console.warn(`[${this.timestamp}] [WARN] ${message}`, ...args);
  }
  static debug(message: string, ...args: any[]) {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      console.log(`[${this.timestamp}] [DEBUG] ${message}`, ...args);
    }
  }
  static silly(message: string, ...args: any[]) {
    if (process.env.DEBUG === 'true') {
      console.log(`[${this.timestamp}] [SILLY] ${message}`, ...args);
    }
  }
}
