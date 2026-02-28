"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env') });
exports.config = {
    port: parseInt(process.env.PORT || '3330', 10),
    env: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG === 'true',
    providerType: process.env.HEATING_PROVIDER || 'honeywell',
    honeywell: {
        username: process.env.HONEYWELL_USERNAME,
        password: process.env.HONEYWELL_PASSWORD,
    },
    mqtt: {
        brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        // Topic templates based on evogateway
        commandTopic: process.env.MQTT_COMMAND_TOPIC || 'evohome/evogateway/system/_command',
        statusTopic: process.env.MQTT_STATUS_TOPIC || 'evohome/evogateway/system/_command/_lastcommand',
        zonesTopic: process.env.MQTT_ZONES_TOPIC || 'evohome/evogateway/zones',
    }
};
//# sourceMappingURL=index.js.map