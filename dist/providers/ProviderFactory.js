"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFactory = void 0;
const index_1 = require("../config/index");
const HoneywellTccProvider_1 = require("./HoneywellTccProvider");
const MqttProvider_1 = require("./MqttProvider");
const MockProvider_1 = require("./MockProvider");
class ProviderFactory {
    static create() {
        switch (index_1.config.providerType) {
            case 'honeywell':
                return new HoneywellTccProvider_1.HoneywellTccProvider(index_1.config.honeywell.username, index_1.config.honeywell.password);
            case 'mqtt':
                return new MqttProvider_1.MqttProvider(index_1.config);
            case 'mock':
                return new MockProvider_1.MockProvider();
            default:
                throw new Error(`Unsupported provider type: ${index_1.config.providerType}`);
        }
    }
}
exports.ProviderFactory = ProviderFactory;
//# sourceMappingURL=ProviderFactory.js.map