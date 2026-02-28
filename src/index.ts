import express from 'express';
import path from 'path';
import { config } from './config/index';
import { Logger } from './utils/Logger';
import { ProviderFactory } from './providers/ProviderFactory';
import { HeatingProvider } from './providers/HeatingProvider';

const app = express();
let provider: HeatingProvider;

try {
    provider = ProviderFactory.create();
} catch (error) {
    Logger.error("CRITICAL: Failed to instantiate provider on startup.", error);
    process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
    const queryStr = Object.keys(req.query).length ? `?${new URLSearchParams(req.query as any).toString()}` : '';
    Logger.debug(`${req.method} ${req.url}${queryStr}`);
    next();
});

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '../static')));

// --- REST API Routes ---

app.get('/rest/test', (req, res) => {
    Logger.info("Test endpoint hit");
    res.json({ status: "ok", message: "Backend is reachable" });
});

app.get('/rest/session', (req, res) => {
    res.json(provider.getSessionInfo());
    Logger.debug("API: /rest/session request finished.");
});

app.get('/rest/renewsession', async (req, res) => {
    try {
        await provider.renewSession();
        res.json(provider.getSessionInfo());
        Logger.debug("API: /rest/renewsession request finished.");
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getsystemmode', async (req, res) => {
    try {
        const status = await provider.getSystemStatus();
        res.json(status);
        Logger.debug("API: /rest/getsystemmode request finished.");
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getzones/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const zones = await (provider as any).getZonesStatus(refresh, cache);
        if (forItem) {
            const zone = zones.find((z: any) => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        } else {
            res.json(zones);
        }
        Logger.debug(`API: /rest/getzones finished. Refresh=${refresh}, Cache=${cache}`);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getdhw', async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const status = await (provider as any).getHotWaterStatus(refresh, cache);
        res.json(status);
        Logger.debug(`API: /rest/getdhw finished. Refresh=${refresh}, Cache=${cache}`);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getcurrentstatus/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';

        if (forItem === 'dhw') {
            const status = await (provider as any).getHotWaterStatus(refresh, cache);
            res.json(status);
        } else if (forItem === 'system') {
            const status = await (provider as any).getSystemStatus(refresh, cache);
            res.json(status);
        } else if (forItem) {
            const zones = await (provider as any).getZonesStatus(refresh, cache);
            const zone = zones.find((z: any) => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        } else {
            const zones = await (provider as any).getZonesStatus(refresh, cache);
            const dhw = await (provider as any).getHotWaterStatus(false, cache); 
            const system = await (provider as any).getSystemStatus(false, cache); 
            res.json({ zones, dhw, system });
        }
        Logger.debug(`API: /rest/getcurrentstatus finished. Refresh=${refresh}, Cache=${cache}`);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getallschedules', async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const schedules = await (provider as any).getAllSchedules(refresh, cache);
        res.json(schedules);
        Logger.debug(`API: /rest/getallschedules finished. Refresh=${refresh}, Cache=${cache}`);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getscheduleforzone/:forItem?', async (req, res) => {
    try {
        const forItem = req.params['forItem?'];
        if (!forItem) return res.status(400).json({ error: "Missing zone name/ID" });
        let id = forItem;
        if (forItem === 'dhw') {
            const status = await provider.getHotWaterStatus();
            if (status) id = status.dhwId;
        } else {
            const zones = await provider.getZonesStatus();
            const zone = zones.find(z => z.name === forItem || z.zoneId === forItem);
            if (zone) id = zone.zoneId;
        }
        const schedule = await provider.getScheduleForId(id);
        res.json(schedule);
    } catch (error: any) {
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/setsystemmode', async (req, res) => {
    try {
        const { mode, until } = req.body;
        await provider.setSystemMode(mode, until);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/setdhwstate', async (req, res) => {
    try {
        const { state, until } = req.body;
        await provider.setHotWaterState(state, until);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/setdhwmodeauto', async (req, res) => {
    try {
        await provider.setHotWaterState("Auto");
        res.json({ status: "Ok" });
    } catch (error: any) {
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
            if (zone) id = zone.zoneId;
        }
        if (!id) return res.status(400).json({ error: "Missing zoneId/zoneName" });
        await provider.setZoneSetpoint(id, setpoint, until);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/cancelzoneoverride', async (req, res) => {
    try {
        const { zoneId } = req.body;
        if (!zoneId) return res.status(400).json({ error: "Missing zoneId" });
        await provider.setZoneSetpoint(zoneId, 0);
        res.json({ status: "Ok" });
    } catch (error: any) {
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

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    Logger.error("Unhandled Error:", err);
    res.status(500).send(`Something went wrong: ${err.message}`);
});

async function startServer() {
    app.listen(config.port, '0.0.0.0', () => {
        Logger.info(`Modernized Backend listening at http://localhost:${config.port}`);
    });
    try {
        Logger.info("Initializing heating provider in background...");
        await provider.initialize();
        Logger.info("Heating provider initialized successfully.");
    } catch (error) {
        Logger.error("Failed to initialize heating provider.", error);
    }
}

startServer();
