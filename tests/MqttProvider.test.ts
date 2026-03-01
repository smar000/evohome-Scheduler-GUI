import { MqttProvider } from '../src/providers/MqttProvider';
import mqtt from 'mqtt';
import EventEmitter from 'events';
import fs from 'fs';

jest.mock('mqtt');
jest.mock('fs');

class MockClient extends EventEmitter {
    subscribe = jest.fn();
    publish = jest.fn();
    reconnect = jest.fn();
    connected = true;
}

describe('MqttProvider', () => {
    let provider: MqttProvider;
    let mockClient: MockClient;
    const config = {
        brokerUrl: 'mqtt://localhost',
        baseTopic: 'evohome/evogateway',
        zonesSubtopic: 'zones',
        dhwSubtopic: '_dhw'
    };

    const statusTopic = `${config.baseTopic}/system/_command/_lastcommand`;
    const zonesTopic = `${config.baseTopic}/${config.zonesSubtopic}`;

    beforeEach(() => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        mockClient = new MockClient();
        (mqtt.connect as jest.Mock).mockReturnValue(mockClient);
        provider = new MqttProvider(config);
    });

    it('should initialize and subscribe to topics', async () => {
        const initPromise = provider.initialize();
        mockClient.emit('connect');
        await initPromise;

        expect(mockClient.subscribe).toHaveBeenCalledWith(statusTopic);
        expect(mockClient.subscribe).toHaveBeenCalledWith(`${zonesTopic}/+`);
        expect(mockClient.subscribe).toHaveBeenCalledWith(`${config.baseTopic}/system`);
        expect(mockClient.subscribe).toHaveBeenCalledWith(`${config.baseTopic}/${config.dhwSubtopic}`);
    });

    it('should handle zone status messages and map labels', async () => {
        const initPromise = provider.initialize();
        mockClient.emit('connect');
        await initPromise;

        const payload = JSON.stringify({
            zoneId: '01',
            temperature: 20.5,
            setpoint: 21.0,
            mode: 'follow_schedule'
        });

        // Topic matches subscription pattern
        mockClient.emit('message', `${zonesTopic}/living_room`, Buffer.from(payload));

        const zones = await provider.getZonesStatus();
        expect(zones).toHaveLength(1);
        expect(zones[0].zoneId).toBe('01');
        expect(zones[0].setpointMode).toBe('Following Schedule');
    });

    it('should handle schedule messages and resolve pending promises', async () => {
        const initPromise = provider.initialize();
        mockClient.emit('connect');
        await initPromise;

        // Request schedule
        const schedulePromise = provider.getScheduleForId('01');

        // Verify command published
        expect(mockClient.publish).toHaveBeenCalledWith(
            `${config.baseTopic}/system/_command`,
            expect.stringContaining('"command":"get_schedule"')
        );

        // Simulate response
        const payload = JSON.stringify({
            zone_idx: '01',
            schedule: [
                { day_of_week: 0, switchpoints: [{ time_of_day: '08:00', heat_setpoint: 21.0 }] }
            ]
        });

        mockClient.emit('message', `${zonesTopic}/living_room/ctl_controller/zone_schedule`, Buffer.from(payload));

        const schedule = await schedulePromise;
        expect(schedule.schedule).toHaveLength(1);
        expect(schedule.schedule[0].dayOfWeek).toBe('Monday');
    });

    it('should handle gateway status messages', async () => {
        const initPromise = provider.initialize();
        mockClient.emit('connect');
        await initPromise;

        mockClient.emit('message', `${config.baseTopic}/status`, Buffer.from('Online'));
        
        const info = provider.getSessionInfo();
        expect(info.gatewayStatus).toBe('Online');
    });
});
