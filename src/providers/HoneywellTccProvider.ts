import axios, { AxiosInstance } from 'axios';
import { DateTime } from 'luxon';
import fs from 'fs';
import path from 'path';
import { 
  HeatingProvider, 
  ZoneStatus, 
  ZoneSchedule, 
  DailySchedule, 
  SystemStatus,
  DhwStatus
} from './HeatingProvider';
import { Logger } from '../utils/Logger';

const URL_DOMAIN = "https://mytotalconnectcomfort.com";
const URL_LOGIN = `${URL_DOMAIN}/Auth/OAuth/Token`;
const URL_API_BASE = `${URL_DOMAIN}/WebAPI/emea/api/v1`;
const SESSION_FILE = path.join(process.cwd(), '.session.json');

export class HoneywellTccProvider implements HeatingProvider {
  private axiosInstance: AxiosInstance | null = null;
  private credentials: {
    accessToken: string;
    refreshToken: string;
    expires: DateTime;
    tokenType: string;
  } | null = null;
  
  private userId: string | null = null;
  private locationId: string | null = null;
  private systemId: string | null = null;
  private dhwId: string | null = null;

  // Caching
  private cachedFullStatus: any = null;
  private lastApiFetch: DateTime | null = null;      
  private readonly CACHE_TTL_MINUTES = 3;
  
  private lastFullLogin: DateTime | null = null;

  constructor(private username?: string, private password?: string) {}

  async initialize(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error("Username and password are required for Honeywell TCC provider.");
    }

    const loaded = this.loadSession();
    if (loaded) {
        Logger.info("Honeywell TCC: Loaded existing session from file.");
        this.setupAxiosInstance();
        try {
            await this.fetchUserInfo();
            await this.fetchInstallationData();
            await this.saveMqttMappings(); // Auto-save mappings on init
            return;
        } catch (error) {
            Logger.debug("Honeywell TCC: Existing session invalid or expired. Attempting refresh/login.");
        }
    }

    await this.ensureSession();
    await this.fetchUserInfo();
    await this.fetchInstallationData();
    await this.saveMqttMappings(); // Auto-save mappings after fresh login
  }

  private async saveMqttMappings(): Promise<void> {
    try {
        const zones = await this.getZonesStatus(false, true); // Use cached status if just fetched
        if (!zones || zones.length === 0) return;

        const mapping: Record<string, { name: string, label: string }> = {};
        zones.forEach((z, index) => {
            const snakeLabel = z.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
            const userZoneId = index.toString().padStart(2, '0');
            mapping[userZoneId] = {
                name: z.name,
                label: snakeLabel
            };
        });

        const zonesPath = path.join(process.cwd(), 'config', 'zones.json');
        const dir = path.dirname(zonesPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(zonesPath, JSON.stringify(mapping, null, 2));
        Logger.info(`Honeywell TCC: Automatically synced ${zones.length} zone mappings (with names and labels) for MQTT.`);
    } catch (e) {
        Logger.error("Honeywell TCC: Failed to auto-sync MQTT mappings.", e);
    }
  }

  private loadSession(): boolean {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        this.credentials = {
          ...data,
          expires: DateTime.fromISO(data.expires)
        };
        if (data.lastFullLogin) {
            this.lastFullLogin = DateTime.fromISO(data.lastFullLogin);
        }
        return true;
      }
    } catch (e) {
      Logger.error("Honeywell TCC: Failed to load session file.", e);
    }
    return false;
  }

  private saveSession(): void {
    try {
      const data = {
        accessToken: this.credentials?.accessToken,
        refreshToken: this.credentials?.refreshToken,
        expires: this.credentials?.expires.toISO(),
        tokenType: this.credentials?.tokenType,
        lastFullLogin: this.lastFullLogin?.toISO()
      };
      fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      Logger.error("Honeywell TCC: Failed to save session file.", e);
    }
  }

  private async login(refreshToken?: string): Promise<void> {
    const now = DateTime.now();
    if (!refreshToken && this.lastFullLogin && now.diff(this.lastFullLogin, 'minutes').minutes < 15) {
        const waitMins = Math.ceil(15 - now.diff(this.lastFullLogin, 'minutes').minutes);
        Logger.error(`Honeywell TCC: Login rate-limit guard active. Please wait ${waitMins} minutes before full re-authentication.`);
        throw new Error(`Login rate-limit guard active. Wait ${waitMins} mins.`);
    }

    Logger.info(refreshToken ? "Honeywell TCC: Refreshing session..." : "Honeywell TCC: Attempting full login...");
    const headers = {
      'Authorization': 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    
    let body = '';
    if (refreshToken) {
      body = `grant_type=refresh_token&refresh_token=${refreshToken}`;
    } else {
      body = `grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=${encodeURIComponent(this.username!)}&Password=${encodeURIComponent(this.password!)}`;
      this.lastFullLogin = now;
    }

    try {
      const response = await axios.post(URL_LOGIN, body, { headers, timeout: 10000 });
      const data = response.data;
      this.credentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type,
        expires: DateTime.now().plus({ seconds: data.expires_in }),
      };
      this.setupAxiosInstance();
      this.saveSession();
      Logger.info("Honeywell TCC: Login/Refresh successful.");
    } catch (error) {
      Logger.error("Honeywell TCC: Login/Refresh failed.", error);
      throw error;
    }
  }

  private setupAxiosInstance() {
    if (!this.credentials) return;
    this.axiosInstance = axios.create({
      baseURL: URL_API_BASE,
      timeout: 10000,
      headers: {
        'Authorization': `bearer ${this.credentials.accessToken}`,
        'applicationId': 'b013aa26-9724-4dbd-8897-048b9aada249',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  private async ensureSession(): Promise<void> {
    const now = DateTime.now();
    if (!this.credentials || now > this.credentials.expires.minus({ minutes: 5 })) {
      Logger.debug("Honeywell TCC: Session expiring or missing. Refreshing...");
      if (this.credentials?.refreshToken) {
        try {
            await this.login(this.credentials.refreshToken);
        } catch (e) {
            Logger.debug("Honeywell TCC: Refresh failed. Attempting full login.");
            await this.login();
        }
      } else {
        await this.login();
      }
    }
  }

  private async fetchUserInfo(): Promise<void> {
    await this.ensureSession();
    const response = await this.axiosInstance!.get('/userAccount');
    this.userId = response.data.userId;
    Logger.debug(`Honeywell TCC: Fetched user ID: ${this.userId}`);
  }

  private async fetchInstallationData(): Promise<void> {
    await this.ensureSession();
    const response = await this.axiosInstance!.get(`/location/installationInfo?userId=${this.userId}&includeTemperatureControlSystems=True`);
    const location = response.data[0];
    this.locationId = location.locationInfo.locationId;
    this.systemId = location.gateways[0].temperatureControlSystems[0].systemId;
    this.dhwId = location.gateways[0].temperatureControlSystems[0].dhw?.dhwId || null;
    Logger.debug(`Honeywell TCC: Initialized with location ${this.locationId}, system ${this.systemId}, DHW ${this.dhwId}`);
  }

  private async getFullStatus(force = false, preferCache = false): Promise<any> {
    const now = DateTime.now();
    const secondsSinceLastApiFetch = this.lastApiFetch ? now.diff(this.lastApiFetch, 'seconds').seconds : 999;
    const isCacheExpired = secondsSinceLastApiFetch > (this.CACHE_TTL_MINUTES * 60);

    // NEW LOGIC: If preferCache is true AND we have data, use it regardless of expiration (within reason)
    if ((preferCache || !force) && !isCacheExpired && this.cachedFullStatus) {
      Logger.debug(`Honeywell TCC: Using cached data (${Math.round(secondsSinceLastApiFetch)}s old). PreferCache=${preferCache}`);
      return this.cachedFullStatus;
    }

    if (force) {
        Logger.info(`Honeywell TCC: Forced refresh requested. Bypassing cache.`);
    } else {
        Logger.debug("Honeywell TCC: Cache expired. Fetching fresh data from API...");
    }

    await this.ensureSession();
    
    if (!this.axiosInstance) {
        throw new Error("Honeywell TCC: Axios instance not initialized. Possible login failure.");
    }

    const response = await this.axiosInstance.get(`/location/${this.locationId}/status?includeTemperatureControlSystems=True`);
    
    this.cachedFullStatus = response.data;
    this.lastApiFetch = now;
    
    return this.cachedFullStatus;
  }

  async getZonesStatus(force = false, preferCache = false): Promise<ZoneStatus[]> {
    const data = await this.getFullStatus(force, preferCache);
    const zonesData = data.gateways[0].temperatureControlSystems[0].zones;
    return zonesData.map((z: any) => ({
      zoneId: z.zoneId,
      name: z.name,
      setpoint: z.heatSetpointStatus?.targetTemperature ?? 0,
      temperature: z.temperatureStatus?.temperature ?? 0,
      setpointMode: z.heatSetpointStatus?.setpointMode ?? 'Unknown',
      until: z.heatSetpointStatus?.untilTime,
    }));
  }

  async getSystemStatus(force = false, preferCache = false): Promise<SystemStatus> {
    const data = await this.getFullStatus(force, preferCache);
    const status = data.gateways[0].temperatureControlSystems[0].systemModeStatus;
    return { systemMode: status.mode, timeUntil: status.untilTime, permanent: status.isPermanent };
  }

  async getHotWaterStatus(force = false, preferCache = false): Promise<DhwStatus | null> {
    if (!this.dhwId) return null;
    const data = await this.getFullStatus(force, preferCache);
    const dhw = data.gateways[0].temperatureControlSystems[0].dhw;
    if (!dhw) return null;
    return { dhwId: dhw.dhwId, state: dhw.stateStatus.state, temperature: dhw.temperatureStatus.temperature, setpointMode: dhw.stateStatus.mode, until: dhw.stateStatus.untilTime };
  }

  async getAllSchedules(force = false, preferCache = false): Promise<Record<string, ZoneSchedule>> {
    // If we prefer cache, we should try to avoid the internal getZonesStatus force too
    const zones = await this.getZonesStatus(force, preferCache);
    const allSchedules: Record<string, ZoneSchedule> = {};
    for (const zone of zones) {
      allSchedules[zone.zoneId] = await this.getScheduleForId(zone.zoneId);
    }
    if (this.dhwId) {
        allSchedules[this.dhwId] = await this.getScheduleForId(this.dhwId);
    }
    return allSchedules;
  }

  async getScheduleForId(id: string): Promise<ZoneSchedule> {
    await this.ensureSession();
    if (!this.axiosInstance) {
        throw new Error("Honeywell TCC: Axios instance not initialized.");
    }
    const response = await this.axiosInstance.get(`/temperatureZone/${id}/schedule`);
    const data = response.data;
    const dailySchedules: DailySchedule[] = data.dailySchedules.map((ds: any) => ({
      dayOfWeek: ds.dayOfWeek,
      switchpoints: ds.switchpoints.map((sw: any) => ({ heatSetpoint: sw.heatSetpoint, timeOfDay: sw.timeOfDay })),
    }));
    return { name: "", schedule: dailySchedules };
  }

  async saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void> {
    await this.ensureSession();
    const body = { dailySchedules: schedule.schedule };
    await this.axiosInstance!.put(`/temperatureZone/${zoneId}/schedule`, body);
    Logger.info(`Honeywell TCC: Saved schedule for zone ${zoneId}`);
    this.lastApiFetch = null; 
  }

  async setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void> {
    await this.ensureSession();
    let body: any;
    if (setpoint === 0) {
      body = { HeatSetpointValue: null, SetpointMode: "FollowSchedule", TimeUntil: null };
    } else if (until) {
      body = { HeatSetpointValue: setpoint, SetpointMode: "TemporaryOverride", TimeUntil: until };
    } else {
      body = { HeatSetpointValue: setpoint, SetpointMode: "PermanentOverride", TimeUntil: null };
    }
    await this.axiosInstance!.put(`/temperatureZone/${zoneId}/heatSetpoint`, body);
    Logger.info(`Honeywell TCC: Set setpoint for zone ${zoneId} to ${setpoint}`);
    this.lastApiFetch = null;
  }

  async setSystemMode(mode: string, until?: string): Promise<void> {
    await this.ensureSession();
    const body = { SystemMode: mode, TimeUntil: until || null, Permanent: until ? false : true };
    await this.axiosInstance!.put(`/temperatureControlSystem/${this.systemId}/mode`, body);
    Logger.info(`Honeywell TCC: Set system mode to ${mode}`);
    this.lastApiFetch = null;
  }

  async setHotWaterState(state: string, until?: string): Promise<void> {
    if (!this.dhwId) throw new Error("DHW is not supported by this system.");
    await this.ensureSession();
    const normalizedState = state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
    let body: any;
    if (normalizedState === "Auto") {
        body = { State: "", Mode: "FollowSchedule", UntilTime: null };
    } else if (until) {
        body = { State: normalizedState, Mode: "TemporaryOverride", UntilTime: until };
    } else {
        body = { State: normalizedState, Mode: "PermanentOverride", UntilTime: null };
    }
    await this.axiosInstance!.put(`/domesticHotWater/${this.dhwId}/state`, body);
    Logger.info(`Honeywell TCC: Set DHW state to ${normalizedState}`);
    this.lastApiFetch = null;
  }

  async renewSession(): Promise<void> {
    if (this.credentials?.refreshToken) {
        await this.login(this.credentials.refreshToken);
    } else {
        await this.login();
    }
  }

  getSessionInfo(): any {
    return {
        userId: this.userId,
        locationId: this.locationId,
        systemId: this.systemId,
        dhwId: this.dhwId,
        expires: this.credentials?.expires.toISO(),
        lastFullLogin: this.lastFullLogin?.toISO()
    };
  }
}
