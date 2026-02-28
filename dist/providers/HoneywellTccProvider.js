"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HoneywellTccProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const luxon_1 = require("luxon");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Logger_1 = require("../utils/Logger");
const URL_DOMAIN = "https://mytotalconnectcomfort.com";
const URL_LOGIN = `${URL_DOMAIN}/Auth/OAuth/Token`;
const URL_API_BASE = `${URL_DOMAIN}/WebAPI/emea/api/v1`;
const SESSION_FILE = path_1.default.join(process.cwd(), '.session.json');
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
    lastApiFetch = null;
    CACHE_TTL_MINUTES = 3;
    lastFullLogin = null;
    constructor(username, password) {
        this.username = username;
        this.password = password;
    }
    async initialize() {
        if (!this.username || !this.password) {
            throw new Error("Username and password are required for Honeywell TCC provider.");
        }
        const loaded = this.loadSession();
        if (loaded) {
            Logger_1.Logger.info("Honeywell TCC: Loaded existing session from file.");
            this.setupAxiosInstance();
            try {
                await this.fetchUserInfo();
                await this.fetchInstallationData();
                return;
            }
            catch (error) {
                Logger_1.Logger.debug("Honeywell TCC: Existing session invalid or expired. Attempting refresh/login.");
            }
        }
        await this.ensureSession();
        await this.fetchUserInfo();
        await this.fetchInstallationData();
    }
    loadSession() {
        try {
            if (fs_1.default.existsSync(SESSION_FILE)) {
                const data = JSON.parse(fs_1.default.readFileSync(SESSION_FILE, 'utf8'));
                this.credentials = {
                    ...data,
                    expires: luxon_1.DateTime.fromISO(data.expires)
                };
                if (data.lastFullLogin) {
                    this.lastFullLogin = luxon_1.DateTime.fromISO(data.lastFullLogin);
                }
                return true;
            }
        }
        catch (e) {
            Logger_1.Logger.error("Honeywell TCC: Failed to load session file.", e);
        }
        return false;
    }
    saveSession() {
        try {
            const data = {
                accessToken: this.credentials?.accessToken,
                refreshToken: this.credentials?.refreshToken,
                expires: this.credentials?.expires.toISO(),
                tokenType: this.credentials?.tokenType,
                lastFullLogin: this.lastFullLogin?.toISO()
            };
            fs_1.default.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
        }
        catch (e) {
            Logger_1.Logger.error("Honeywell TCC: Failed to save session file.", e);
        }
    }
    async login(refreshToken) {
        const now = luxon_1.DateTime.now();
        if (!refreshToken && this.lastFullLogin && now.diff(this.lastFullLogin, 'minutes').minutes < 15) {
            const waitMins = Math.ceil(15 - now.diff(this.lastFullLogin, 'minutes').minutes);
            Logger_1.Logger.error(`Honeywell TCC: Login rate-limit guard active. Please wait ${waitMins} minutes before full re-authentication.`);
            throw new Error(`Login rate-limit guard active. Wait ${waitMins} mins.`);
        }
        Logger_1.Logger.info(refreshToken ? "Honeywell TCC: Refreshing session..." : "Honeywell TCC: Attempting full login...");
        const headers = {
            'Authorization': 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        let body = '';
        if (refreshToken) {
            body = `grant_type=refresh_token&refresh_token=${refreshToken}`;
        }
        else {
            body = `grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=${encodeURIComponent(this.username)}&Password=${encodeURIComponent(this.password)}`;
            this.lastFullLogin = now;
        }
        try {
            const response = await axios_1.default.post(URL_LOGIN, body, { headers, timeout: 10000 });
            const data = response.data;
            this.credentials = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                tokenType: data.token_type,
                expires: luxon_1.DateTime.now().plus({ seconds: data.expires_in }),
            };
            this.setupAxiosInstance();
            this.saveSession();
            Logger_1.Logger.info("Honeywell TCC: Login/Refresh successful.");
        }
        catch (error) {
            Logger_1.Logger.error("Honeywell TCC: Login/Refresh failed.", error);
            throw error;
        }
    }
    setupAxiosInstance() {
        if (!this.credentials)
            return;
        this.axiosInstance = axios_1.default.create({
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
    async ensureSession() {
        const now = luxon_1.DateTime.now();
        if (!this.credentials || now > this.credentials.expires.minus({ minutes: 5 })) {
            Logger_1.Logger.debug("Honeywell TCC: Session expiring or missing. Refreshing...");
            if (this.credentials?.refreshToken) {
                try {
                    await this.login(this.credentials.refreshToken);
                }
                catch (e) {
                    Logger_1.Logger.debug("Honeywell TCC: Refresh failed. Attempting full login.");
                    await this.login();
                }
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
    async getFullStatus(force = false, preferCache = false) {
        const now = luxon_1.DateTime.now();
        const secondsSinceLastApiFetch = this.lastApiFetch ? now.diff(this.lastApiFetch, 'seconds').seconds : 999;
        const isCacheExpired = secondsSinceLastApiFetch > (this.CACHE_TTL_MINUTES * 60);
        // NEW LOGIC: If preferCache is true AND we have data, use it regardless of expiration (within reason)
        if ((preferCache || !force) && !isCacheExpired && this.cachedFullStatus) {
            Logger_1.Logger.debug(`Honeywell TCC: Using cached data (${Math.round(secondsSinceLastApiFetch)}s old). PreferCache=${preferCache}`);
            return this.cachedFullStatus;
        }
        if (force) {
            Logger_1.Logger.info(`Honeywell TCC: Forced refresh requested. Bypassing cache.`);
        }
        else {
            Logger_1.Logger.debug("Honeywell TCC: Cache expired. Fetching fresh data from API...");
        }
        await this.ensureSession();
        const response = await this.axiosInstance.get(`/location/${this.locationId}/status?includeTemperatureControlSystems=True`);
        this.cachedFullStatus = response.data;
        this.lastApiFetch = now;
        return this.cachedFullStatus;
    }
    async getZonesStatus(force = false, preferCache = false) {
        const data = await this.getFullStatus(force, preferCache);
        const zonesData = data.gateways[0].temperatureControlSystems[0].zones;
        return zonesData.map((z) => ({
            zoneId: z.zoneId,
            name: z.name,
            setpoint: z.heatSetpointStatus?.targetTemperature ?? 0,
            temperature: z.temperatureStatus?.temperature ?? 0,
            setpointMode: z.heatSetpointStatus?.setpointMode ?? 'Unknown',
            until: z.heatSetpointStatus?.untilTime,
        }));
    }
    async getSystemStatus(force = false, preferCache = false) {
        const data = await this.getFullStatus(force, preferCache);
        const status = data.gateways[0].temperatureControlSystems[0].systemModeStatus;
        return { systemMode: status.mode, timeUntil: status.untilTime, permanent: status.isPermanent };
    }
    async getHotWaterStatus(force = false, preferCache = false) {
        if (!this.dhwId)
            return null;
        const data = await this.getFullStatus(force, preferCache);
        const dhw = data.gateways[0].temperatureControlSystems[0].dhw;
        if (!dhw)
            return null;
        return { dhwId: dhw.dhwId, state: dhw.stateStatus.state, temperature: dhw.temperatureStatus.temperature, setpointMode: dhw.stateStatus.mode, until: dhw.stateStatus.untilTime };
    }
    async getAllSchedules(force = false, preferCache = false) {
        // If we prefer cache, we should try to avoid the internal getZonesStatus force too
        const zones = await this.getZonesStatus(force, preferCache);
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
            switchpoints: ds.switchpoints.map((sw) => ({ heatSetpoint: sw.heatSetpoint, timeOfDay: sw.timeOfDay })),
        }));
        return { name: "", schedule: dailySchedules };
    }
    async saveScheduleForZone(zoneId, schedule) {
        await this.ensureSession();
        const body = { dailySchedules: schedule.schedule };
        await this.axiosInstance.put(`/temperatureZone/${zoneId}/schedule`, body);
        Logger_1.Logger.info(`Honeywell TCC: Saved schedule for zone ${zoneId}`);
        this.lastApiFetch = null;
    }
    async setZoneSetpoint(zoneId, setpoint, until) {
        await this.ensureSession();
        let body;
        if (setpoint === 0) {
            body = { HeatSetpointValue: null, SetpointMode: "FollowSchedule", TimeUntil: null };
        }
        else if (until) {
            body = { HeatSetpointValue: setpoint, SetpointMode: "TemporaryOverride", TimeUntil: until };
        }
        else {
            body = { HeatSetpointValue: setpoint, SetpointMode: "PermanentOverride", TimeUntil: null };
        }
        await this.axiosInstance.put(`/temperatureZone/${zoneId}/heatSetpoint`, body);
        Logger_1.Logger.info(`Honeywell TCC: Set setpoint for zone ${zoneId} to ${setpoint}`);
        this.lastApiFetch = null;
    }
    async setSystemMode(mode, until) {
        await this.ensureSession();
        const body = { SystemMode: mode, TimeUntil: until || null, Permanent: until ? false : true };
        await this.axiosInstance.put(`/temperatureControlSystem/${this.systemId}/mode`, body);
        Logger_1.Logger.info(`Honeywell TCC: Set system mode to ${mode}`);
        this.lastApiFetch = null;
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
        this.lastApiFetch = null;
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
            expires: this.credentials?.expires.toISO(),
            lastFullLogin: this.lastFullLogin?.toISO()
        };
    }
}
exports.HoneywellTccProvider = HoneywellTccProvider;
//# sourceMappingURL=HoneywellTccProvider.js.map