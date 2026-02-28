import { MqttProvider } from '../src/providers/MqttProvider';
import mqtt from 'mqtt';
import EventEmitter from 'events';

// Mock mqtt
jest.mock('mqtt');

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
        commandTopic: 'evohome/evogateway/system/_command',
        statusTopic: 'evohome/evogateway/system/_command/_lastcommand',
        zonesTopic: 'evohome/evogateway/zones'
    };

    beforeEach(() => {
        mockClient = new MockClient();
        (mqtt.connect as jest.Mock).mockReturnValue(mockClient);
        provider = new MqttProvider(config);
    });

    it('should initialize and subscribe to topics', async () => {
        const initPromise = provider.initialize();
        
        // Wait for initialize to reach mqtt.connect call
        let attempts = 0;
        while ((mqtt.connect as jest.Mock).mock.calls.length === 0 && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 10));
            attempts++;
        }

        mockClient.emit('connect');
        await initPromise;

        expect(mockClient.subscribe).toHaveBeenCalledWith(config.statusTopic);
        expect(mockClient.subscribe).toHaveBeenCalledWith(`${config.zonesTopic}/+`);
        expect(mockClient.subscribe).toHaveBeenCalledWith('evohome/evogateway/system');
        expect(mockClient.subscribe).toHaveBeenCalledWith('evohome/evogateway/dhw');
    });

    it('should handle zone status messages', async () => {
        const initPromise = provider.initialize();
        mockClient.emit('connect');
        await initPromise;

        const payload = JSON.stringify({
            temperature: 20.5,
            setpoint: 21.0,
            setpointMode: 'FollowSchedule'
        });

        mockClient.emit('message', 'evohome/evogateway/zones/living_room', Buffer.from(payload));

        const zones = await provider.getZonesStatus();
        expect(zones).toHaveLength(1);
        expect(zones[0].name).toBe('living_room');
        expect(zones[0].temperature).toBe(20.5);
    });

    it('should handle schedule messages and resolve pending promises', async () => {
        const initPromise = provider.initialize();
        mockClient.emit('connect');
        await initPromise;

        // Request schedule
        const schedulePromise = provider.getScheduleForId('01');

        // Verify command published
        expect(mockClient.publish).toHaveBeenCalledWith(
            config.commandTopic,
            expect.stringContaining('"command":"get_schedule"')
        );

        // Simulate response
        const payload = JSON.stringify({
            zone_idx: '01',
            schedule: [
                { day_of_week: 0, switchpoints: [{ time_of_day: '08:00', heat_setpoint: 21.0 }] }
            ]
        });

        mockClient.emit('message', 'evohome/evogateway/zones/living_room/ctl_controller/zone_schedule', Buffer.from(payload));

        const schedule = await schedulePromise;
        expect(schedule.schedule).toHaveLength(1);
        expect(schedule.schedule[0].dayOfWeek).toBe('Monday');
    });
});
