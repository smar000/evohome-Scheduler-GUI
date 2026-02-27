import { config } from '../config/index';
import { HeatingProvider } from './HeatingProvider';
import { HoneywellTccProvider } from './HoneywellTccProvider';
import { MqttProvider } from './MqttProvider';
import { MockProvider } from './MockProvider';

export class ProviderFactory {
  static create(): HeatingProvider {
    switch (config.providerType) {
      case 'honeywell':
        return new HoneywellTccProvider(config.honeywell.username, config.honeywell.password);
      case 'mqtt':
        return new MqttProvider(config.mqtt);
      case 'mock':
        return new MockProvider();
      default:
        throw new Error(`Unsupported provider type: ${config.providerType}`);
    }
  }
}
