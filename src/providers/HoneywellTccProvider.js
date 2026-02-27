"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HoneywellTccProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const luxon_1 = require("luxon");
const Logger_1 = require("../utils/Logger");
const URL_DOMAIN = "https://mytotalconnectcomfort.com";
const URL_LOGIN = `${URL_DOMAIN}/Auth/OAuth/Token`;
const URL_API_BASE = `${URL_DOMAIN}/WebAPI/emea/api/v1`;
class HoneywellTccProvider {
    username;
    password;
    axiosInstance = null;
    credentials = null;
    userId = null;
    locationId = null;
    systemId = null;
    dhwId = null;
    // Caching
    cachedFullStatus = null;
    lastStatusUpdate = null;
    CACHE_TTL_MINUTES = 3;
    constructor(username, password) {
        this.username = username;
        this.password = password;
    }
    async initialize() {
        if (!this.username || !this.password) {
            throw new Error("Username and password are required for Honeywell TCC provider.");
        }
        await this.login();
        await this.fetchUserInfo();
        await this.fetchInstallationData();
    }
    async login(refreshToken) {
        Logger_1.Logger.info("Attempting to log in to Honeywell TCC...");
        const headers = {
            'Authorization': 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        let body = '';
        if (refreshToken) {
            Logger_1.Logger.debug("Using refresh token for login.");
            body = `grant_type=refresh_token&refresh_token=${refreshToken}`;
        }
        else {
            Logger_1.Logger.debug("Using username/password for login.");
            body = `grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=${encodeURIComponent(this.username)}&Password=${encodeURIComponent(this.password)}`;
        }
        try {
            const response = await axios_1.default.post(URL_LOGIN, body, { headers });
            const data = response.data;
            this.credentials = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenType: data.token_type,
                expires: luxon_1.DateTime.now().plus({ seconds: data.expires_in }),
            };
            this.setupAxiosInstance();
            Logger_1.Logger.info("Honeywell TCC: Login successful.");
        }
        catch (error) {
            Logger_1.Logger.error("Honeywell TCC: Login failed.", error);
            throw error;
        }
    }
    setupAxiosInstance() {
        this.axiosInstance = axios_1.default.create({
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
    async ensureSession() {
        if (!this.credentials || luxon_1.DateTime.now() > this.credentials.expires.minus({ minutes: 1 })) {
            Logger_1.Logger.debug("Honeywell TCC: Session expired or missing. Refreshing...");
            if (this.credentials?.refreshToken) {
                await this.login(this.credentials.refreshToken);
            }
            else {
                await this.login();
            }
        }
    }
    async fetchUserInfo() {
        await this.ensureSession();
        const response = await this.axiosInstance.get('/userAccount');
        this.userId = response.data.userId;
        Logger_1.Logger.debug(`Honeywell TCC: Fetched user ID: ${this.userId}`);
    }
    async fetchInstallationData() {
        await this.ensureSession();
        const response = await this.axiosInstance.get(`/location/installationInfo?userId=${this.userId}&includeTemperatureControlSystems=True`);
        const location = response.data[0];
        this.locationId = location.locationInfo.locationId;
        this.systemId = location.gateways[0].temperatureControlSystems[0].systemId;
        this.dhwId = location.gateways[0].temperatureControlSystems[0].dhw?.dhwId || null;
        Logger_1.Logger.debug(`Honeywell TCC: Initialized with location ${this.locationId}, system ${this.systemId}, DHW ${this.dhwId}`);
    }
    async getFullStatus(forceRefresh = false) {
        const now = luxon_1.DateTime.now();
        if (!forceRefresh && this.cachedFullStatus && this.lastStatusUpdate && now.diff(this.lastStatusUpdate, 'minutes').minutes < this.CACHE_TTL_MINUTES) {
            Logger_1.Logger.debug("Honeywell TCC: Using cached status data.");
            return this.cachedFullStatus;
        }
        Logger_1.Logger.debug("Honeywell TCC: Fetching fresh status data from API...");
        await this.ensureSession();
        const response = await this.axiosInstance.get(`/location/${this.locationId}/status?includeTemperatureControlSystems=True`);
        this.cachedFullStatus = response.data;
        this.lastStatusUpdate = now;
        return this.cachedFullStatus;
    }
    async getZonesStatus() {
        const data = await this.getFullStatus();
        const zonesData = data.gateways[0].temperatureControlSystems[0].zones;
        Logger_1.Logger.debug("Full zonesData from API:", JSON.stringify(zonesData, null, 2));
        return zonesData.map((z) => ({
            zoneId: z.zoneId,
            name: z.name,
            setpoint: z.heatSetpointStatus.targetTemperature,
            temperature: z.temperatureStatus.temperature,
            setpointMode: z.heatSetpointStatus.setpointMode,
            until: z.heatSetpointStatus.untilTime,
        }));
    }
    async getSystemStatus() {
        const data = await this.getFullStatus();
        const status = data.gateways[0].temperatureControlSystems[0].systemModeStatus;
        return {
            systemMode: status.mode,
            timeUntil: status.untilTime,
            permanent: status.isPermanent
        };
    }
    async getHotWaterStatus() {
        if (!this.dhwId)
            return null;
        const data = await this.getFullStatus();
        const dhw = data.gateways[0].temperatureControlSystems[0].dhw;
        if (!dhw)
            return null;
        return {
            dhwId: dhw.dhwId,
            state: dhw.stateStatus.state,
            temperature: dhw.temperatureStatus.temperature,
            setpointMode: dhw.stateStatus.mode,
            until: dhw.stateStatus.untilTime
        };
    }
    async getAllSchedules() {
        const zones = await this.getZonesStatus();
        const allSchedules = {};
        for (const zone of zones) {
            allSchedules[zone.zoneId] = await this.getScheduleForId(zone.zoneId);
        }
        if (this.dhwId) {
            allSchedules[this.dhwId] = await this.getScheduleForId(this.dhwId);
        }
        return allSchedules;
    }
    async getScheduleForId(id) {
        await this.ensureSession();
        const response = await this.axiosInstance.get(`/temperatureZone/${id}/schedule`);
        const data = response.data;
        const dailySchedules = data.dailySchedules.map((ds) => ({
            dayOfWeek: ds.dayOfWeek,
            switchpoints: ds.switchpoints.map((sw) => ({
                heatSetpoint: sw.heatSetpoint,
                timeOfDay: sw.timeOfDay,
            })),
        }));
        return {
            name: "",
            schedule: dailySchedules,
        };
    }
    async saveScheduleForZone(zoneId, schedule) {
        await this.ensureSession();
        const body = {
            dailySchedules: schedule.schedule,
        };
        await this.axiosInstance.put(`/temperatureZone/${zoneId}/schedule`, body);
        Logger_1.Logger.info(`Honeywell TCC: Saved schedule for zone ${zoneId}`);
        this.lastStatusUpdate = null; // Invalidate cache
    }
    async setZoneSetpoint(zoneId, setpoint, until) {
        await this.ensureSession();
        let body;
        if (setpoint === 0) {
            body = {
                HeatSetpointValue: null,
                SetpointMode: "FollowSchedule",
                TimeUntil: null,
            };
        }
        else if (until) {
            body = {
                HeatSetpointValue: setpoint,
                SetpointMode: "TemporaryOverride",
                TimeUntil: until,
            };
        }
        else {
            body = {
                HeatSetpointValue: setpoint,
                SetpointMode: "PermanentOverride",
                TimeUntil: null,
            };
        }
        await this.axiosInstance.put(`/temperatureZone/${zoneId}/heatSetpoint`, body);
        Logger_1.Logger.info(`Honeywell TCC: Set setpoint for zone ${zoneId} to ${setpoint}`);
        this.lastStatusUpdate = null; // Invalidate cache
    }
    async setSystemMode(mode, until) {
        await this.ensureSession();
        const body = {
            SystemMode: mode,
            TimeUntil: until || null,
            Permanent: until ? false : true,
        };
        await this.axiosInstance.put(`/temperatureControlSystem/${this.systemId}/mode`, body);
        Logger_1.Logger.info(`Honeywell TCC: Set system mode to ${mode}`);
        this.lastStatusUpdate = null; // Invalidate cache
    }
    async setHotWaterState(state, until) {
        if (!this.dhwId)
            throw new Error("DHW is not supported by this system.");
        await this.ensureSession();
        const normalizedState = state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
        let body;
        if (normalizedState === "Auto") {
            body = { State: "", Mode: "FollowSchedule", UntilTime: null };
        }
        else if (until) {
            body = { State: normalizedState, Mode: "TemporaryOverride", UntilTime: until };
        }
        else {
            body = { State: normalizedState, Mode: "PermanentOverride", UntilTime: null };
        }
        await this.axiosInstance.put(`/domesticHotWater/${this.dhwId}/state`, body);
        Logger_1.Logger.info(`Honeywell TCC: Set DHW state to ${normalizedState}`);
        this.lastStatusUpdate = null; // Invalidate cache
    }
    async renewSession() {
        if (this.credentials?.refreshToken) {
            await this.login(this.credentials.refreshToken);
        }
        else {
            await this.login();
        }
    }
    getSessionInfo() {
        return {
            userId: this.userId,
            locationId: this.locationId,
            systemId: this.systemId,
            dhwId: this.dhwId,
            expires: this.credentials?.expires.toISO()
        };
    }
}
exports.HoneywellTccProvider = HoneywellTccProvider;
//# sourceMappingURL=HoneywellTccProvider.js.map