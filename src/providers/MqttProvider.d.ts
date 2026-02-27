import { HeatingProvider, ZoneStatus, ZoneSchedule, SystemStatus, DhwStatus } from './HeatingProvider';
export declare class MqttProvider implements HeatingProvider {
    private config;
    private client;
    constructor(config: any);
    initialize(): Promise<void>;
    getZonesStatus(): Promise<ZoneStatus[]>;
    getSystemStatus(): Promise<SystemStatus>;
    getHotWaterStatus(): Promise<DhwStatus | null>;
    getAllSchedules(): Promise<Record<string, ZoneSchedule>>;
    getScheduleForId(id: string): Promise<ZoneSchedule>;
    saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void>;
    setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void>;
    setSystemMode(mode: string, until?: string): Promise<void>;
    setHotWaterState(state: string, until?: string): Promise<void>;
    renewSession(): Promise<void>;
    getSessionInfo(): any;
}
//# sourceMappingURL=MqttProvider.d.ts.map