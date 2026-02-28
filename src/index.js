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
    const queryStr = Object.keys(req.query).length ? `?${new URLSearchParams(req.query).toString()}` : '';
    Logger_1.Logger.debug(`${req.method} ${req.url}${queryStr}`);
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
app.get('/rest/test', (req, res) => {
    Logger_1.Logger.info("Test endpoint hit");
    res.json({ status: "ok", message: "Backend is reachable" });
});
app.get('/rest/session', (req, res) => {
    res.json(provider.getSessionInfo());
    Logger_1.Logger.debug("API: /rest/session request finished.");
});
app.get('/rest/renewsession', async (req, res) => {
    try {
        await provider.renewSession();
        res.json(provider.getSessionInfo());
        Logger_1.Logger.debug("API: /rest/renewsession request finished.");
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/rest/getsystemmode', async (req, res) => {
    try {
        const status = await provider.getSystemStatus();
        res.json(status);
        Logger_1.Logger.debug("API: /rest/getsystemmode request finished.");
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/rest/getzones/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const zones = await provider.getZonesStatus(refresh, cache);
        if (forItem) {
            const zone = zones.find((z) => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        }
        else {
            res.json(zones);
        }
        Logger_1.Logger.debug(`API: /rest/getzones finished. Refresh=${refresh}, Cache=${cache}`);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/rest/getdhw', async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const status = await provider.getHotWaterStatus(refresh, cache);
        res.json(status);
        Logger_1.Logger.debug(`API: /rest/getdhw finished. Refresh=${refresh}, Cache=${cache}`);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/rest/getcurrentstatus/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        if (forItem === 'dhw') {
            const status = await provider.getHotWaterStatus(refresh, cache);
            res.json(status);
        }
        else if (forItem === 'system') {
            const status = await provider.getSystemStatus(refresh, cache);
            res.json(status);
        }
        else if (forItem) {
            const zones = await provider.getZonesStatus(refresh, cache);
            const zone = zones.find((z) => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        }
        else {
            const zones = await provider.getZonesStatus(refresh, cache);
            const dhw = await provider.getHotWaterStatus(false, cache);
            const system = await provider.getSystemStatus(false, cache);
            res.json({ zones, dhw, system });
        }
        Logger_1.Logger.debug(`API: /rest/getcurrentstatus finished. Refresh=${refresh}, Cache=${cache}`);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/rest/getallschedules', async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const schedules = await provider.getAllSchedules(refresh, cache);
        res.json(schedules);
        Logger_1.Logger.debug(`API: /rest/getallschedules finished. Refresh=${refresh}, Cache=${cache}`);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
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
app.post('/rest/setdhwmodeauto', async (req, res) => {
    try {
        await provider.setHotWaterState("Auto");
        res.json({ status: "Ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
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
app.get('/rest/setloglevel', (req, res) => {
    const level = req.query.level;
    res.json({ loglevel: level });
});
app.get('/rest/*', (req, res) => {
    res.status(404).send("Endpoint not found.");
});
app.get('*', (req, res) => {
    res.send('Page not found.');
});
app.use((err, req, res, next) => {
    Logger_1.Logger.error("Unhandled Error:", err);
    res.status(500).send(`Something went wrong: ${err.message}`);
});
async function startServer() {
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
    }
}
startServer();
//# sourceMappingURL=index.js.map