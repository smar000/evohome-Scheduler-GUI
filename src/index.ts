import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from './config/index';
import { Logger } from './utils/Logger';
import { HeatingProvider } from './providers/HeatingProvider';
import { HoneywellTccProvider } from './providers/HoneywellTccProvider';
import { MqttProvider } from './providers/MqttProvider';
import { MockProvider } from './providers/MockProvider';

const app = express();

// --- Provider instances ---
let activeProvider: HeatingProvider;
let mqttProvider: MqttProvider | null = null;
let cloudProvider: HoneywellTccProvider | null = null;
let mockProvider: MockProvider | null = null;

// --- Config validation helpers ---
function hasValidMqttConfig(): boolean {
    return !!(config.mqtt?.brokerUrl);
}

function hasValidCloudConfig(): boolean {
    return !!(config.honeywell?.username && config.honeywell?.password);
}

// --- Active provider selection ---
function setActiveProvider(type: string): void {
    if (type === 'mqtt' && mqttProvider) {
        activeProvider = mqttProvider;
    } else if (type === 'honeywell' && cloudProvider) {
        activeProvider = cloudProvider;
    } else if (type === 'mock') {
        if (!mockProvider) mockProvider = new MockProvider();
        activeProvider = mockProvider;
    } else {
        // Requested provider not available — fall back to whatever is running
        const fallback = mqttProvider || cloudProvider;
        if (fallback) {
            activeProvider = fallback;
            Logger.warn(`Provider '${type}' not available, falling back to ${fallback.constructor.name}`);
        } else {
            if (!mockProvider) mockProvider = new MockProvider();
            activeProvider = mockProvider;
            Logger.warn(`No providers available, using mock`);
        }
    }
}

// --- Startup: initialise both providers in parallel if credentials are present ---
async function initAllProviders(): Promise<void> {
    Logger.info('Initializing providers...');
    const tasks: Array<Promise<void>> = [];

    if (hasValidMqttConfig()) {
        tasks.push((async () => {
            try {
                mqttProvider = new MqttProvider(config.mqtt);
                await mqttProvider.initialize();
                Logger.info('MQTT provider initialized');
            } catch (e) {
                Logger.error('MQTT provider failed to initialize', e);
                mqttProvider = null;
            }
        })());
    } else {
        Logger.info('MQTT provider skipped: MQTT_BROKER_URL not configured');
    }

    if (hasValidCloudConfig()) {
        tasks.push((async () => {
            try {
                cloudProvider = new HoneywellTccProvider(config.honeywell);
                await cloudProvider.initialize();
                Logger.info('Cloud (Honeywell) provider initialized');
            } catch (e) {
                Logger.error('Cloud provider failed to initialize', e);
                cloudProvider = null;
            }
        })());
    } else {
        Logger.info('Cloud provider skipped: Honeywell credentials not configured');
    }

    await Promise.allSettled(tasks);
    setActiveProvider(config.providerType);
    Logger.info(`Active provider set to: ${config.providerType}`);
}

initAllProviders();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    Logger.debug(`${req.method} ${req.url}`);
    next();
});

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
    next();
});

app.use(express.static(path.join(__dirname, '../static')));

// --- REST API Routes ---

// True if the request asks for a forced provider refresh (?refresh=1 or ?refresh=true)
function isRefresh(q: any): boolean {
    return q === '1' || q === 'true';
}

// Find a zone by label, normalised name, or zoneId
function findZone(zones: any[], item: string): any | undefined {
    const norm = (s: string) => s.toLowerCase().replace(/[\s-]/g, '_').replace(/[^a-z0-9_]/g, '');
    return zones.find((z: any) =>
        z.label === item ||
        norm(z.name) === norm(item) ||
        z.zoneId === item
    );
}

// Both-provider connection status
app.get('/rest/providers/status', (req, res) => {
    const getStatus = (p: HeatingProvider | null, available: boolean) => {
        if (!available) return { available: false, connected: false, status: 'not configured' };
        if (!p) return { available: true, connected: false, status: 'not initialized' };
        const info = p.getSessionInfo();
        const status = (info.gatewayStatus || 'unknown') as string;
        return {
            available: true,
            connected: ['online', 'authenticated'].includes(status.toLowerCase()),
            status,
            error: info.error || undefined,
        };
    };
    res.json({
        mqtt:  getStatus(mqttProvider,  hasValidMqttConfig()),
        cloud: getStatus(cloudProvider, hasValidCloudConfig()),
    });
});

// Named provider: MQTT current status
// GET /rest/mqtt/currentstatus[/dhw|system|<zone_label>][?refresh=1]
app.get('/rest/mqtt/currentstatus/:item?', async (req, res) => {
    if (!mqttProvider) {
        return res.status(503).json({ error: hasValidMqttConfig() ? 'MQTT provider not initialized' : 'MQTT not configured' });
    }
    try {
        const item = (req.params as any).item as string | undefined;
        const force = isRefresh(req.query.refresh);
        const p = mqttProvider as any;

        if (item === 'dhw') {
            return res.json(await p.getHotWaterStatus(force, !force) ?? null);
        }
        if (item === 'system') {
            return res.json(await p.getSystemStatus(force, !force) ?? null);
        }
        if (item) {
            const zones = await p.getZonesStatus(force, !force);
            const zone = findZone(zones, item);
            return zone ? res.json(zone) : res.status(404).json({ error: `Zone '${item}' not found` });
        }

        // No item — return all (concurrent; MQTT has no cache ordering issue)
        const [zonesR, dhwR, systemR] = await Promise.allSettled([
            p.getZonesStatus(force, !force),
            p.getHotWaterStatus(force, !force),
            p.getSystemStatus(force, !force),
        ]);
        res.json({
            zones:  zonesR.status  === 'fulfilled' ? zonesR.value  ?? [] : [],
            dhw:    dhwR.status    === 'fulfilled' ? dhwR.value    ?? null : null,
            system: systemR.status === 'fulfilled' ? systemR.value ?? null : null,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Named provider: Cloud current status
// GET /rest/cloud/currentstatus[/dhw|system|<zone_label>][?refresh=1]
app.get('/rest/cloud/currentstatus/:item?', async (req, res) => {
    if (!cloudProvider) {
        return res.status(503).json({ error: hasValidCloudConfig() ? 'Cloud provider not initialized' : 'Cloud not configured' });
    }
    try {
        const item = (req.params as any).item as string | undefined;
        const force = isRefresh(req.query.refresh);
        const p = cloudProvider as any;

        if (item === 'dhw') {
            // Zones must be fetched first to warm the cache so DHW setpoints are correct
            await p.getZonesStatus(force, !force).catch(() => null);
            return res.json(await p.getHotWaterStatus(false, true) ?? null);
        }
        if (item === 'system') {
            await p.getZonesStatus(force, !force).catch(() => null);
            return res.json(await p.getSystemStatus(false, true) ?? null);
        }
        if (item) {
            const zones = await p.getZonesStatus(force, !force);
            const zone = findZone(zones, item);
            return zone ? res.json(zone) : res.status(404).json({ error: `Zone '${item}' not found` });
        }

        // No item — sequential to preserve cache ordering
        const zones  = await p.getZonesStatus(force, !force).catch(() => []);
        const dhw    = await p.getHotWaterStatus(false, true).catch(() => null);
        const system = await p.getSystemStatus(false, true).catch(() => null);
        res.json({ zones, dhw, system });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Switch active provider (no re-init — both providers stay running)
app.post('/rest/selectprovider', async (req, res) => {
    try {
        const { type } = req.body;
        if (type !== 'honeywell' && type !== 'mqtt' && type !== 'mock') {
            return res.status(400).json({ error: "Invalid provider type" });
        }
        if (type === 'mqtt' && !mqttProvider) {
            return res.status(503).json({ error: "MQTT provider unavailable — check MQTT_BROKER_URL configuration" });
        }
        if (type === 'honeywell' && !cloudProvider) {
            return res.status(503).json({ error: "Cloud provider unavailable — check Honeywell credentials" });
        }

        Logger.info(`API: Switching active provider to ${type}`);

        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            envContent = envContent.replace(/HEATING_PROVIDER=\w+/g, `HEATING_PROVIDER=${type}`);
            fs.writeFileSync(envPath, envContent);
        }

        config.providerType = type;
        setActiveProvider(type);

        res.json({ status: "Ok", provider: type });
    } catch (error: any) {
        Logger.error("API: Failed to switch provider.", error);
        res.status(500).json({ error: error.message });
    }
});

// Refresh MQTT zone mappings from Honeywell (reuses cloudProvider if available)
app.post('/rest/mqtt/refresh-mappings', async (req, res) => {
    try {
        Logger.info("API: Refreshing MQTT zone mappings from Honeywell...");

        let honeywell: HoneywellTccProvider;
        if (cloudProvider) {
            honeywell = cloudProvider;
        } else {
            if (!hasValidCloudConfig()) {
                return res.status(503).json({ error: "Honeywell credentials not configured" });
            }
            honeywell = new HoneywellTccProvider(config.honeywell);
            await honeywell.initialize();
        }

        const zones = await honeywell.getZonesStatus();
        const mapping: Record<string, string> = {};
        zones.forEach(z => {
            const snakeName = z.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
            mapping[z.zoneId] = snakeName;
        });

        const zonesPath = path.join(process.cwd(), 'data', 'zones.json');
        if (!fs.existsSync(path.dirname(zonesPath))) fs.mkdirSync(path.dirname(zonesPath), { recursive: true });
        fs.writeFileSync(zonesPath, JSON.stringify(mapping, null, 2));

        Logger.info(`API: Saved ${zones.length} zone mappings to ${zonesPath}`);

        if (mqttProvider) {
            (mqttProvider as any).loadZoneMapping?.();
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
    if (!activeProvider) {
        return res.json({ provider: "None", error: "Provider not initialized" });
    }
    res.json(activeProvider.getSessionInfo());
});

app.get('/rest/config', (req, res) => {
    res.json(config.scheduler);
});

app.get('/rest/renewsession', async (req, res) => {
    try {
        await activeProvider.renewSession();
        res.json(activeProvider.getSessionInfo());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getsystemmode', async (req, res) => {
    try {
        const status = await activeProvider.getSystemStatus();
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getzones/:forItem?', async (req, res) => {
    try {
        const { forItem } = req.params as any;
        const force = isRefresh(req.query.refresh);
        const zones = await (activeProvider as any).getZonesStatus(force, !force);
        if (forItem) {
            const zone = findZone(zones, forItem);
            res.json(zone ?? { error: "Zone not found" });
        } else {
            res.json(zones);
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getdhw', async (req, res) => {
    try {
        const force = isRefresh(req.query.refresh);
        const status = await (activeProvider as any).getHotWaterStatus(force, !force);
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Active-provider current status
// GET /rest/getcurrentstatus[/dhw|system|<zone_label>][?refresh=1]
app.get('/rest/getcurrentstatus/:forItem?', async (req, res) => {
    try {
        if (!activeProvider) throw new Error("Heating provider not initialized.");
        const { forItem } = req.params as any;
        const force = isRefresh(req.query.refresh);
        const p = activeProvider as any;

        if (forItem === 'dhw') {
            return res.json(await p.getHotWaterStatus(force, !force));
        }
        if (forItem === 'system') {
            return res.json(await p.getSystemStatus(force, !force));
        }
        if (forItem) {
            const zones = await p.getZonesStatus(force, !force);
            const zone = findZone(zones, forItem);
            return zone ? res.json(zone) : res.status(404).json({ error: `Zone '${forItem}' not found` });
        }
        const zones  = await p.getZonesStatus(force, !force);
        const dhw    = await p.getHotWaterStatus(false, true);
        const system = await p.getSystemStatus(false, true);
        res.json({ zones, dhw, system });
    } catch (error: any) {
        const { forItem } = req.params as any;
        Logger.error(`API: Error fetching status for ${forItem || 'all'}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/getallschedules', async (req, res) => {
    try {
        if (!activeProvider) {
            throw new Error("Heating provider not initialized.");
        }
        const refresh = req.query.refresh === 'true';
        const cache = req.query.cache === 'true';
        const schedules = await (activeProvider as any).getAllSchedules(refresh, cache);
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
        if (config.providerType !== 'mqtt' || forItem === 'dhw') {
            if (forItem === 'dhw') {
                const status = await activeProvider.getHotWaterStatus();
                if (status) id = status.dhwId;
            } else {
                const zones = await activeProvider.getZonesStatus();
                let zone = zones.find(z => z.name === forItem || z.zoneId === forItem);

                if (!zone && /^\d{2}$/.test(forItem)) {
                    const zonesPath = path.join(process.cwd(), 'data', 'zones.json');
                    if (fs.existsSync(zonesPath)) {
                        const mapping = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
                        const entry = mapping[forItem];
                        if (entry && entry.honeywellId) {
                            Logger.debug(`API: Translating user index ${forItem} to Honeywell ID ${entry.honeywellId}`);
                            id = entry.honeywellId;
                            zone = zones.find(z => z.zoneId === id);
                        }
                    }
                }

                if (zone) id = zone.zoneId;
                else if (config.providerType === 'honeywell') {
                    if (/^\d{2}$/.test(id)) {
                        throw new Error(`Invalid zone ID for Cloud mode: ${id}. Please refresh mappings.`);
                    }
                }
            }
        }

        const refresh = req.query.refresh === 'true';
        const schedule = await activeProvider.getScheduleForId(id, refresh);
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
            await activeProvider.saveScheduleForZone(zoneId, schedules[zoneId]);
        }
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/setsystemmode', async (req, res) => {
    try {
        const { mode, until } = req.body;
        await activeProvider.setSystemMode(mode, until);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/setdhwstate', async (req, res) => {
    try {
        const { state, until } = req.body;
        await activeProvider.setHotWaterState(state, until);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/setdhwmodeauto', async (req, res) => {
    try {
        await activeProvider.setHotWaterState("Auto");
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
            const zones = await activeProvider.getZonesStatus();
            const zone = zones.find(z => z.name === zoneName);
            if (zone) id = zone.zoneId;
        }
        if (!id) return res.status(400).json({ error: "Missing zoneId/zoneName" });
        await activeProvider.setZoneSetpoint(id, setpoint, until);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/rest/cancelzoneoverride', async (req, res) => {
    try {
        const { zoneId } = req.body;
        if (!zoneId) return res.status(400).json({ error: "Missing zoneId" });
        await activeProvider.setZoneSetpoint(zoneId, 0);
        res.json({ status: "Ok" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/rest/setloglevel', (req, res) => {
    const level = req.query.level;
    res.json({ loglevel: level });
});

app.get('/rest/api', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>evoWeb REST API</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ui-monospace, 'Cascadia Code', monospace; background: #0f172a; color: #e2e8f0; padding: 2rem; line-height: 1.6; }
  h1 { font-size: 1.5rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.25rem; }
  .subtitle { font-size: 0.75rem; color: #64748b; margin-bottom: 2.5rem; text-transform: uppercase; letter-spacing: 0.1em; }
  h2 { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; margin: 2rem 0 0.75rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { text-align: left; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; padding: 0 0.75rem 0.4rem; border-bottom: 1px solid #1e293b; }
  td { padding: 0.45rem 0.75rem; vertical-align: top; border-bottom: 1px solid #1e293b; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1e293b44; }
  .method { font-weight: 700; font-size: 0.65rem; padding: 0.15rem 0.45rem; border-radius: 4px; white-space: nowrap; }
  .get  { background: #0c4a6e; color: #38bdf8; }
  .post { background: #14532d; color: #4ade80; }
  .path { color: #a5f3fc; white-space: nowrap; }
  .param { color: #fb923c; }
  .query { color: #a78bfa; }
  .desc { color: #94a3b8; }
  .note { color: #64748b; font-size: 0.72rem; margin-top: 0.15rem; }
  .tag { display: inline-block; font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 3px; background: #1e293b; color: #64748b; margin-left: 0.4rem; vertical-align: middle; }
</style>
</head>
<body>
<h1>evoWeb REST API</h1>
<p class="subtitle">All endpoints are relative to the server root &nbsp;·&nbsp; Active provider: <strong style="color:#e2e8f0">${config.providerType}</strong></p>

<h2>Infrastructure</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/api</td><td class="desc">This reference page</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/test</td><td class="desc">Connectivity check — returns <code>{"status":"ok"}</code></td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/session</td><td class="desc">Active provider session info</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/config</td><td class="desc">Frontend / scheduler UI configuration</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/renewsession</td><td class="desc">Force session renewal / reconnect</td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/selectprovider</td><td class="desc">Switch active provider<p class="note">Body: <span class="param">{"type":"honeywell"|"mqtt"|"mock"}</span></p></td></tr>
</table>

<h2>Dual-Provider Status <span class="tag">both providers run concurrently</span></h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/providers/status</td><td class="desc">Connection state of both MQTT and Cloud providers</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/mqtt/currentstatus<span class="param">[/dhw|system|&lt;zone_label&gt;]</span><span class="query">[?refresh=1]</span></td><td class="desc">MQTT provider — all or specific item<p class="note">Items: <span class="param">dhw</span>, <span class="param">system</span>, or a zone label / name</p></td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/cloud/currentstatus<span class="param">[/dhw|system|&lt;zone_label&gt;]</span><span class="query">[?refresh=1]</span></td><td class="desc">Cloud (Honeywell) provider — all or specific item</td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/mqtt/refresh-mappings</td><td class="desc">Re-sync MQTT zone name mappings from Honeywell Cloud</td></tr>
</table>

<h2>Active Provider — Status</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/getcurrentstatus<span class="param">[/dhw|system|&lt;zone&gt;]</span><span class="query">[?refresh=1]</span></td><td class="desc">All status, or a specific zone / dhw / system<p class="note">Zone matched by label, name, or ID</p></td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/getzones<span class="param">[/&lt;zone&gt;]</span><span class="query">[?refresh=1]</span></td><td class="desc">Zone list, or a single zone</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/getdhw<span class="query">[?refresh=1]</span></td><td class="desc">Domestic hot water status</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/getsystemmode</td><td class="desc">System mode (Auto, Away, HeatingOff, etc.)</td></tr>
</table>

<h2>Active Provider — Schedules</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/getallschedules</td><td class="desc">All cached zone schedules</td></tr>
<tr><td><span class="method get">GET</span></td><td class="path">/rest/getscheduleforzone<span class="param">/&lt;zone&gt;</span><span class="query">[?refresh=true]</span></td><td class="desc">Schedule for a single zone or dhw<p class="note">Includes <span class="param">fetchedAt</span> timestamp (MQTT only)</p></td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/saveallschedules</td><td class="desc">Save modified schedules<p class="note">Body: <span class="param">{"&lt;zoneId&gt;": ZoneSchedule, ...}</span></p></td></tr>
</table>

<h2>Active Provider — Control</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Description</th></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/setsystemmode</td><td class="desc">Set system mode<p class="note">Body: <span class="param">{"mode":"Auto"|"Away"|"HeatingOff"|"Custom", "until":"ISO8601"}</span></p></td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/setzoneoverride</td><td class="desc">Temporary or permanent setpoint override<p class="note">Body: <span class="param">{"zoneId":"...", "setpoint":21.0, "until":"ISO8601"}</span></p></td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/cancelzoneoverride</td><td class="desc">Cancel zone override, return to schedule<p class="note">Body: <span class="param">{"zoneId":"..."}</span></p></td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/setdhwstate</td><td class="desc">Set hot water state<p class="note">Body: <span class="param">{"state":"On"|"Off", "until":"ISO8601"}</span></p></td></tr>
<tr><td><span class="method post">POST</span></td><td class="path">/rest/setdhwmodeauto</td><td class="desc">Return hot water to schedule (cancel override)</td></tr>
</table>

<h2>Query Parameters</h2>
<table>
<tr><th>Parameter</th><th>Values</th><th>Description</th></tr>
<tr><td class="query">?refresh=1</td><td class="param">1 or true</td><td class="desc">Force a fresh fetch from the provider, bypassing cache</td></tr>
<tr><td class="query">?cache=true</td><td class="param">true</td><td class="desc">Prefer cached data even if stale (where supported)</td></tr>
</table>

</body>
</html>`);
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
