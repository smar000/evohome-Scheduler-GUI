export interface ZoneSchedule {
  name: string;
  schedule: DailySchedule[];
}

export interface DailySchedule {
  dayOfWeek: string;
  switchpoints: Switchpoint[];
}

export interface Switchpoint {
  heatSetpoint: number;
  timeOfDay: string;
}

export interface ZoneStatus {
  zoneId: string;
  name: string;
  label?: string;
  setpoint: number;
  temperature: number;
  setpointMode: string;
  until?: string;
}

export interface SystemStatus {
  systemMode: string;
  timeUntil?: string;
  permanent: boolean;
}

export interface DhwStatus {
  dhwId: string;
  state: string;
  temperature: number;
  setpointMode: string;
  until?: string;
}

export interface HeatingProvider {
  /**
   * Initialize the provider (e.g., login or connect to MQTT broker).
   */
  initialize(): Promise<void>;

  /**
   * Get all zones and their current statuses.
   */
  getZonesStatus(): Promise<ZoneStatus[]>;

  /**
   * Get overall system status.
   */
  getSystemStatus(): Promise<SystemStatus>;

  /**
   * Get domestic hot water status.
   */
  getHotWaterStatus(): Promise<DhwStatus | null>;

  /**
   * Get the full schedule for all zones.
   */
  getAllSchedules(): Promise<Record<string, ZoneSchedule>>;

  /**
   * Get the schedule for a single zone or DHW.
   */
  getScheduleForId(id: string, force?: boolean): Promise<ZoneSchedule>;

  /**
   * Save a single zone schedule.
   */
  saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void>;

  /**
   * Set a temporary or permanent temperature override for a zone.
   */
  setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void>;

  /**
   * Set the overall system mode (e.g., Auto, HeatingOff, Away).
   */
  setSystemMode(mode: string, until?: string): Promise<void>;

  /**
   * Set hot water state.
   */
  setHotWaterState(state: string, until?: string): Promise<void>;

  /**
   * Force a session renewal or reconnection.
   */
  renewSession(): Promise<void>;

  /**
   * Get raw session info (for debugging/compatibility).
   */
  getSessionInfo(): any;
}
