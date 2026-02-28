"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttProvider = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const HoneywellTccProvider_1 = require("./HoneywellTccProvider");
const Logger_1 = require("../utils/Logger");
const ZONES_CACHE_FILE = path_1.default.join(process.cwd(), 'config', 'zones.json');
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
class MqttProvider {
    config;
    client = null;
    zones = {};
    schedules = {};
    system = { systemMode: "Auto", permanent: true };
    dhw = null;
    lastError = null;
    // Mapping of zoneId -> zoneName (snake_case)
    zoneIdToName = {};
    // Reverse mapping for convenience
    nameToZoneId = {};
    // Pending schedule requests: zoneId -> Promise resolver
    pendingSchedules = new Map();
    constructor(config) {
        this.config = config;
        this.loadZoneMapping();
    }
    loadZoneMapping() {
        try {
            if (fs_1.default.existsSync(ZONES_CACHE_FILE)) {
                this.zoneIdToName = JSON.parse(fs_1.default.readFileSync(ZONES_CACHE_FILE, 'utf8'));
                this.updateReverseMapping();
                Logger_1.Logger.info(`MQTT: Loaded ${Object.keys(this.zoneIdToName).length} zone mappings from cache.`);
            }
        }
        catch (e) {
            Logger_1.Logger.error("MQTT: Failed to load zone mapping cache.", e);
        }
    }
    updateReverseMapping() {
        this.nameToZoneId = {};
        for (const [id, name] of Object.entries(this.zoneIdToName)) {
            this.nameToZoneId[name] = id;
        }
    }
    saveZoneMapping() {
        try {
            const dir = path_1.default.dirname(ZONES_CACHE_FILE);
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            fs_1.default.writeFileSync(ZONES_CACHE_FILE, JSON.stringify(this.zoneIdToName, null, 2));
        }
        catch (e) {
            Logger_1.Logger.error("MQTT: Failed to save zone mapping cache.", e);
        }
    }
    async fetchZonesFromHoneywell() {
        try {
            Logger_1.Logger.info("MQTT: Fetching zone mapping from Honeywell API...");
            const honeywell = new HoneywellTccProvider_1.HoneywellTccProvider(this.config.honeywell.username, this.config.honeywell.password);
            await honeywell.initialize();
            const zones = await honeywell.getZonesStatus();
            for (const z of zones) {
                // Convert name to snake_case for MQTT topics
                const snakeName = z.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
                this.zoneIdToName[z.zoneId] = snakeName;
            }
            this.updateReverseMapping();
            this.saveZoneMapping();
            Logger_1.Logger.info(`MQTT: Successfully mapped ${zones.length} zones from Honeywell.`);
        }
        catch (e) {
            Logger_1.Logger.error("MQTT: Failed to fetch zone mapping from Honeywell.", e);
        }
    }
    async initialize() {
        if (Object.keys(this.zoneIdToName).length === 0) {
            await this.fetchZonesFromHoneywell();
        }
        Logger_1.Logger.info(`MQTT: Connecting to broker at ${this.config.mqtt.brokerUrl}...`);
        this.client = mqtt_1.default.connect(this.config.mqtt.brokerUrl, {
            username: this.config.mqtt.username,
            password: this.config.mqtt.password,
            reconnectPeriod: 5000,
            connectTimeout: 10000,
        });
        return new Promise((resolve) => {
            this.client?.on('connect', () => {
                Logger_1.Logger.info("MQTT: Connected successfully.");
                this.lastError = null;
                this.setupSubscriptions();
                resolve();
            });
            this.client?.on('error', (err) => {
                this.lastError = err.message;
                Logger_1.Logger.error("MQTT: Connection error.", err);
                resolve();
            });
            this.client?.on('message', (topic, payload) => {
                this.handleMessage(topic, payload.toString());
            });
        });
    }
    setupSubscriptions() {
        if (!this.client)
            return;
        // Subscribe to command responses
        this.client.subscribe(this.config.mqtt.statusTopic);
        // Subscribe to all zone updates
        this.client.subscribe(`${this.config.mqtt.zonesTopic}/#`);
        // Subscribe to system and dhw status
        this.client.subscribe('evohome/evogateway/system');
        this.client.subscribe('evohome/evogateway/dhw');
        Logger_1.Logger.debug(`MQTT: Subscribed to ${this.config.mqtt.statusTopic}, ${this.config.mqtt.zonesTopic}/#, system and dhw topics.`);
    }
    handleMessage(topic, payload) {
        try {
            const data = JSON.parse(payload);
            // 1. Handle zone schedule updates
            // Topic: evohome/evogateway/zones/<zone_name>/ctl_controller/zone_schedule
            if (topic.endsWith('/zone_schedule')) {
                const parts = topic.split('/');
                const zoneName = parts[parts.length - 3];
                const zoneId = data.zone_idx || this.nameToZoneId[zoneName];
                if (zoneId) {
                    const schedule = this.translateScheduleFromMqtt(data);
                    schedule.name = this.zoneIdToName[zoneId] || zoneName;
                    this.schedules[zoneId] = schedule;
                    // Resolve pending request if any
                    if (this.pendingSchedules.has(zoneId)) {
                        this.pendingSchedules.get(zoneId)(schedule);
                        this.pendingSchedules.delete(zoneId);
                    }
                }
                return;
            }
            // 2. Handle last command status
            if (topic === this.config.mqtt.statusTopic) {
                Logger_1.Logger.debug(`MQTT: Last command status: ${payload}`);
                return;
            }
            // 3. Handle System Status
            if (topic === 'evohome/evogateway/system' && !data.command) {
                this.system = {
                    systemMode: data.system_mode || data.mode || "Auto",
                    timeUntil: data.until,
                    permanent: data.permanent ?? true
                };
                return;
            }
            // 4. Handle DHW Status
            if (topic === 'evohome/evogateway/dhw') {
                this.dhw = {
                    dhwId: data.dhwId || "dhw",
                    state: data.state || "Off",
                    temperature: data.temperature || 0,
                    setpointMode: data.setpointMode || "FollowSchedule",
                    until: data.until
                };
                return;
            }
            // 5. Handle zone status (temp, setpoint)
            // Topic: evohome/evogateway/zones/<zone_name>
            if (topic.startsWith(this.config.mqtt.zonesTopic)) {
                const parts = topic.split('/');
                const zoneName = parts[parts.length - 1];
                if (zoneName === 'ctl_controller' || zoneName === 'zone_schedule')
                    return;
                const zoneId = data.zoneId || this.nameToZoneId[zoneName] || zoneName;
                const originalName = this.zoneIdToName[zoneId] || zoneName;
                this.zones[zoneId] = {
                    zoneId,
                    name: data.name || originalName,
                    temperature: data.temperature || 0,
                    setpoint: data.setpoint || 0,
                    setpointMode: data.setpointMode || 'FollowSchedule',
                    until: data.until
                };
                // Dynamic mapping if we find a new zoneId
                if (data.zoneId && !this.zoneIdToName[data.zoneId]) {
                    this.zoneIdToName[data.zoneId] = zoneName;
                    this.nameToZoneId[zoneName] = data.zoneId;
                    this.saveZoneMapping();
                }
            }
        }
        catch (e) {
            Logger_1.Logger.error(`MQTT: Error parsing message on topic ${topic}`, e);
        }
    }
    translateScheduleFromMqtt(data) {
        const dailySchedules = data.schedule.map((ds) => ({
            dayOfWeek: DAYS[ds.day_of_week] || ds.day_of_week.toString(),
            switchpoints: ds.switchpoints.map((sw) => ({
                heatSetpoint: sw.heat_setpoint,
                timeOfDay: sw.time_of_day
            }))
        }));
        return { name: "", schedule: dailySchedules };
    }
    translateScheduleToMqtt(zoneId, schedule) {
        return {
            command: "set_schedule",
            zone_idx: zoneId,
            schedule: schedule.schedule.map(ds => ({
                day_of_week: DAYS.indexOf(ds.dayOfWeek),
                switchpoints: ds.switchpoints.map(sw => ({
                    time_of_day: sw.timeOfDay,
                    heat_setpoint: sw.heatSetpoint
                }))
            }))
        };
    }
    async getZonesStatus() {
        return Object.values(this.zones);
    }
    async getSystemStatus() {
        return this.system;
    }
    async getHotWaterStatus() {
        return this.dhw;
    }
    async getAllSchedules() {
        return this.schedules;
    }
    async getScheduleForId(id, force = false) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingSchedules.delete(id);
                if (this.schedules[id]) {
                    Logger_1.Logger.warn(`MQTT: Timeout waiting for schedule ${id}, returning cached.`);
                    resolve(this.schedules[id]);
                }
                else {
                    reject(new Error(`Timeout waiting for schedule response for zone ${id}`));
                }
            }, 10000);
            this.pendingSchedules.set(id, (schedule) => {
                clearTimeout(timeout);
                resolve(schedule);
            });
            const command = {
                command: "get_schedule",
                zone_idx: id,
                force_refresh: force
            };
            Logger_1.Logger.info(`MQTT: Requesting schedule for zone ${id} (force=${force})`);
            this.client?.publish(this.config.mqtt.commandTopic, JSON.stringify(command));
        });
    }
    async saveScheduleForZone(zoneId, schedule) {
        const command = this.translateScheduleToMqtt(zoneId, schedule);
        Logger_1.Logger.info(`MQTT: Saving schedule for zone ${zoneId}`);
        this.client?.publish(this.config.mqtt.commandTopic, JSON.stringify(command));
    }
    async setZoneSetpoint(zoneId, setpoint, until) {
        const command = {
            command: "set_setpoint",
            zone_idx: zoneId,
            setpoint: setpoint,
            until: until
        };
        this.client?.publish(this.config.mqtt.commandTopic, JSON.stringify(command));
    }
    async setSystemMode(mode, until) {
        const command = {
            command: "set_system_mode",
            mode: mode,
            until: until
        };
        this.client?.publish(this.config.mqtt.commandTopic, JSON.stringify(command));
    }
    async setHotWaterState(state, until) {
        const command = {
            command: "set_dhw_state",
            state: state,
            until: until
        };
        this.client?.publish(this.config.mqtt.commandTopic, JSON.stringify(command));
    }
    async renewSession() {
        if (this.client) {
            this.client.reconnect();
        }
    }
    getSessionInfo() {
        return {
            provider: "MQTT",
            connected: this.client?.connected || false,
            error: this.lastError,
            zonesMapped: Object.keys(this.zoneIdToName).length
        };
    }
}
exports.MqttProvider = MqttProvider;
//# sourceMappingURL=MqttProvider.js.map