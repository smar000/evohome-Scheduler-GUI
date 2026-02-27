"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProvider = void 0;
const Logger_1 = require("../utils/Logger");
// --- Sample Data ---
const mockZones = [
    { zoneId: "12345", name: "Living Room", temperature: 20.5, setpoint: 21.0, setpointMode: "FollowSchedule" },
    { zoneId: "67890", name: "Bedroom", temperature: 19.0, setpoint: 18.0, setpointMode: "TemporaryOverride", until: "2026-02-27T22:00:00Z" },
    { zoneId: "11223", name: "Kitchen", temperature: 21.2, setpoint: 21.0, setpointMode: "FollowSchedule" },
];
const mockDhw = {
    dhwId: "99999",
    state: "On",
    temperature: 55.0,
    setpointMode: "PermanentOverride",
};
const mockSystem = {
    systemMode: "Auto",
    permanent: true
};
const createMockSchedule = (setpoints) => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return days.map(day => ({
        dayOfWeek: day,
        switchpoints: setpoints.map(sp => ({ timeOfDay: sp.time, heatSetpoint: sp.temp }))
    }));
};
const livingRoomSchedule = {
    name: "Living Room",
    schedule: createMockSchedule([
        { time: "06:30", temp: 21 },
        { time: "08:30", temp: 18 },
        { time: "17:00", temp: 21 },
        { time: "22:00", temp: 16 },
    ])
};
const bedroomSchedule = {
    name: "Bedroom",
    schedule: createMockSchedule([
        { time: "06:00", temp: 20 },
        { time: "08:00", temp: 17 },
        { time: "21:30", temp: 20 },
        { time: "23:00", temp: 17 },
    ])
};
const kitchenSchedule = {
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
const mockSchedules = {
    "12345": livingRoomSchedule,
    "67890": bedroomSchedule,
    "11223": kitchenSchedule,
};
class MockProvider {
    constructor() {
        Logger_1.Logger.info("--- Using Mock Heating Provider ---");
        Logger_1.Logger.info("This provider returns sample data and does not connect to any real API.");
    }
    async initialize() {
        Logger_1.Logger.info("MockProvider: Initialized.");
    }
    async getZonesStatus() {
        Logger_1.Logger.debug("MockProvider: Getting zone status.");
        return mockZones;
    }
    async getSystemStatus() {
        Logger_1.Logger.debug("MockProvider: Getting system status.");
        return mockSystem;
    }
    async getHotWaterStatus() {
        Logger_1.Logger.debug("MockProvider: Getting DHW status.");
        return mockDhw;
    }
    async getAllSchedules() {
        Logger_1.Logger.debug("MockProvider: Getting all schedules.");
        return mockSchedules;
    }
    async getScheduleForId(id) {
        Logger_1.Logger.debug(`MockProvider: Getting schedule for ${id}.`);
        return mockSchedules[id] || { name: "", schedule: [] };
    }
    async saveScheduleForZone(zoneId, schedule) {
        Logger_1.Logger.info(`MockProvider: Pretending to save schedule for zone ${zoneId}.`);
        mockSchedules[zoneId] = schedule;
    }
    async setZoneSetpoint(zoneId, setpoint, until) {
        Logger_1.Logger.info(`MockProvider: Pretending to set setpoint for zone ${zoneId} to ${setpoint}.`);
    }
    async setSystemMode(mode, until) {
        Logger_1.Logger.info(`MockProvider: Pretending to set system mode to ${mode}.`);
    }
    async setHotWaterState(state, until) {
        Logger_1.Logger.info(`MockProvider: Pretending to set DHW state to ${state}.`);
    }
    async renewSession() {
        Logger_1.Logger.debug("MockProvider: Nothing to renew.");
    }
    getSessionInfo() {
        return { provider: "Mock" };
    }
}
exports.MockProvider = MockProvider;
//# sourceMappingURL=MockProvider.js.map