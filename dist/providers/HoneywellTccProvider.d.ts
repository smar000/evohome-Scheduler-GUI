import { HeatingProvider, ZoneStatus, ZoneSchedule, SystemStatus, DhwStatus } from './HeatingProvider';
export declare class HoneywellTccProvider implements HeatingProvider {
    private username?;
    private password?;
    private axiosInstance;
    private credentials;
    private userId;
    private locationId;
    private systemId;
    private dhwId;
    private cachedFullStatus;
    private lastApiFetch;
    private readonly CACHE_TTL_MINUTES;
    private lastFullLogin;
    constructor(username?: string | undefined, password?: string | undefined);
    initialize(): Promise<void>;
    private saveMqttMappings;
    private loadSession;
    private saveSession;
    private login;
    private setupAxiosInstance;
    private ensureSession;
    private fetchUserInfo;
    private fetchInstallationData;
    private getFullStatus;
    getZonesStatus(force?: boolean, preferCache?: boolean): Promise<ZoneStatus[]>;
    getSystemStatus(force?: boolean, preferCache?: boolean): Promise<SystemStatus>;
    getHotWaterStatus(force?: boolean, preferCache?: boolean): Promise<DhwStatus | null>;
    getAllSchedules(force?: boolean, preferCache?: boolean): Promise<Record<string, ZoneSchedule>>;
    getScheduleForId(id: string, force?: boolean): Promise<ZoneSchedule>;
    saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void>;
    setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void>;
    setSystemMode(mode: string, until?: string): Promise<void>;
    setHotWaterState(state: string, until?: string): Promise<void>;
    renewSession(): Promise<void>;
    getSessionInfo(): any;
}
//# sourceMappingURL=HoneywellTccProvider.d.ts.map