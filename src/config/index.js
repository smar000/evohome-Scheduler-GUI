"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
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
        topicPrefix: process.env.MQTT_TOPIC_PREFIX || 'evohome',
    }
};
//# sourceMappingURL=index.js.map