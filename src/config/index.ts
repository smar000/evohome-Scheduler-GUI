import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export const config = {
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
