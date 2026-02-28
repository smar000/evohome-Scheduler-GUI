import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from './config/index';
import { Logger } from './utils/Logger';
import { ProviderFactory } from './providers/ProviderFactory';
import { HeatingProvider } from './providers/HeatingProvider';
import { HoneywellTccProvider } from './providers/HoneywellTccProvider';

const app = express();
let provider: HeatingProvider;

// Function to (re)initialize provider
async function initProvider() {
    try {
        provider = ProviderFactory.create();
        Logger.info(`Initializing heating provider (${config.providerType}) in background...`);
        await provider.initialize();
        Logger.info("Heating provider initialized successfully.");
    } catch (error) {
        Logger.error("Failed to initialize heating provider.", error);
    }
}

initProvider();

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

// Switch Provider
app.post('/rest/selectprovider', async (req, res) => {
    try {
        const { type } = req.body;
        if (type !== 'honeywell' && type !== 'mqtt' && type !== 'mock') {
            return res.status(400).json({ error: "Invalid provider type" });
        }

        Logger.info(`API: Switching provider to ${type}...`);
        
        // 1. Update the .env file
        const envPath = path.join(process.cwd(), '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/HEATING_PROVIDER=\w+/g, `HEATING_PROVIDER=${type}`);
        fs.writeFileSync(envPath, envContent);

        // 2. Update the in-memory config
        config.providerType = type;

        // 3. Re-initialize provider
        await initProvider();

        res.json({ status: "Ok", provider: type });
    } catch (error: any) {
        Logger.error("API: Failed to switch provider.", error);
        res.status(500).json({ error: error.message });
    }
});

// Refresh MQTT Zone Mappings from Honeywell
app.post('/rest/mqtt/refresh-mappings', async (req, res) => {
    try {
        Logger.info("API: Refreshing MQTT zone mappings from Honeywell...");
        const honeywell = new HoneywellTccProvider(config.honeywell.username, config.honeywell.password);
        await honeywell.initialize();
        const zones = await honeywell.getZonesStatus();
        
        const mapping: Record<string, string> = {};
        zones.forEach(z => {
            // Convert name to snake_case for MQTT topics
            const snakeName = z.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
            mapping[z.zoneId] = snakeName;
        });

        const zonesPath = path.join(process.cwd(), 'config', 'zones.json');
        if (!fs.existsSync(path.dirname(zonesPath))) fs.mkdirSync(path.dirname(zonesPath), { recursive: true });
        fs.writeFileSync(zonesPath, JSON.stringify(mapping, null, 2));
        
        Logger.info(`API: Saved ${zones.length} zone mappings to ${zonesPath}`);
        
        // If current provider is MQTT, tell it to reload
        if (config.providerType === 'mqtt' && provider) {
            (provider as any).loadZoneMapping?.();
        }

        res.json({ status: "Ok", mappings: mapping });
    } catch (error: any) {
        Logger.error("API: Failed to refresh zone mappings.", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/test', (req, res) => {
    Logger.info("Test endpoint hit");
    res.json({ status: "ok", message: "Backend is reachable" });
});

app.get('/rest/session', (req, res) => {
    if (!provider) {
        return res.json({ provider: "None", error: "Provider not initialized" });
    }
    res.json(provider.getSessionInfo());
});

app.get('/rest/renewsession', async (req, res) => {
    try {
        await provider.renewSession();
        res.json(provider.getSessionInfo());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getsystemmode', async (req, res) => {
    try {
        const status = await provider.getSystemStatus();
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getzones/:forItem?', async (req, res) => {
    try {
        const { forItem } = req.params as any;
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const zones = await (provider as any).getZonesStatus(refresh, cache);
        if (forItem) {
            const zone = zones.find((z: any) => z.name === forItem || z.zoneId === forItem);
            res.json(zone || { error: "Zone not found" });
        } else {
            res.json(zones);
        }
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
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getcurrentstatus/:forItem?', async (req, res) => {
    try {
        if (!provider) {
            throw new Error("Heating provider not initialized.");
        }
        const { forItem } = req.params as any;
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
    } catch (error: any) {
        const { forItem } = req.params as any;
        Logger.error(`API: Error fetching status for ${forItem || 'all'}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getallschedules', async (req, res) => {
    try {
        if (!provider) {
            throw new Error("Heating provider not initialized.");
        }
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const schedules = await (provider as any).getAllSchedules(refresh, cache);
        res.json(schedules);
    } catch (error: any) {
        Logger.error("API: Error fetching all schedules:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getscheduleforzone/:forItem?', async (req, res) => {
    try {
        const { forItem } = req.params as any;
        if (!forItem) return res.status(400).json({ error: "Missing zone name/ID" });
        
        let id = forItem;
        // Only do the name->ID lookup if NOT in MQTT mode OR if it's 'dhw'
        if (config.providerType !== 'mqtt' || forItem === 'dhw') {
            if (forItem === 'dhw') {
                const status = await provider.getHotWaterStatus();
                if (status) id = status.dhwId;
            } else {
                const zones = await provider.getZonesStatus();
                let zone = zones.find(z => z.name === forItem || z.zoneId === forItem);
                
                // EXTRA PROTECTION: If not found and it's a 2-digit ID, try translating from mapping cache
                if (!zone && /^\d{2}$/.test(forItem)) {
                    const zonesPath = path.join(process.cwd(), 'config', 'zones.json');
                    if (fs.existsSync(zonesPath)) {
                        const mapping = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
                        const entry = mapping[forItem];
                        if (entry && entry.honeywellId) {
                            Logger.debug(`API: Translating user index ${forItem} to Honeywell ID ${entry.honeywellId}`);
                            id = entry.honeywellId;
                            // Verify this ID actually exists in the current provider's list
                            zone = zones.find(z => z.zoneId === id);
                        }
                    }
                }

                if (zone) id = zone.zoneId;
                else if (config.providerType === 'honeywell') {
                    // If we are in honeywell mode and still have a 2-digit ID, it's invalid.
                    if (/^\d{2}$/.test(id)) {
                        throw new Error(`Invalid zone ID for Cloud mode: ${id}. Please refresh mappings.`);
                    }
                }
            }
        }
        
        const schedule = await provider.getScheduleForId(id);
        res.json(schedule);
    } catch (error: any) {
        const { forItem } = req.params as any;
        Logger.error(`API: Error fetching schedule for ${forItem}:`, error);
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

const server = app.listen(config.port, '0.0.0.0', () => {
    Logger.info(`Modernized Backend listening at http://localhost:${config.port}`);
});
