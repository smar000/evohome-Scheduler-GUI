"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttProvider = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const Logger_1 = require("../utils/Logger");
class MqttProvider {
    config;
    client = null;
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        Logger_1.Logger.info(`MQTT: Connecting to broker at ${this.config.brokerUrl}...`);
        this.client = mqtt_1.default.connect(this.config.brokerUrl, {
            username: this.config.username,
            password: this.config.password,
        });
        return new Promise((resolve, reject) => {
            this.client?.on('connect', () => {
                Logger_1.Logger.info("MQTT: Connected successfully.");
                // Subscribe to relevant topics here
                resolve();
            });
            this.client?.on('error', (err) => {
                Logger_1.Logger.error("MQTT: Connection error.", err);
                reject(err);
            });
        });
    }
    async getZonesStatus() {
        Logger_1.Logger.debug("MQTT: Fetching zone status (not yet implemented)");
        return [];
    }
    async getSystemStatus() {
        Logger_1.Logger.debug("MQTT: Fetching system status (not yet implemented)");
        return { systemMode: "Auto", permanent: true };
    }
    async getHotWaterStatus() {
        Logger_1.Logger.debug("MQTT: Fetching hot water status (not yet implemented)");
        return null;
    }
    async getAllSchedules() {
        Logger_1.Logger.debug("MQTT: Fetching all schedules (not yet implemented)");
        return {};
    }
    async getScheduleForId(id) {
        Logger_1.Logger.debug(`MQTT: Fetching schedule for ${id} (not yet implemented)`);
        return { name: "", schedule: [] };
    }
    async saveScheduleForZone(zoneId, schedule) {
        Logger_1.Logger.info(`MQTT: Saving schedule for zone ${zoneId} (not yet implemented)`);
    }
    async setZoneSetpoint(zoneId, setpoint, until) {
        Logger_1.Logger.info(`MQTT: Setting setpoint for zone ${zoneId} to ${setpoint} (not yet implemented)`);
    }
    async setSystemMode(mode, until) {
        Logger_1.Logger.info(`MQTT: Setting system mode to ${mode} (not yet implemented)`);
    }
    async setHotWaterState(state, until) {
        Logger_1.Logger.info(`MQTT: Setting DHW state to ${state} (not yet implemented)`);
    }
    async renewSession() {
        Logger_1.Logger.debug("MQTT: Reconnecting...");
    }
    getSessionInfo() {
        return { provider: "MQTT" };
    }
}
exports.MqttProvider = MqttProvider;
//# sourceMappingURL=MqttProvider.js.map