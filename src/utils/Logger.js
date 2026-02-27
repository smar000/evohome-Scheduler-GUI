"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    static info(message, ...args) {
        console.log(`[INFO] ${message}`, ...args);
    }
    static error(message, ...args) {
        console.error(`[ERROR] ${message}`, ...args);
    }
    static debug(message, ...args) {
        if (process.env.DEBUG) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map