# evoWeb: Browser-based Schedule Editor for Honeywell evohome

**evoWeb** is a web-based interface for managing Honeywell evohome heating system schedules. While Honeywell provides official mobile applications, this project was developed to address the lack of a dedicated, browser-accessible portal suitable for desktop use and integration into home automation dashboards.

This application was created to meet a specific personal requirement for a browser based scheduling interface to evohome, and is shared in the hope that it may be of use to others with similar needs.

<table>
  <tr>
    <td align="center">
      <a href="./misc/other/evoWeb.png">
        <img src="./misc/other/evoWeb.png" width="280" alt="Schedule Manager — weekly zone view with slot editing toolbar"><br>
        <sub><b>Schedule Manager</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="./misc/other/evoWeb-dashboard.png">
        <img src="./misc/other/evoWeb-dashboard.png" width="280" alt="Dashboard — live status from both MQTT and Cloud providers side by side"><br>
        <sub><b>Dual-Provider Dashboard</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="./misc/other/evoWeb-embedded.png">
        <img src="./misc/other/evoWeb-embedded.png" width="280" alt="Embedded view — compact iframe mode for openHAB HABPanel or Basic UI"><br>
        <sub><b>Embedded (iframe) Mode</b></sub>
      </a>
    </td>
  </tr>
</table>

## Overview

*   **Browser-Based:** Provides schedule management from any desktop or tablet browser without the need for a mobile app.
*   **Automation Integration:** Designed for embedding within iframes, facilitating integration into platforms such as [openHAB](https://www.openhab.org) (e.g., HABPanel or Basic UI).
*   **Dual-Provider Architecture:** Both the Honeywell Cloud (TCC) and local MQTT providers run simultaneously whenever credentials are present. Live data from both sources is available via dedicated REST endpoints at all times, independently of which provider is selected as "active" in the UI.
*   **Visual Grid Editor:** Offers a graphical representation of weekly schedules for intuitive editing.
*   **REST API:** All live status data is also exposed via REST endpoints, suitable for integration with home automation platforms (openHAB, Home Assistant, Node-RED, etc.).

## Project Status

Not in active development. The project is at a point where it serves the original intended use. Bug fixe and PRs are welcome.

## Understanding "Slots"

In the evohome system, a daily schedule consists of **Slots**. 
*   A **Slot** represents a specific time period (e.g., 07:00 to 09:00) with a defined target temperature (e.g., 21°C).
*   The entire 24-hour period is covered by contiguous slots.
*   The end of one slot marks the immediate start of the next.

## Schedule Management

The **Scheduler** tab facilitates the viewing and editing of heating plans through two primary modes:

*   **Zone View (Week View):** Displays the 7-day schedule for a single selected zone.
*   **Day View (Multi-Zone View):** Displays the schedules of all zones for a single selected day, allowing for easier comparison and synchronization across the home.

### Editing Slots

Clicking any slot reveals a compact floating **action toolbar** anchored to that slot:

| Button | Action |
|--------|--------|
| ✏ **Edit** | Opens the Edit Popover to adjust Start Time, End Time, and Target Temperature. Clicking **Apply** updates the local view. |
| ＋ **Add slot** | Splits the selected slot at the click position, creating a new slot in the right half at the configured default temperature. |
| 🗑 **Delete** | Removes the slot and merges the gap into the preceding slot. |

**Double-clicking** a slot opens the Edit Popover directly, skipping the toolbar.

Pressing **Escape** or clicking anywhere outside the toolbar dismisses it without making changes.

The Edit Popover also includes an **Add slot** button that creates a new sub-slot using the times and temperature currently entered in the form, allowing precise placement without returning to the grid.

### Adding the First Slot

When a day row shows **"Add first slot"**, clicking it bootstraps a full-day slot at the default temperature. The slot can then be refined using the toolbar.

### Saving Changes
Modifications remain local to the browser session until the **Save** button is clicked. This action pushes the updated weekly schedule to the evohome controller.

## Status Indicators

The system provides real-time connection feedback via status badges.

### evoGateway (Local Mode)
*   **evoGateway: Online (Green):** Successful communication with the local hardware gateway.
*   **evoGateway: Offline (Red):** The gateway is unresponsive or the MQTT broker connection has been lost.

### TCC (Cloud Mode)
*   **TCC: Authenticated (Green):** Successful session established with Honeywell Total Connect Comfort services.
*   **TCC: Not Authenticated (Red):** Authentication failed or the session has expired.

## Dual-Provider Architecture

Both the Honeywell Cloud (TCC) and local MQTT (evogateway) providers are initialised at startup — as long as their respective credentials or broker URL are present in `.env`. They run concurrently and independently; selecting one does not disable the other.

The primary motivation for this concurrent architecture is to allow the REST API to serve data from either source at any time, on demand, without requiring a provider switch. External systems (home automation platforms, dashboards, scripts) can therefore poll `/rest/cloud/currentstatus` and `/rest/mqtt/currentstatus` independently, always receiving a live response from the appropriate data source regardless of which provider is currently active in the UI.

The **active provider** setting controls which data source drives the Scheduler tab (for reading schedules, setting overrides, etc.). Switching the active provider does not stop the other provider — it continues running in the background.

The **Dashboard** tab uses this same concurrent capability to display live data from **both** providers side by side, enabling cross-checking of local sensor readings against cloud-reported values in real time.

```
Honeywell Cloud  ──────▶  /rest/cloud/currentstatus/<zone>   ─────┐
                                                                    ├──▶  Dashboard (both streams, side by side)
MQTT / evogateway ─────▶  /rest/mqtt/currentstatus/<zone>    ─────┘

Active Provider   ──────▶  Scheduler, overrides, schedule save/load
                           /rest/getcurrentstatus/<zone>
```

If only one provider is configured (e.g. no Honeywell credentials), that provider alone is used and the other column in the dashboard shows `—`.

---

## REST API

The server listens on port **3330** (configurable via `PORT` in `.env`). All endpoints are prefixed with `/rest/`.

### Common query parameters

| Parameter | Values | Description |
| :--- | :--- | :--- |
| `?refresh=1` | `1` or `true` | Bypass the cache and force a fresh fetch from the provider |

### Zone item selector

Endpoints that accept an optional `/:item` segment resolve it in this order:
1. **`label`** — snake_case zone name (e.g. `kitchen_ufh`, `living_room`)
2. **Normalised name** — case-insensitive, spaces/hyphens become underscores
3. **`zoneId`** — raw provider zone ID
4. **`dhw`** — domestic hot water
5. **`system`** — overall system mode

---

### Provider status

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/providers/status` | Connection state for both MQTT and Cloud providers |

---

### Named provider endpoints

These always serve data from the specific provider, regardless of the active provider setting.

#### Local (MQTT / evogateway)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/mqtt/currentstatus` | All zones, DHW, and system from MQTT |
| `GET` | `/rest/mqtt/currentstatus/dhw` | Hot water status from MQTT |
| `GET` | `/rest/mqtt/currentstatus/system` | System mode from MQTT |
| `GET` | `/rest/mqtt/currentstatus/:zone_label` | Single zone by label/name/ID from MQTT |
| `POST` | `/rest/mqtt/refresh-mappings` | Rebuild zone ID↔name mapping file from Honeywell |

#### Cloud (Honeywell TCC)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/cloud/currentstatus` | All zones, DHW, and system from Cloud |
| `GET` | `/rest/cloud/currentstatus/dhw` | Hot water status from Cloud |
| `GET` | `/rest/cloud/currentstatus/system` | System mode from Cloud |
| `GET` | `/rest/cloud/currentstatus/:zone_label` | Single zone by label/name/ID from Cloud |

**Examples:**
```
GET /rest/cloud/currentstatus/bathroom
GET /rest/mqtt/currentstatus/kitchen_ufh?refresh=1
GET /rest/cloud/currentstatus/dhw
```

---

### Active provider endpoints

These serve data from whichever provider is currently selected as active.

#### Status

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/getcurrentstatus` | All zones, DHW, and system |
| `GET` | `/rest/getcurrentstatus/dhw` | Hot water status |
| `GET` | `/rest/getcurrentstatus/system` | System mode |
| `GET` | `/rest/getcurrentstatus/:zone_label` | Single zone by label/name/ID |
| `GET` | `/rest/getzones` | Zone list |
| `GET` | `/rest/getzones/:zone_label` | Single zone |
| `GET` | `/rest/getdhw` | Hot water status |
| `GET` | `/rest/getsystemmode` | System mode |

#### Schedules

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/getallschedules` | All zone schedules |
| `GET` | `/rest/getscheduleforzone/:zone_label` | Schedule for one zone or `dhw` |
| `POST` | `/rest/saveallschedules` | Save changed schedules — body: `{ [zoneId]: ZoneSchedule }` |

#### Control

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/rest/setzoneoverride` | Set zone temperature — body: `{ zoneId, setpoint, until? }` |
| `POST` | `/rest/cancelzoneoverride` | Cancel override (return to schedule) — body: `{ zoneId }` |
| `POST` | `/rest/setsystemmode` | Set system mode — body: `{ mode, until? }` |
| `POST` | `/rest/setdhwstate` | Set DHW state — body: `{ state, until? }` |
| `POST` | `/rest/setdhwmodeauto` | Return DHW to schedule |

#### Provider management

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/rest/selectprovider` | Switch active provider — body: `{ type: 'honeywell' \| 'mqtt' \| 'mock' }` |

#### Session / utility

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/session` | Active provider session info (userId, token expiry, etc.) |
| `GET` | `/rest/renewsession` | Force token refresh |
| `GET` | `/rest/config` | Frontend UI config (timeResolution, defaultTemp, colours) |
| `GET` | `/rest/test` | Basic connectivity check |

---

## Configuration (.env)

System behavior is managed via environment variables.

### Basic Settings
*   `HEATING_PROVIDER`: Sets the **active** provider for the Scheduler tab — `honeywell`, `mqtt`, or `mock`. Both cloud and local providers still initialise at startup if credentials are present; this only controls which one drives the scheduler.
*   `MQTT_BASE_TOPIC`: Defines the root MQTT topic (default: `evohome/evogateway`).

### Advanced Configuration
| Parameter | Default | Description |
| :--- | :--- | :--- |
| `HONEYWELL_CACHE_TTL` | `3` | Short cache TTL (minutes). Cloud data is re-fetched from the API when this expires. |
| `HONEYWELL_AUTO_REFRESH` | `15` | Maximum data age (minutes). Any status request — even without `?refresh=1` — will trigger a fresh API call if cached data is older than this threshold. |
| `HONEYWELL_LOGIN_LIMIT` | `15` | Minimum minutes between full password re-authentications (guards against rate-limiting). |
| `MQTT_RECONNECT_PERIOD` | `5000` | Milliseconds between MQTT reconnection attempts. |
| `MQTT_SCHEDULE_TIMEOUT` | `10000` | Milliseconds to wait for an MQTT schedule response. |
| `SCHEDULER_TIME_RESOLUTION` | `10` | The granularity of the grid (in minutes). |
| `SCHEDULER_DEFAULT_TEMP` | `20` | Default temperature for newly created slots. |

## Installation

### Using Docker (Recommended)
```bash
# 1. Clone and configure
git clone https://github.com/smar000/evohome-Scheduler-GUI.git evoweb
cd evoweb
cp .env.example .env

# 2. Run
docker-compose up --build -d
```

### Manual Installation
Prerequisites: **Node.js 20+**
```bash
npm install
cd frontend && npm install && cd ..
npm run build
npm run start:evoweb
```

## openHAB Integration

Navigation may be hidden to focus on a single zone for embedding:
```
http://<host-ip>:3330/?embed=true&zoneId=01
```

---
*Disclaimer: This project is unofficial and not affiliated with Honeywell. Use at your own risk.*
