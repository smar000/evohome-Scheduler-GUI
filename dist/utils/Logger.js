"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const luxon_1 = require("luxon");
class Logger {
    static get timestamp() {
        return luxon_1.DateTime.now().toFormat('HH:mm:ss.SSS');
    }
    static info(message, ...args) {
        console.log(`[${this.timestamp}] [INFO] ${message}`, ...args);
    }
    static error(message, ...args) {
        console.error(`[${this.timestamp}] [ERROR] ${message}`, ...args);
    }
    static warn(message, ...args) {
        console.warn(`[${this.timestamp}] [WARN] ${message}`, ...args);
    }
    static debug(message, ...args) {
        if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
            console.log(`[${this.timestamp}] [DEBUG] ${message}`, ...args);
        }
    }
    static silly(message, ...args) {
        if (process.env.DEBUG === 'true') {
            console.log(`[${this.timestamp}] [SILLY] ${message}`, ...args);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map