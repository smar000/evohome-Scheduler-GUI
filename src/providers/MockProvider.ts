import { 
  HeatingProvider, 
  ZoneStatus, 
  ZoneSchedule, 
  SystemStatus,
  DhwStatus
} from './HeatingProvider';
import { Logger } from '../utils/Logger';

// --- Sample Data ---
const mockZones: ZoneStatus[] = [
  { zoneId: "12345", name: "Living Room", label: "living_room", temperature: 20.5, setpoint: 21.0, setpointMode: "FollowSchedule" },
  { zoneId: "67890", name: "Bedroom", label: "bedroom", temperature: 19.0, setpoint: 18.0, setpointMode: "TemporaryOverride", until: "2026-02-27T22:00:00Z" },
  { zoneId: "11223", name: "Kitchen", label: "kitchen", temperature: 21.2, setpoint: 21.0, setpointMode: "FollowSchedule" },
];

const mockDhw: DhwStatus = {
  dhwId: "99999",
  state: "On",
  temperature: 55.0,
  setpointMode: "PermanentOverride",
};

const mockSystem: SystemStatus = {
  systemMode: "Auto",
  permanent: true
};

const createMockSchedule = (setpoints: { time: string, temp: number }[]): ZoneSchedule['schedule'] => {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days.map(day => ({
    dayOfWeek: day,
    switchpoints: setpoints.map(sp => ({ timeOfDay: sp.time, heatSetpoint: sp.temp }))
  }));
};

const livingRoomSchedule: ZoneSchedule = {
  name: "Living Room",
  schedule: createMockSchedule([
    { time: "06:30", temp: 21 },
    { time: "08:30", temp: 18 },
    { time: "17:00", temp: 21 },
    { time: "22:00", temp: 16 },
  ])
};

const bedroomSchedule: ZoneSchedule = {
  name: "Bedroom",
  schedule: createMockSchedule([
    { time: "06:00", temp: 20 },
    { time: "08:00", temp: 17 },
    { time: "21:30", temp: 20 },
    { time: "23:00", temp: 17 },
  ])
};

const kitchenSchedule: ZoneSchedule = {
    name: "Kitchen",
    schedule: createMockSchedule([
      { time: "07:00", temp: 22 },
      { time: "09:00", temp: 19 },
      { time: "12:00", temp: 22 },
      { time: "14:00", temp: 19 },
      { time: "18:00", temp: 22 },
      { time: "21:00", temp: 19 },
    ])
};

const dhwSchedule: ZoneSchedule = {
  name: "Hot Water",
  schedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => ({
    dayOfWeek: day,
    switchpoints: [
      { timeOfDay: "06:00", state: "On" },
      { timeOfDay: "08:30", state: "Off" },
      { timeOfDay: "17:00", state: "On" },
      { timeOfDay: "22:00", state: "Off" },
    ]
  }))
};

const mockSchedules: Record<string, ZoneSchedule> = {
  "12345": livingRoomSchedule,
  "67890": bedroomSchedule,
  "11223": kitchenSchedule, 
  "99999": dhwSchedule,
};


export class MockProvider implements HeatingProvider {
  constructor() {
    Logger.info("--- Using Mock Heating Provider ---");
    Logger.info("This provider returns sample data and does not connect to any real API.");
  }

  async initialize(): Promise<void> {
    Logger.info("MockProvider: Initialized.");
  }

  async getZonesStatus(): Promise<ZoneStatus[]> {
    Logger.debug("MockProvider: Getting zone status.");
    return mockZones;
  }

  async getSystemStatus(): Promise<SystemStatus> {
    Logger.debug("MockProvider: Getting system status.");
    return mockSystem;
  }

  async getHotWaterStatus(): Promise<DhwStatus | null> {
    Logger.debug("MockProvider: Getting DHW status.");
    return mockDhw;
  }

  async getAllSchedules(): Promise<Record<string, ZoneSchedule>> {
    Logger.debug("MockProvider: Getting all schedules.");
    return mockSchedules;
  }
  
  async getScheduleForId(id: string): Promise<ZoneSchedule> {
    Logger.debug(`MockProvider: Getting schedule for ${id}.`);
    return mockSchedules[id] || { name: "", schedule: [] };
  }

  async saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void> {
    Logger.info(`MockProvider: Pretending to save schedule for zone ${zoneId}.`);
    mockSchedules[zoneId] = schedule;
  }

  async setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void> {
    Logger.info(`MockProvider: Pretending to set setpoint for zone ${zoneId} to ${setpoint}.`);
  }

  async setSystemMode(mode: string, until?: string): Promise<void> {
    Logger.info(`MockProvider: Pretending to set system mode to ${mode}.`);
  }

  async setHotWaterState(state: string, until?: string): Promise<void> {
    Logger.info(`MockProvider: Pretending to set DHW state to ${state}.`);
  }

  async renewSession(): Promise<void> {
    Logger.debug("MockProvider: Nothing to renew.");
  }

  getSessionInfo(): any {
    return { provider: "Mock" };
  }
}
