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
  // Deduplicates concurrent HTTP calls — all callers share the same in-flight promise
  private fetchInFlight: Promise<any> | null = null;

  private lastFullLogin: DateTime | null = null;

  private urlDomain: string;
  private urlLogin: string;
  private urlApiBase: string;

  constructor(private config: any) {
    this.urlDomain = config.urlDomain;
    this.urlLogin = `${this.urlDomain}/Auth/OAuth/Token`;
    this.urlApiBase = `${this.urlDomain}/WebAPI/emea/api/v1`;
  }

  async initialize(): Promise<void> {
    if (!this.config.username || !this.config.password) {
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

        const mapping: Record<string, { name: string, label: string, honeywellId: string }> = {};
        zones.forEach((z, index) => {
            const snakeLabel = z.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
            const userZoneId = index.toString().padStart(2, '0');
            mapping[userZoneId] = {
                name: z.name,
                label: snakeLabel,
                honeywellId: z.zoneId
            };
        });

        const zonesPath = path.join(process.cwd(), 'data', 'zones.json');
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
    if (!refreshToken && this.lastFullLogin && now.diff(this.lastFullLogin, 'minutes').minutes < this.config.loginLimitMinutes) {
        const waitMins = Math.ceil(this.config.loginLimitMinutes - now.diff(this.lastFullLogin, 'minutes').minutes);
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
      body = `grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=${encodeURIComponent(this.config.username!)}&Password=${encodeURIComponent(this.config.password!)}`;
      this.lastFullLogin = now;
    }

    try {
      const response = await axios.post(this.urlLogin, body, { headers, timeout: this.config.apiTimeout });
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
      baseURL: this.urlApiBase,
      timeout: this.config.apiTimeout,
      headers: {
        'Authorization': `bearer ${this.credentials.accessToken}`,
        'applicationId': 'b013aa26-9724-4dbd-8897-048b9aada249',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Add interceptor to handle 401s automatically
    this.axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;
            // Prevent recursive retries
            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;
                Logger.debug("Honeywell TCC: Received 401, attempting token refresh...");
                try {
                    await this.renewSession();
                    // Use the current provider instance to avoid circular dependency
                    if (this.credentials) {
                        originalRequest.headers['Authorization'] = `bearer ${this.credentials.accessToken}`;
                        // Use original axios call but with updated headers
                        return axios(originalRequest);
                    }
                } catch (refreshError) {
                    Logger.error("Honeywell TCC: Token refresh failed during retry.", refreshError);
                    return Promise.reject(refreshError);
                }
            }
            return Promise.reject(error);
        }
    );
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
    const isCacheExpired   = secondsSinceLastApiFetch > (this.config.cacheTtlMinutes    * 60);
    const isDataTooStale   = secondsSinceLastApiFetch > (this.config.autoRefreshMinutes * 60);

    // Return cached data when:
    //  - not a forced refresh
    //  - data is not beyond the absolute stale ceiling (autoRefreshMinutes)
    //  - cache exists
    //  - caller prefers cache OR the short TTL has not yet expired
    if (!force && !isDataTooStale && this.cachedFullStatus && (preferCache || !isCacheExpired)) {
      Logger.debug(`Honeywell TCC: Using cached data (${Math.round(secondsSinceLastApiFetch)}s old, preferCache=${preferCache})`);
      return this.cachedFullStatus;
    }

    if (force) {
        Logger.info('Honeywell TCC: Forced refresh requested.');
    } else if (isDataTooStale) {
        Logger.info(`Honeywell TCC: Data is ${Math.round(secondsSinceLastApiFetch / 60)}min old — auto-refreshing (threshold: ${this.config.autoRefreshMinutes}min).`);
    } else {
        Logger.debug('Honeywell TCC: Short cache TTL expired. Fetching fresh data...');
    }

    // Deduplicate: if a fetch is already in progress all callers share the same promise
    // to avoid hammering the Honeywell API with simultaneous requests.
    if (this.fetchInFlight) {
        Logger.debug('Honeywell TCC: Fetch already in progress — awaiting shared result.');
        return this.fetchInFlight;
    }

    this.fetchInFlight = (async () => {
        try {
            await this.ensureSession();
            if (!this.axiosInstance) {
                throw new Error('Honeywell TCC: Axios instance not initialized. Possible login failure.');
            }
            const response = await this.axiosInstance.get(
                `/location/${this.locationId}/status?includeTemperatureControlSystems=True`
            );
            this.cachedFullStatus = response.data;
            this.lastApiFetch = DateTime.now();
            return this.cachedFullStatus;
        } finally {
            this.fetchInFlight = null;
        }
    })();

    return this.fetchInFlight;
  }

  async getZonesStatus(force = false, preferCache = false): Promise<ZoneStatus[]> {
    const data = await this.getFullStatus(force, preferCache);
    const zonesData = data.gateways[0].temperatureControlSystems[0].zones;
    return zonesData.map((z: any) => ({
      zoneId: z.zoneId,
      name: z.name,
      label: z.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, ''),
      setpoint: z.setpointStatus?.targetHeatTemperature ?? 0,
      temperature: z.temperatureStatus?.temperature ?? 0,
      setpointMode: z.setpointStatus?.setpointMode ?? 'Unknown',
      until: z.setpointStatus?.untilTime,
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

  async getScheduleForId(id: string, force = false): Promise<ZoneSchedule> {
    await this.ensureSession();
    if (!this.axiosInstance) {
        throw new Error("Honeywell TCC: Axios instance not initialized.");
    }
    
    const isDhw = id === this.dhwId;
    const endpoint = isDhw ? `/domesticHotWater/${id}/schedule` : `/temperatureZone/${id}/schedule`;
    
    const response = await this.axiosInstance.get(endpoint);
    const data = response.data;
    const dailySchedules: DailySchedule[] = data.dailySchedules.map((ds: any) => ({
      dayOfWeek: ds.dayOfWeek,
      switchpoints: ds.switchpoints.map((sw: any) => {
          if (isDhw) {
              return { state: sw.state, timeOfDay: sw.timeOfDay };
          } else {
              return { heatSetpoint: sw.heatSetpoint, timeOfDay: sw.timeOfDay };
          }
      }),
    }));
    return { name: isDhw ? "Hot Water" : "", schedule: dailySchedules };
  }

  async saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void> {
    await this.ensureSession();
    const isDhw = zoneId === this.dhwId;
    const endpoint = isDhw ? `/domesticHotWater/${zoneId}/schedule` : `/temperatureZone/${zoneId}/schedule`;
    
    const body = { dailySchedules: schedule.schedule };
    await this.axiosInstance!.put(endpoint, body);
    Logger.info(`Honeywell TCC: Saved schedule for ${isDhw ? 'DHW' : 'zone'} ${zoneId}`);
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
        try {
            await this.login(this.credentials.refreshToken);
        } catch (e) {
            Logger.debug('Honeywell TCC: Token refresh failed in renewSession. Falling back to full login.');
            await this.login();
        }
    } else {
        await this.login();
    }
  }

  getSessionInfo(): any {
    return {
        provider: "Honeywell",
        userId: this.userId,
        locationId: this.locationId,
        systemId: this.systemId,
        dhwId: this.dhwId,
        expires: this.credentials?.expires.toISO(),
        lastFullLogin: this.lastFullLogin?.toISO(),
        gatewayStatus: this.userId ? "Authenticated" : "Not Authenticated"
    };
  }
}
