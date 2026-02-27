"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./config/index");
const Logger_1 = require("./utils/Logger");
const ProviderFactory_1 = require("./providers/ProviderFactory");
const app = (0, express_1.default)();
let provider;
try {
    provider = ProviderFactory_1.ProviderFactory.create();
}
catch (error) {
    Logger_1.Logger.error("CRITICAL: Failed to instantiate provider on startup.", error);
    process.exit(1);
}
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Request Logger
app.use((req, res, next) => {
    Logger_1.Logger.debug(`${req.method} ${req.url}`);
    next();
});
// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
    next();
});
// Serve static files
app.use(express_1.default.static(path_1.default.join(__dirname, '../static')));
// --- REST API Routes ---
// Connection Test
app.get('/rest/test', (req, res) => {
    Logger_1.Logger.info("Test endpoint hit");
    res.json({ status: "ok", message: "Backend is reachable" });
});
// Get Session Info
app.get('/rest/session', (req, res) => {
    res.json(provider.getSessionInfo());
});
// Renew Session
app.get('/rest/renewsession', async (req, res) => {
    try {
        await provider.renewSession();
        res.json(provider.getSessionInfo());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get System Mode
app.get('/rest/getsystemmode', async (req, res) => {
    try {
        const status = await provider.getSystemStatus();
        res.json(status);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get Zones
app.get('/rest/getzones/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        const zones = await provider.getZonesStatus();
        if (forItem) {
            const zone = zones.find(z => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        }
        else {
            res.json(zones);
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get DHW
app.get('/rest/getdhw', async (req, res) => {
    try {
        const status = await provider.getHotWaterStatus();
        res.json(status);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get Current Status (Unified)
app.get('/rest/getcurrentstatus/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        if (forItem === 'dhw') {
            const status = await provider.getHotWaterStatus();
            res.json(status);
        }
        else if (forItem === 'system') {
            const status = await provider.getSystemStatus();
            res.json(status);
        }
        else if (forItem) {
            const zones = await provider.getZonesStatus();
            const zone = zones.find(z => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        }
        else {
            const zones = await provider.getZonesStatus();
            const dhw = await provider.getHotWaterStatus();
            const system = await provider.getSystemStatus();
            res.json({ zones, dhw, system });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get All Schedules
app.get('/rest/getallschedules', async (req, res) => {
    try {
        const schedules = await provider.getAllSchedules();
        res.json(schedules);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get Schedule for Single Zone/DHW
app.get('/rest/getscheduleforzone/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        if (!forItem)
            return res.status(400).json({ error: "Missing zone name/ID" });
        let id = forItem;
        if (forItem === 'dhw') {
            const status = await provider.getHotWaterStatus();
            if (status)
                id = status.dhwId;
        }
        else {
            const zones = await provider.getZonesStatus();
            const zone = zones.find(z => z.name === forItem || z.zoneId === forItem);
            if (zone)
                id = zone.zoneId;
        }
        const schedule = await provider.getScheduleForId(id);
        res.json(schedule);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Save All Schedules
app.post('/rest/saveallschedules', async (req, res) => {
    try {
        const schedules = req.body;
        for (const zoneId in schedules) {
            await provider.saveScheduleForZone(zoneId, schedules[zoneId]);
        }
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Set System Mode
app.post('/rest/setsystemmode', async (req, res) => {
    try {
        const { mode, until } = req.body;
        await provider.setSystemMode(mode, until);
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Set DHW State
app.post('/rest/setdhwstate', async (req, res) => {
    try {
        const { state, until } = req.body;
        await provider.setHotWaterState(state, until);
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Set DHW Auto
app.post('/rest/setdhwmodeauto', async (req, res) => {
    try {
        await provider.setHotWaterState("Auto");
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Set Zone Override
app.post('/rest/setzoneoverride', async (req, res) => {
    try {
        const { zoneId, zoneName, setpoint, until } = req.body;
        let id = zoneId;
        if (!id && zoneName) {
            const zones = await provider.getZonesStatus();
            const zone = zones.find(z => z.name === zoneName);
            if (zone)
                id = zone.zoneId;
        }
        if (!id)
            return res.status(400).json({ error: "Missing zoneId/zoneName" });
        await provider.setZoneSetpoint(id, setpoint, until);
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Cancel Zone Override
app.post('/rest/cancelzoneoverride', async (req, res) => {
    try {
        const { zoneId } = req.body;
        if (!zoneId)
            return res.status(400).json({ error: "Missing zoneId" });
        await provider.setZoneSetpoint(zoneId, 0);
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Log Level
app.get('/rest/setloglevel', (req, res) => {
    const level = req.query.level;
    Logger_1.Logger.info(`Log level requested: ${level} (Static implementation for now)`);
    res.json({ loglevel: level });
});
// Catch-all for non-existent REST endpoints
app.get('/rest/*', (req, res) => {
    res.status(404).send("Endpoint not found.");
});
// Catch-all for other routes (SPA fallback)
app.get('*', (req, res) => {
    res.send('Page not found.');
});
// Global Error Handler
app.use((err, req, res, next) => {
    Logger_1.Logger.error("Unhandled Error:", err);
    res.status(500).send(`Something went wrong: ${err.message}`);
});
async function startServer() {
    // Start listening immediately so endpoints like /rest/test are available
    app.listen(index_1.config.port, '0.0.0.0', () => {
        Logger_1.Logger.info(`Modernized Backend listening at http://localhost:${index_1.config.port}`);
    });
    try {
        Logger_1.Logger.info("Initializing heating provider in background...");
        await provider.initialize();
        Logger_1.Logger.info("Heating provider initialized successfully.");
    }
    catch (error) {
        Logger_1.Logger.error("Failed to initialize heating provider.", error);
        // We don't exit here so the server stays up for debugging/test endpoint
    }
}
startServer();
//# sourceMappingURL=index.js.map