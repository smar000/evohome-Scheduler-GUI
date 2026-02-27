import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
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
