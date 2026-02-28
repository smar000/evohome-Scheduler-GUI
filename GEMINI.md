This project was originally created in javascript, usuing jsquery, to provide a browser based gui front-end to a cloud based Honeywell evohome heating scheduling system api (which in turns connects to a local heating controller unit). The gui allows drag and drop creation and edits of heating "slots".

The project has been modernized to use **React (TypeScript)** on the frontend and a **Node.js (TypeScript)** backend with a modular **Provider Pattern**.

## Modernization Roadmap

### Phase 1: Backend Refactoring (Foundation) - [COMPLETED]
- **TypeScript Migration:** Backend fully converted to TypeScript.
- **Dependency Refresh:** Replaced `request` with `axios` and `moment` with `luxon`.
- **Provider Pattern:** Implemented `HeatingProvider` interface.
  - `HoneywellTccProvider`: Cloud-based logic with automatic MQTT mapping sync.
  - `MqttProvider`: Local control logic via MQTT with hex-based protocol support.
- **Environment Configuration:** Transitioned to `.env` variables and `nodemon.json` for stability.

### Phase 2: Frontend Modernization (The GUI) - [COMPLETED]
- **Framework Adoption:** Migrated from jQuery to **React**.
- **Component-Driven UI:** Modular components (ZoneSelector, DayView, Scheduler).
- **Tabbed Navigation:** Separated **Scheduler** (planning) and **Dashboard** (live monitoring).
- **Focus Mode:** Scheduler shows real-time status (temp, target, mode) for the active zone.
- **Sequential Refreshes:** "Refresh Zone" and "Refresh All" buttons with live feedback.
- **Mobile Friendly:** Optimized layouts and always-visible copy/paste buttons for touch devices.
- **Embed Mode:** Support for `?embed=true&zoneId=XX` for iframe integration.
- **Branding:** Renamed to **evoWeb** with custom favicon and dynamic provider icons.

### Phase 3: Infrastructure & Validation - [IN PROGRESS]
- **Containerization:** `Dockerfile` and `docker-compose.yml` provided.
- **Testing Suite:** Jest tests implemented for `MqttProvider`.
- **Cleanup:** Legacy `server.js` and `lib/` files to be removed after final validation.

## Technical Details: MQTT Implementation

The `MqttProvider` communicates with a local `evogateway` using the following logic:
- **Commands:** Published to `evohome/evogateway/system/_command`.
  - `get_schedule`: Requires hex conversion of `zone_idx` (e.g. 10 -> "0A").
  - `set_schedule`: Sends updated JSON schedule back to the controller.
- **Subscriptions:** Optimized using `+` wildcards to reduce noise:
  - `.../zones/+/ctl_controller/setpoint`
  - `.../zones/+/ctl_controller/temperature`
  - `.../zones/+/ctl_controller/zone_mode` (Maps to "Following Schedule", "Temporary Override", etc.)
  - `.../zones/+/+/zone_schedule` (Handles fragmented schedule responses).
- **Mapping:** `config/zones.json` stores `zoneId` (decimal string), user-friendly `name`, and system `label`. The system "self-learns" and updates this mapping if it discovers new labels via MQTT.

▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
