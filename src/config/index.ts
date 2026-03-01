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
    cacheTtlMinutes: parseInt(process.env.HONEYWELL_CACHE_TTL || '3', 10),
    urlDomain: process.env.HONEYWELL_URL_DOMAIN || 'https://mytotalconnectcomfort.com',
    apiTimeout: parseInt(process.env.HONEYWELL_API_TIMEOUT || '10000', 10),
    loginLimitMinutes: parseInt(process.env.HONEYWELL_LOGIN_LIMIT || '15', 10),
  },

  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    baseTopic: process.env.MQTT_BASE_TOPIC || 'evohome/evogateway',
    zonesSubtopic: process.env.MQTT_ZONES_SUBTOPIC || 'zones',
    dhwSubtopic: process.env.MQTT_DHW_SUBTOPIC || '_dhw',
    reconnectPeriod: parseInt(process.env.MQTT_RECONNECT_PERIOD || '5000', 10),
    connectTimeout: parseInt(process.env.MQTT_CONNECT_TIMEOUT || '10000', 10),
    retainedWindow: parseInt(process.env.MQTT_RETAINED_WINDOW || '1000', 10),
    scheduleTimeout: parseInt(process.env.MQTT_SCHEDULE_TIMEOUT || '10000', 10),
  },

  scheduler: {
    timeResolution: parseInt(process.env.SCHEDULER_TIME_RESOLUTION || '10', 10),
    defaultTemp: parseFloat(process.env.SCHEDULER_DEFAULT_TEMP || '20'),
    longPressMs: parseInt(process.env.SCHEDULER_LONG_PRESS_MS || '600', 10),
    apiTimeout: parseInt(process.env.FRONTEND_API_TIMEOUT || '15000', 10),
  }
};
