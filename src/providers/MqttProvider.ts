import mqtt, { MqttClient } from 'mqtt';
import path from 'path';
import fs from 'fs';
import {
  HeatingProvider,
  ZoneStatus,
  ZoneSchedule,
  DailySchedule,
  SystemStatus,
  DhwStatus,
  Switchpoint
} from './HeatingProvider';
import { Logger } from '../utils/Logger';

const ZONES_CACHE_FILE = path.join(process.cwd(), 'data', 'zones.json');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export class MqttProvider implements HeatingProvider {
  private client: MqttClient | null = null;
  private zones: Record<string, ZoneStatus> = {};
  private schedules: Record<string, ZoneSchedule> = {};
  private system: SystemStatus = { systemMode: "Auto", permanent: true };
  private dhw: DhwStatus | null = null;
  private lastError: string | null = null;
  private gatewayStatus: string = "Unknown";

  // Mapping of zoneId -> { name, label, honeywellId }
  private zoneIdToMapping: Record<string, { name: string, label: string, honeywellId: string }> = {};
  // Reverse mapping: label -> zoneId
  private labelToZoneId: Record<string, string> = {};

  // Pending schedule requests: zoneId -> Promise resolver
  private pendingSchedules: Map<string, (schedule: ZoneSchedule) => void> = new Map();
  private scheduleTimestamps: Record<string, Date> = {};

  // Derived topics
  private base: string;
  private commandTopic: string;
  private statusTopic: string;
  private zonesTopic: string;
  private dhwTopic: string;
  private systemTopic: string;
  private gatewayStatusTopic: string;

  constructor(private config: any) {
    this.base = config.baseTopic;
    this.commandTopic = `${this.base}/system/_command`;
    this.statusTopic = `${this.commandTopic}/_lastcommand`;
    this.zonesTopic = `${this.base}/${config.zonesSubtopic}`;
    this.dhwTopic = `${this.base}/${config.dhwSubtopic}`;
    this.systemTopic = `${this.base}/system`;
    this.gatewayStatusTopic = `${this.base}/status`;
    Logger.debug(`MQTT: Gateway status topic: ${this.gatewayStatusTopic}`);

    this.dhw = {
        dhwId: "dhw",
        state: "Unknown",
        temperature: 0,
        setpointMode: "Unknown"
    };
    this.loadZoneMapping();
  }

  public loadZoneMapping() {
    try {
      if (fs.existsSync(ZONES_CACHE_FILE)) {
        this.zoneIdToMapping = JSON.parse(fs.readFileSync(ZONES_CACHE_FILE, 'utf8'));
        this.updateReverseMapping();
        
        // Pre-populate zones object
        for (const [id, mapping] of Object.entries(this.zoneIdToMapping)) {
            if (!this.zones[id]) {
                this.zones[id] = {
                    zoneId: id,
                    name: mapping.name,
                    label: mapping.label,
                    temperature: 0,
                    setpoint: 0,
                    setpointMode: 'Unknown'
                };
            }
        }
        
        Logger.info(`MQTT: Loaded ${Object.keys(this.zoneIdToMapping).length} zone mappings from cache.`);
      } else {
        Logger.warn("MQTT: No zone mapping cache found. Please sync from Honeywell Cloud first.");
      }
    } catch (e) {
      Logger.error("MQTT: Failed to load zone mapping cache.", e);
    }
  }

  private updateReverseMapping() {
    this.labelToZoneId = {};
    for (const [id, mapping] of Object.entries(this.zoneIdToMapping)) {
        this.labelToZoneId[mapping.label] = id;
    }
  }

  private saveZoneMapping() {
    try {
      const dir = path.dirname(ZONES_CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ZONES_CACHE_FILE, JSON.stringify(this.zoneIdToMapping, null, 2));
    } catch (e) {
      Logger.error("MQTT: Failed to save zone mapping cache.", e);
    }
  }

  async initialize(): Promise<void> {
    if (this.client) return;

    return new Promise((resolve, reject) => {
      Logger.info(`MQTT: Connecting to broker at ${this.config.brokerUrl}...`);
      
      this.client = mqtt.connect(this.config.brokerUrl, {
        username: this.config.username,
        password: this.config.password,
        reconnectPeriod: this.config.reconnectPeriod,
        connectTimeout: this.config.connectTimeout,
      });

      let resolved = false;

      this.client.on('connect', () => {
        Logger.info("MQTT: Connected to broker.");
        this.lastError = null;
        this.setupSubscriptions();
        
        // Give a short window for retained messages to arrive before resolving
        if (!resolved) {
            resolved = true;
            setTimeout(resolve, this.config.retainedWindow);
        }
      });

      this.client.on('error', (err) => {
        Logger.error("MQTT: Connection error:", err);
        this.lastError = err.message;
        if (!resolved) {
            resolved = true;
            reject(err);
        }
      });

      this.client.on('message', (topic, payload) => {
        this.handleMessage(topic, payload.toString());
      });
    });
  }

  private setupSubscriptions(): void {
    if (!this.client) return;

    // Command status
    this.client.subscribe(this.statusTopic);

    // Zones
    this.client.subscribe(`${this.zonesTopic}/+`);
    this.client.subscribe(`${this.zonesTopic}/+/ctl_controller/setpoint`);
    this.client.subscribe(`${this.zonesTopic}/+/ctl_controller/temperature`);
    this.client.subscribe(`${this.zonesTopic}/+/ctl_controller/zone_mode`);
    this.client.subscribe(`${this.zonesTopic}/+/+/zone_schedule`);
    this.client.subscribe(`${this.zonesTopic}/+/+/zone_schedule/zone_schedule_ts`);
    this.client.subscribe(`${this.dhwTopic}/+/zone_schedule/zone_schedule_ts`);

    // DHW
    this.client.subscribe(`${this.dhwTopic}/+/zone_schedule`);
    this.client.subscribe(`${this.zonesTopic}/_dhw/ctl_controller/dhw_mode`);
    this.client.subscribe(`${this.zonesTopic}/_dhw/dhw_wireless_sender/dhw_temp`);
    this.client.subscribe(this.dhwTopic);
    this.client.subscribe(`${this.base}/_dhw`);

    // System and Gateway Status
    this.client.subscribe(this.systemTopic);
    this.client.subscribe(this.gatewayStatusTopic);

    Logger.info(`MQTT: Subscribed to topics under ${this.base}`);
  }

  private handleMessage(topic: string, payload: string): void {
    // Only ignore timestamp topics
    if (topic.endsWith('_ts')) {
        if (topic.endsWith('/zone_schedule_ts')) {
            const parts = topic.split('/');
            const zoneLabel = parts[parts.length - 4] || parts[parts.length - 3];
            const zoneId = this.labelToZoneId[zoneLabel] || zoneLabel;
            try {
                const raw = payload.trim().replace(/^"|"$/g, '');
                const asFloat = parseFloat(raw);
                const date = !isNaN(asFloat) && asFloat > 1e9 ? new Date(asFloat * 1000) : new Date(raw);
                if (!isNaN(date.getTime())) {
                    this.scheduleTimestamps[zoneId] = date;
                    if (zoneLabel !== zoneId) this.scheduleTimestamps[zoneLabel] = date;
                    // Embed into stored schedules so fetchedAt travels with the schedule object
                    const iso = date.toISOString();
                    if (this.schedules[zoneId]) this.schedules[zoneId] = { ...this.schedules[zoneId], fetchedAt: iso };
                    if (zoneLabel !== zoneId && this.schedules[zoneLabel]) this.schedules[zoneLabel] = { ...this.schedules[zoneLabel], fetchedAt: iso };
                    Logger.silly(`MQTT: Schedule timestamp for ${zoneLabel}: ${iso}`);
                }
            } catch { /* ignore malformed */ }
        }
        return;
    }

    // 1. Gateway status (often just a string "Online"/"Offline" or JSON)
    if (topic === this.gatewayStatusTopic) {
        try {
            const data = JSON.parse(payload);
            this.gatewayStatus = data.status || data.state || data.gateway || payload;
        } catch (e) {
            this.gatewayStatus = payload;
        }
        Logger.info(`MQTT: Gateway status updated to: ${this.gatewayStatus}`);
        return;
    }

    try {
        // 2. Command status
        if (topic === this.statusTopic) {
            Logger.debug(`MQTT: Last command status: ${payload}`);
            return;
        }

        // --- Handle values (JSON based on logs) ---
        if ((topic.endsWith('/setpoint') || topic.endsWith('/temperature') || topic.endsWith('/zone_mode') || 
            topic.endsWith('/dhw_mode') || topic.endsWith('/dhw_temp')) && topic !== this.gatewayStatusTopic) {
            const parts = topic.split('/');
            const zoneLabel = parts[parts.length - 3]; // Topic is zones/label/ctl/field
            
            try {
                const valData = JSON.parse(payload);

                if (topic.endsWith('/dhw_mode') || topic.endsWith('/dhw_temp')) {
                    if (!this.dhw) this.dhw = { dhwId: "dhw", state: "Off", temperature: 0, setpointMode: "Following Schedule" };
                    
                    if (topic.endsWith('/dhw_mode')) {
                        const modeMap: Record<string, string> = {
                            'follow_schedule': 'Following Schedule',
                            'temporary_override': 'Temporary Override',
                            'permanent_override': 'Permanent Override'
                        };
                        this.dhw.setpointMode = modeMap[valData.mode] || valData.mode || 'Following Schedule';
                        this.dhw.until = valData.until;
                        if (valData.active !== undefined) {
                            this.dhw.state = valData.active ? "On" : "Off";
                            Logger.debug(`MQTT: Updated DHW state to ${this.dhw.state} from ${topic} (active=${valData.active})`);
                        }
                    } else if (topic.endsWith('/dhw_temp')) {
                        const temp = typeof valData === 'number' ? valData : valData.temperature;
                        if (temp !== undefined) this.dhw.temperature = temp;
                    }
                    return;
                }

                // Use zone_idx if present to find the internal ID (decimal)
                const zoneId = valData.zone_idx ? parseInt(valData.zone_idx, 16).toString().padStart(2, '0') : this.labelToZoneId[zoneLabel];
                
                if (zoneId && this.zones[zoneId]) {
                    if (topic.endsWith('/setpoint')) {
                        this.zones[zoneId].setpoint = valData.setpoint;
                    } else if (topic.endsWith('/temperature')) {
                        this.zones[zoneId].temperature = valData.temperature;
                    } else if (topic.endsWith('/zone_mode')) {
                        const modeMap: Record<string, string> = {
                            'follow_schedule': 'Following Schedule',
                            'temporary_override': 'Temporary Override',
                            'permanent_override': 'Permanent Override'
                        };
                        this.zones[zoneId].setpointMode = modeMap[valData.mode] || valData.mode || 'Unknown';
                        this.zones[zoneId].until = valData.until;
                    }
                }
            } catch (e) {
                const zoneId = this.labelToZoneId[zoneLabel];
                const val = parseFloat(payload);
                if (!isNaN(val)) {
                    if (topic.endsWith('/dhw_temp')) {
                        if (!this.dhw) this.dhw = { dhwId: "dhw", state: "Off", temperature: 0, setpointMode: "Following Schedule" };
                        this.dhw.temperature = val;
                    } else if (zoneId && this.zones[zoneId]) {
                        if (topic.endsWith('/setpoint')) this.zones[zoneId].setpoint = val;
                        else if (topic.endsWith('/temperature')) this.zones[zoneId].temperature = val;
                    }
                }
            }
            return;
        }

        const data = JSON.parse(payload);
        
        // Schedules
        if (topic.endsWith('/zone_schedule')) {
            if (!data.schedule) return;

            const parts = topic.split('/');
            const zoneLabel = parts[parts.length - 3] || parts[parts.length - 2]; 
            const zoneId = (data.zone_idx === 'DH' || data.zone_idx === 'HW') ? 'dhw' : (data.zone_idx ? parseInt(data.zone_idx, 16).toString().padStart(2, '0') : this.labelToZoneId[zoneLabel]);
            
            const resolvedId = zoneId || zoneLabel;
            if (resolvedId) {
                // If zone_idx gave us a confirmed numeric ID and the label isn't yet mapped,
                // record it now — zone_schedule is the most reliable source for label→ID
                if (zoneId && zoneLabel && zoneLabel !== zoneId && !this.labelToZoneId[zoneLabel]) {
                    this.labelToZoneId[zoneLabel] = zoneId;
                    // Migrate any _ts timestamp stored under the label before this mapping was known
                    if (this.scheduleTimestamps[zoneLabel] && !this.scheduleTimestamps[zoneId]) {
                        this.scheduleTimestamps[zoneId] = this.scheduleTimestamps[zoneLabel];
                        Logger.debug(`MQTT: Migrated schedule timestamp from label "${zoneLabel}" to zone ID ${zoneId}`);
                    }
                }

                const schedule = this.translateScheduleFromMqtt(data);
                schedule.name = resolvedId === 'dhw' ? "Hot Water" : (this.zoneIdToMapping[resolvedId]?.name || zoneLabel);
                // Cache under both the derived zone ID and the topic label for resilient lookups
                if (zoneId) this.schedules[zoneId] = schedule;
                if (zoneLabel && zoneLabel !== zoneId) this.schedules[zoneLabel] = schedule;

                const pendingKey = this.pendingSchedules.has(zoneId) ? zoneId
                                 : this.pendingSchedules.has(zoneLabel) ? zoneLabel
                                 : null;
                if (pendingKey) {
                    // Mark the fetch time now — this was an explicit request, not a retained message
                    const fetchedAt = this.scheduleTimestamps[pendingKey] ?? new Date();
                    this.scheduleTimestamps[pendingKey] = fetchedAt;
                    this.pendingSchedules.get(pendingKey)!(schedule);
                    this.pendingSchedules.delete(pendingKey);
                }
            }
            return;
        }

        // System status
        if (topic === this.systemTopic && !data.command) {
            this.system = {
                systemMode: data.system_mode || data.mode || "Auto",
                timeUntil: data.until,
                permanent: data.permanent ?? true
            };
            return;
        }

        // DHW status
        if (topic.includes('/_dhw') || topic === this.dhwTopic || topic === `${this.base}/_dhw`) {
            if (!this.dhw) this.dhw = { dhwId: "dhw", state: "Off", temperature: 0, setpointMode: "Following Schedule" };

            if (topic.endsWith('/dhw_mode')) {
                const modeMap: Record<string, string> = {
                    'follow_schedule': 'Following Schedule',
                    'temporary_override': 'Temporary Override',
                    'permanent_override': 'Permanent Override'
                };
                this.dhw.setpointMode = modeMap[data.mode] || data.mode || 'Following Schedule';
                this.dhw.until = data.until;
                if (data.active !== undefined) {
                    this.dhw.state = data.active ? "On" : "Off";
                    Logger.debug(`MQTT: Updated DHW state to ${this.dhw.state} from ${topic} (active=${data.active}, secondary block)`);
                }
            } else if (topic.endsWith('/dhw_temp')) {
                const temp = typeof data === 'number' ? data : data.temperature;
                if (temp !== undefined) this.dhw.temperature = temp;
            } else {
                if (data.state !== undefined && data.state !== null) {
                    this.dhw.state = data.state;
                    Logger.debug(`MQTT: Updated DHW state to ${this.dhw.state} from ${topic} (legacy)`);
                }
                if (data.temperature !== undefined && data.temperature !== null) this.dhw.temperature = data.temperature;
                if (data.setpointMode !== undefined && data.setpointMode !== null) this.dhw.setpointMode = data.setpointMode;
                if (data.until !== undefined && data.until !== null) this.dhw.until = data.until;
            }
            return;
        }

        // Generic Zone status (direct under zonesTopic)
        if (topic.startsWith(this.zonesTopic)) {
            const subPath = topic.substring(this.zonesTopic.length + 1);
            if (subPath && !subPath.includes('/')) {
                const zoneLabel = subPath;
                const rawZoneId = data.zoneId ? (data.zoneId.length > 2 ? this.labelToZoneId[zoneLabel] : data.zoneId) : this.labelToZoneId[zoneLabel];
                const zoneId = (rawZoneId && /^\d+$/.test(rawZoneId)) ? rawZoneId.padStart(2, '0') : rawZoneId;
                const finalZoneId = zoneId || zoneLabel;
                const friendlyName = this.zoneIdToMapping[finalZoneId]?.name || zoneLabel;
                
                const modeMap: Record<string, string> = {
                    'follow_schedule': 'Following Schedule',
                    'temporary_override': 'Temporary Override',
                    'permanent_override': 'Permanent Override'
                };

                this.zones[finalZoneId] = {
                    zoneId: finalZoneId,
                    name: data.name || friendlyName,
                    label: this.zoneIdToMapping[finalZoneId]?.label || zoneLabel,
                    temperature: data.temperature || 0,
                    setpoint: data.setpoint || 0,
                    setpointMode: modeMap[data.mode] || modeMap[data.setpointMode] || data.setpointMode || data.mode || 'Following Schedule',
                    until: data.until
                };

                // If we found a mismatch (different label for same ID) or new mapping, update the cache
                if (rawZoneId && (!this.zoneIdToMapping[zoneId] || this.zoneIdToMapping[zoneId].label !== zoneLabel)) {
                    Logger.info(`MQTT: Mapping discovered/updated for ${zoneLabel} to zone ID ${zoneId}`);
                    this.zoneIdToMapping[zoneId] = {
                        name: data.name || (this.zoneIdToMapping[zoneId]?.name) || zoneLabel,
                        label: zoneLabel,
                        honeywellId: this.zoneIdToMapping[zoneId]?.honeywellId || ""
                    };
                    this.labelToZoneId[zoneLabel] = zoneId;
                    this.saveZoneMapping();
                }
            }
        }

    } catch (e) {
        const expectedJson = topic.endsWith('/zone_schedule') || 
                             topic === this.systemTopic || 
                             topic === this.dhwTopic ||
                             topic === `${this.base}/_dhw` ||
                             !topic.includes('/', this.zonesTopic.length + 1);
        
        if (expectedJson) {
            Logger.error(`MQTT: Error parsing JSON on topic ${topic}`, e);
        }
    }
  }

  private translateScheduleFromMqtt(data: any): ZoneSchedule {
    const dailySchedules: DailySchedule[] = data.schedule.map((ds: any) => ({
      dayOfWeek: DAYS[ds.day_of_week] || ds.day_of_week.toString(),
      switchpoints: ds.switchpoints.map((sw: any) => {
          const sp: any = { timeOfDay: sw.time_of_day };
          if (sw.state !== undefined) sp.state = sw.state;
          if (sw.enabled !== undefined) sp.state = sw.enabled ? "On" : "Off";
          if (sw.heat_setpoint !== undefined) sp.heatSetpoint = sw.heat_setpoint;
          return sp;
      })
    }));
    return { name: "", schedule: dailySchedules };
  }

  private translateScheduleToMqtt(zoneId: string, schedule: ZoneSchedule): any {
    const isDhw = zoneId === 'HW' || zoneId === 'DH';
    return {
      command: "set_schedule",
      zone_idx: zoneId,
      schedule: schedule.schedule.map(ds => ({
        day_of_week: DAYS.indexOf(ds.dayOfWeek),
        switchpoints: ds.switchpoints.map(sw => {
            const sp: any = { time_of_day: sw.timeOfDay };
            if (isDhw) {
                if (sw.state !== undefined) {
                    sp.enabled = (sw.state === "On" || (sw.state as any) === true);
                } else if (sw.heatSetpoint !== undefined) {
                    sp.enabled = sw.heatSetpoint > 0;
                }
            } else {
                if (sw.heatSetpoint !== undefined) sp.heat_setpoint = sw.heatSetpoint;
            }
            return sp;
        })
      }))
    };
  }

  async getZonesStatus(): Promise<ZoneStatus[]> {
    return Object.values(this.zones);
  }

  async getSystemStatus(): Promise<SystemStatus> {
    return this.system;
  }

  async getHotWaterStatus(): Promise<DhwStatus | null> {
    return this.dhw;
  }

  async getAllSchedules(): Promise<Record<string, ZoneSchedule>> {
    const result: Record<string, ZoneSchedule> = {};
    for (const [id, schedule] of Object.entries(this.schedules)) {
        // fetchedAt is embedded when _ts arrives; fall back to scheduleTimestamps for the
        // edge case where _ts arrived before zone_schedule (schedule object didn't exist yet)
        result[id] = { ...schedule, fetchedAt: schedule.fetchedAt ?? this.scheduleTimestamps[id]?.toISOString() };
    }
    return result;
  }

  async getScheduleForId(id: string, force = false): Promise<ZoneSchedule> {
    if (!force && this.schedules[id]) {
        const s = this.schedules[id];
        return { ...s, fetchedAt: s.fetchedAt ?? this.scheduleTimestamps[id]?.toISOString() };
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            this.pendingSchedules.delete(id);
            if (this.schedules[id]) resolve(this.schedules[id]);
            else reject(new Error(`Timeout waiting for schedule response for zone ${id}`));
        }, this.config.scheduleTimeout);

        this.pendingSchedules.set(id, (schedule) => {
            clearTimeout(timeout);
            resolve({ ...schedule, fetchedAt: this.scheduleTimestamps[id]?.toISOString() });
        });

        const hexId = id === 'dhw' ? 'HW' : parseInt(id, 10).toString(16).toUpperCase().padStart(2, '0');
        const command = { command: "get_schedule", zone_idx: hexId, force_refresh: force };
        this.client?.publish(this.commandTopic, JSON.stringify(command));
    });
  }

  async saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void> {
    const hexId = zoneId === 'dhw' ? 'HW' : parseInt(zoneId, 10).toString(16).toUpperCase().padStart(2, '0');
    const command = this.translateScheduleToMqtt(hexId, schedule);
    this.client?.publish(this.commandTopic, JSON.stringify(command));
  }

  async setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void> {
    const command = { command: "set_setpoint", zone_idx: zoneId, setpoint: setpoint, until: until };
    this.client?.publish(this.commandTopic, JSON.stringify(command));
  }

  async setSystemMode(mode: string, until?: string): Promise<void> {
    const command = { command: "set_system_mode", mode: mode, until: until };
    this.client?.publish(this.commandTopic, JSON.stringify(command));
  }

  async setHotWaterState(state: string, until?: string): Promise<void> {
    const command = { command: "set_dhw_state", state: state, until: until };
    this.client?.publish(this.commandTopic, JSON.stringify(command));
  }

  async renewSession(): Promise<void> {
    if (this.client) this.client.reconnect();
  }

  getSessionInfo(): any {
    return { 
        provider: "MQTT",
        connected: this.client?.connected || false,
        error: this.lastError,
        gatewayStatus: this.gatewayStatus,
        zonesMapped: Object.keys(this.zoneIdToMapping).length
    };
  }
}
