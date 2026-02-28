import { HeatingProvider, ZoneStatus, ZoneSchedule, SystemStatus, DhwStatus } from './HeatingProvider';
export declare class MqttProvider implements HeatingProvider {
    private config;
    private client;
    private zones;
    private schedules;
    private system;
    private dhw;
    private lastError;
    private zoneIdToName;
    private nameToZoneId;
    private pendingSchedules;
    constructor(config: any);
    loadZoneMapping(): void;
    private updateReverseMapping;
    private saveZoneMapping;
    private fetchZonesFromHoneywell;
    initialize(): Promise<void>;
    private setupSubscriptions;
    private handleMessage;
    private translateScheduleFromMqtt;
    private translateScheduleToMqtt;
    getZonesStatus(): Promise<ZoneStatus[]>;
    getSystemStatus(): Promise<SystemStatus>;
    getHotWaterStatus(): Promise<DhwStatus | null>;
    getAllSchedules(): Promise<Record<string, ZoneSchedule>>;
    getScheduleForId(id: string, force?: boolean): Promise<ZoneSchedule>;
    saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void>;
    setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void>;
    setSystemMode(mode: string, until?: string): Promise<void>;
    setHotWaterState(state: string, until?: string): Promise<void>;
    renewSession(): Promise<void>;
    getSessionInfo(): any;
}
//# sourceMappingURL=MqttProvider.d.ts.map