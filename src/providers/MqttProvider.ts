import mqtt, { MqttClient } from 'mqtt';
import fs from 'fs';
import path from 'path';
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

const ZONES_CACHE_FILE = path.join(process.cwd(), 'config', 'zones.json');

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export class MqttProvider implements HeatingProvider {
  private client: MqttClient | null = null;
  private zones: Record<string, ZoneStatus> = {};
  private schedules: Record<string, ZoneSchedule> = {};
  private system: SystemStatus = { systemMode: "Auto", permanent: true };
  private dhw: DhwStatus | null = null;
  private lastError: string | null = null;
  
  // Mapping of zoneId -> { name, label, honeywellId }
  private zoneIdToMapping: Record<string, { name: string, label: string, honeywellId: string }> = {};
  // Reverse mapping: label -> zoneId
  private labelToZoneId: Record<string, string> = {};

  // Pending schedule requests: zoneId -> Promise resolver
  private pendingSchedules: Map<string, (schedule: ZoneSchedule) => void> = new Map();

  constructor(private config: any) {
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
    Logger.info(`MQTT: Connecting to broker at ${this.config.brokerUrl}...`);
    
    this.client = mqtt.connect(this.config.brokerUrl, {
      username: this.config.username,
      password: this.config.password,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    return new Promise((resolve) => {
      this.client?.on('connect', () => {
        Logger.info("MQTT: Connected successfully.");
        this.lastError = null;
        this.setupSubscriptions();
        resolve();
      });

      this.client?.on('error', (err) => {
        this.lastError = err.message;
        Logger.error("MQTT: Connection error.", err);
        resolve(); 
      });

      this.client?.on('message', (topic, payload) => {
        this.handleMessage(topic, payload.toString());
      });
    });
  }

  private setupSubscriptions(): void {
    if (!this.client) return;
    
    // Subscribe to command responses
    this.client.subscribe(this.config.statusTopic);
    
    // Subscribe specifically to zone status (level 4)
    this.client.subscribe(`${this.config.zonesTopic}/+`);

    // Subscribe to detailed zone status (level 6)
    this.client.subscribe(`${this.config.zonesTopic}/+/ctl_controller/setpoint`);
    this.client.subscribe(`${this.config.zonesTopic}/+/ctl_controller/temperature`);
    this.client.subscribe(`${this.config.zonesTopic}/+/ctl_controller/zone_mode`);

    // Subscribe specifically to zone schedules (level 6)
    this.client.subscribe(`${this.config.zonesTopic}/+/+/zone_schedule`);

    // Subscribe to system and dhw status
    this.client.subscribe('evohome/evogateway/system');
    this.client.subscribe('evohome/evogateway/dhw');
    this.client.subscribe('evohome/evogateway/_dhw');
    
    Logger.debug(`MQTT: Optimized subscriptions setup.`);
  }

  private handleMessage(topic: string, payload: string): void {
    if (topic.includes('/_') || topic.endsWith('_ts') || topic.endsWith('/active')) {
        return;
    }

    try {
        // 2. Handle last command status (might not be JSON)
        if (topic === this.config.statusTopic) {
            Logger.debug(`MQTT: Last command status: ${payload}`);
            return;
        }

        // --- Handle values (JSON based on logs) ---
        if (topic.endsWith('/setpoint') || topic.endsWith('/temperature') || topic.endsWith('/zone_mode')) {
            const parts = topic.split('/');
            const zoneLabel = parts[3];
            
            try {
                const valData = JSON.parse(payload);
                // Use zone_idx if present to find the internal ID (decimal)
                const zoneId = valData.zone_idx ? parseInt(valData.zone_idx, 16).toString().padStart(2, '0') : this.labelToZoneId[zoneLabel];
                
                if (zoneId && this.zones[zoneId]) {
                    if (topic.endsWith('/setpoint')) {
                        this.zones[zoneId].setpoint = valData.setpoint;
                    } else if (topic.endsWith('/temperature')) {
                        this.zones[zoneId].temperature = valData.temperature;
                    } else if (topic.endsWith('/zone_mode')) {
                        // Map internal mode names to friendly labels
                        Logger.debug(`MQTT: Raw zone_mode for ${zoneLabel}: ${JSON.stringify(valData)}`);
                        const modeMap: Record<string, string> = {
                            'follow_schedule': 'Following Schedule',
                            'temporary_override': 'Temporary Override',
                            'permanent_override': 'Permanent Override'
                        };
                        this.zones[zoneId].setpointMode = modeMap[valData.mode] || valData.mode || 'Unknown';
                        this.zones[zoneId].until = valData.until;
                        Logger.debug(`MQTT: Updated ${zoneLabel} mode to ${this.zones[zoneId].setpointMode}`);
                    }
                    
                    // If we found a mismatch (different label for same ID), update the mapping
                    if (!this.labelToZoneId[zoneLabel]) {
                        Logger.info(`MQTT: Mapping discovered label ${zoneLabel} to zone ID ${zoneId}`);
                        this.labelToZoneId[zoneLabel] = zoneId;
                        if (this.zoneIdToMapping[zoneId]) {
                            this.zoneIdToMapping[zoneId].label = zoneLabel;
                            this.saveZoneMapping();
                        }
                    }
                }
            } catch (e) {
                const zoneId = this.labelToZoneId[zoneLabel];
                const val = parseFloat(payload);
                if (!isNaN(val) && zoneId && this.zones[zoneId]) {
                    if (topic.endsWith('/setpoint')) this.zones[zoneId].setpoint = val;
                    else if (topic.endsWith('/temperature')) this.zones[zoneId].temperature = val;
                }
            }
            return;
        }

        const data = JSON.parse(payload);
        
        if (topic.endsWith('/zone_schedule')) {
            if (!data.schedule) {
                Logger.debug(`MQTT: Ignoring fragment status for ${topic}`);
                return;
            }

            const parts = topic.split('/');
            const zoneLabel = parts[3]; 
            // Input zone_idx might be hex (e.g. "0A" or "DH"), we map everything internally to decimal strings (e.g. "10") or "dhw"
            const zoneId = data.zone_idx === 'DH' ? 'dhw' : (data.zone_idx ? parseInt(data.zone_idx, 16).toString().padStart(2, '0') : this.labelToZoneId[zoneLabel]);
            
            if (zoneId) {
                const schedule = this.translateScheduleFromMqtt(data);
                schedule.name = zoneId === 'dhw' ? "Hot Water" : (this.zoneIdToMapping[zoneId]?.name || zoneLabel);
                this.schedules[zoneId] = schedule;
                
                if (this.pendingSchedules.has(zoneId)) {
                    this.pendingSchedules.get(zoneId)!(schedule);
                    this.pendingSchedules.delete(zoneId);
                }
            }
            return;
        }

        if (topic === 'evohome/evogateway/system' && !data.command) {
            this.system = {
                systemMode: data.system_mode || data.mode || "Auto",
                timeUntil: data.until,
                permanent: data.permanent ?? true
            };
            return;
        }

        if (topic === 'evohome/evogateway/dhw' || topic === 'evohome/evogateway/_dhw' || topic.endsWith('/_dhw')) {
            this.dhw = {
                dhwId: "dhw",
                state: data.state || "Off",
                temperature: data.temperature || 0,
                setpointMode: data.setpointMode || "FollowSchedule",
                until: data.until
            };
            return;
        }

        const zonesTopicRoot = this.config.zonesTopic;
        if (topic.startsWith(zonesTopicRoot)) {
            const subPath = topic.substring(zonesTopicRoot.length + 1);
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

                if (rawZoneId && !this.zoneIdToMapping[zoneId]) {
                    this.zoneIdToMapping[zoneId] = { 
                        name: data.name || zoneLabel, 
                        label: zoneLabel, 
                        honeywellId: "" 
                    };
                    this.labelToZoneId[zoneLabel] = zoneId;
                    this.saveZoneMapping();
                }
            }
        }

    } catch (e) {
        const expectedJson = topic.endsWith('/zone_schedule') || 
                             topic === 'evohome/evogateway/system' || 
                             topic === 'evohome/evogateway/dhw' ||
                             topic === 'evohome/evogateway/_dhw' ||
                             !topic.includes('/', (this.config.zonesTopic?.length || 0) + 1);
        
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
          if (sw.heat_setpoint !== undefined) sp.heatSetpoint = sw.heat_setpoint;
          return sp;
      })
    }));
    return { name: "", schedule: dailySchedules };
  }

  private translateScheduleToMqtt(zoneId: string, schedule: ZoneSchedule): any {
    return {
      command: "set_schedule",
      zone_idx: zoneId,
      schedule: schedule.schedule.map(ds => ({
        day_of_week: DAYS.indexOf(ds.dayOfWeek),
        switchpoints: ds.switchpoints.map(sw => {
            const sp: any = { time_of_day: sw.timeOfDay };
            if (sw.state !== undefined) sp.state = sw.state;
            if (sw.heatSetpoint !== undefined) sp.heat_setpoint = sw.heatSetpoint;
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
    return this.schedules;
  }

  async getScheduleForId(id: string, force = false): Promise<ZoneSchedule> {
    // If we have it in cache and not forcing refresh, return immediately
    if (!force && this.schedules[id]) {
        Logger.debug(`MQTT: Returning cached schedule for zone ${id}`);
        return this.schedules[id];
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            this.pendingSchedules.delete(id);
            if (this.schedules[id]) {
                Logger.warn(`MQTT: Timeout waiting for schedule ${id}, returning cached.`);
                resolve(this.schedules[id]);
            } else {
                reject(new Error(`Timeout waiting for schedule response for zone ${id}`));
            }
        }, 10000);

        this.pendingSchedules.set(id, (schedule) => {
            clearTimeout(timeout);
            resolve(schedule);
        });

        const hexId = id === 'dhw' ? 'DH' : parseInt(id, 10).toString(16).toUpperCase().padStart(2, '0');

        const command = {
            command: "get_schedule",
            zone_idx: hexId,
            force_refresh: force
        };

        Logger.info(`MQTT: Requesting schedule for zone ${id} (hex=${hexId}, force=${force})`);
        this.client?.publish(this.config.commandTopic, JSON.stringify(command));
    });
  }

  async saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void> {
    const hexId = zoneId === 'dhw' ? 'DH' : parseInt(zoneId, 10).toString(16).toUpperCase().padStart(2, '0');
    const command = this.translateScheduleToMqtt(hexId, schedule);
    Logger.info(`MQTT: Saving schedule for ${zoneId} (hex=${hexId})`);
    this.client?.publish(this.config.commandTopic, JSON.stringify(command));
  }

  async setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void> {
    const command = {
        command: "set_setpoint",
        zone_idx: zoneId,
        setpoint: setpoint,
        until: until
    };
    this.client?.publish(this.config.commandTopic, JSON.stringify(command));
  }

  async setSystemMode(mode: string, until?: string): Promise<void> {
    const command = {
        command: "set_system_mode",
        mode: mode,
        until: until
    };
    this.client?.publish(this.config.commandTopic, JSON.stringify(command));
  }

  async setHotWaterState(state: string, until?: string): Promise<void> {
    const command = {
        command: "set_dhw_state",
        state: state,
        until: until
    };
    this.client?.publish(this.config.commandTopic, JSON.stringify(command));
  }

  async renewSession(): Promise<void> {
    if (this.client) {
        this.client.reconnect();
    }
  }

  getSessionInfo(): any {
    return { 
        provider: "MQTT",
        connected: this.client?.connected || false,
        error: this.lastError,
        zonesMapped: Object.keys(this.zoneIdToMapping).length
    };
  }
}
