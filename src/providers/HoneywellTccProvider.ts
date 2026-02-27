import axios, { AxiosInstance } from 'axios';
import { DateTime } from 'luxon';
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

interface TccCredentials {
  accessToken: string;
  refreshToken: string;
  expires: DateTime;
  tokenType: string;
}

export class HoneywellTccProvider implements HeatingProvider {
  private axiosInstance: AxiosInstance | null = null;
  private credentials: TccCredentials | null = null;
  private userId: string | null = null;
  private locationId: string | null = null;
  private systemId: string | null = null;
  private dhwId: string | null = null;

  // Caching
  private cachedFullStatus: any = null;
  private lastStatusUpdate: DateTime | null = null;
  private readonly CACHE_TTL_MINUTES = 3;

  constructor(private username?: string, private password?: string) {}

  async initialize(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error("Username and password are required for Honeywell TCC provider.");
    }

    await this.login();
    await this.fetchUserInfo();
    await this.fetchInstallationData();
  }

  private async login(refreshToken?: string): Promise<void> {
    Logger.info("Attempting to log in to Honeywell TCC...");
    const headers = {
      'Authorization': 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    
    let body = '';
    if (refreshToken) {
      Logger.debug("Using refresh token for login.");
      body = `grant_type=refresh_token&refresh_token=${refreshToken}`;
    } else {
      Logger.debug("Using username/password for login.");
      body = `grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=${encodeURIComponent(this.username!)}&Password=${encodeURIComponent(this.password!)}`;
    }

    try {
      const response = await axios.post(URL_LOGIN, body, { headers });
      const data = response.data;

      this.credentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type,
        expires: DateTime.now().plus({ seconds: data.expires_in }),
      };

      this.setupAxiosInstance();
      Logger.info("Honeywell TCC: Login successful.");
    } catch (error) {
      Logger.error("Honeywell TCC: Login failed.", error);
      throw error;
    }
  }

  private setupAxiosInstance() {
    this.axiosInstance = axios.create({
      baseURL: URL_API_BASE,
      timeout: 10000,
      headers: {
        'Authorization': `bearer ${this.credentials?.accessToken}`,
        'applicationId': 'b013aa26-9724-4dbd-8897-048b9aada249',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  private async ensureSession(): Promise<void> {
    if (!this.credentials || DateTime.now() > this.credentials.expires.minus({ minutes: 1 })) {
      Logger.debug("Honeywell TCC: Session expired or missing. Refreshing...");
      if (this.credentials?.refreshToken) {
        await this.login(this.credentials.refreshToken);
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

  private async getFullStatus(forceRefresh = false): Promise<any> {
    const now = DateTime.now();
    if (!forceRefresh && this.cachedFullStatus && this.lastStatusUpdate && now.diff(this.lastStatusUpdate, 'minutes').minutes < this.CACHE_TTL_MINUTES) {
      Logger.debug("Honeywell TCC: Using cached status data.");
      return this.cachedFullStatus;
    }

    Logger.debug("Honeywell TCC: Fetching fresh status data from API...");
    await this.ensureSession();
    const response = await this.axiosInstance!.get(`/location/${this.locationId}/status?includeTemperatureControlSystems=True`);
    this.cachedFullStatus = response.data;
    this.lastStatusUpdate = now;
    return this.cachedFullStatus;
  }

  async getZonesStatus(): Promise<ZoneStatus[]> {
    const data = await this.getFullStatus();
    const zonesData = data.gateways[0].temperatureControlSystems[0].zones;
    Logger.debug("Full zonesData from API:", JSON.stringify(zonesData, null, 2));

    return zonesData.map((z: any) => ({
      zoneId: z.zoneId,
      name: z.name,
      setpoint: z.heatSetpointStatus.targetTemperature,
      temperature: z.temperatureStatus.temperature,
      setpointMode: z.heatSetpointStatus.setpointMode,
      until: z.heatSetpointStatus.untilTime,
    }));
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const data = await this.getFullStatus();
    const status = data.gateways[0].temperatureControlSystems[0].systemModeStatus;
    
    return {
        systemMode: status.mode,
        timeUntil: status.untilTime,
        permanent: status.isPermanent
    };
  }

  async getHotWaterStatus(): Promise<DhwStatus | null> {
    if (!this.dhwId) return null;
    const data = await this.getFullStatus();
    const dhw = data.gateways[0].temperatureControlSystems[0].dhw;
    if (!dhw) return null;

    return {
        dhwId: dhw.dhwId,
        state: dhw.stateStatus.state,
        temperature: dhw.temperatureStatus.temperature,
        setpointMode: dhw.stateStatus.mode,
        until: dhw.stateStatus.untilTime
    };
  }

  async getAllSchedules(): Promise<Record<string, ZoneSchedule>> {
    const zones = await this.getZonesStatus();
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
    const response = await this.axiosInstance!.get(`/temperatureZone/${id}/schedule`);
    const data = response.data;

    const dailySchedules: DailySchedule[] = data.dailySchedules.map((ds: any) => ({
      dayOfWeek: ds.dayOfWeek,
      switchpoints: ds.switchpoints.map((sw: any) => ({
        heatSetpoint: sw.heatSetpoint,
        timeOfDay: sw.timeOfDay,
      })),
    }));

    return {
      name: "", 
      schedule: dailySchedules,
    };
  }

  async saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void> {
    await this.ensureSession();
    const body = {
      dailySchedules: schedule.schedule,
    };
    await this.axiosInstance!.put(`/temperatureZone/${zoneId}/schedule`, body);
    Logger.info(`Honeywell TCC: Saved schedule for zone ${zoneId}`);
    this.lastStatusUpdate = null; // Invalidate cache
  }

  async setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void> {
    await this.ensureSession();
    let body: any;

    if (setpoint === 0) {
      body = {
        HeatSetpointValue: null,
        SetpointMode: "FollowSchedule",
        TimeUntil: null,
      };
    } else if (until) {
      body = {
        HeatSetpointValue: setpoint,
        SetpointMode: "TemporaryOverride",
        TimeUntil: until,
      };
    } else {
      body = {
        HeatSetpointValue: setpoint,
        SetpointMode: "PermanentOverride",
        TimeUntil: null,
      };
    }

    await this.axiosInstance!.put(`/temperatureZone/${zoneId}/heatSetpoint`, body);
    Logger.info(`Honeywell TCC: Set setpoint for zone ${zoneId} to ${setpoint}`);
    this.lastStatusUpdate = null; // Invalidate cache
  }

  async setSystemMode(mode: string, until?: string): Promise<void> {
    await this.ensureSession();
    const body = {
      SystemMode: mode,
      TimeUntil: until || null,
      Permanent: until ? false : true,
    };

    await this.axiosInstance!.put(`/temperatureControlSystem/${this.systemId}/mode`, body);
    Logger.info(`Honeywell TCC: Set system mode to ${mode}`);
    this.lastStatusUpdate = null; // Invalidate cache
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
    this.lastStatusUpdate = null; // Invalidate cache
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
        expires: this.credentials?.expires.toISO()
    };
  }
}
