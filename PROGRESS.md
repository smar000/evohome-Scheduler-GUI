# Project Progress - February 28, 2026

## Completed
- [x] **Phase 1 (Backend):** TypeScript migration, Provider pattern, and MqttProvider implementation.
- [x] **Phase 2 (Frontend):** React migration, state management, and API integration.
- [x] **MQTT Optimization:** Targeted '+' wildcard subscriptions and hex conversion for protocol support.
- [x] **UI Enhancements:** Tabbed navigation (Scheduler/Dashboard), sequential refreshes, and mobile-friendly layouts.
- [x] **Embed Mode:** Support for iframe integration via `?embed=true&zoneId=XX`.
- [x] **Reliability:** Added 401 interceptor for automatic Honeywell token refresh and retry.
- [x] **Tidyup:** Legacy jQuery code, original server, and libraries moved to `legacy_backup/`. Frontend builds now output to root `static/`.
- [x] **Phase 3 (Infrastructure):** Docker environment validated and optimized.
- [x] **Phase 3 (Documentation):** Created `DEVELOPMENT.md` with API and architecture details.
- [x] **Phase 3 (Testing):** Updated and verified unit tests for MqttProvider.
- [x] **Phase 4 (Maintenance & Reliability):**
    - **Hot Water Logic:** Fixed MQTT DHW schedules using `"HW"` index and boolean `enabled` parameter.
    - **Security:** Purged sensitive legacy files (`.env`, `config.json`) from entire Git history.
    - **Architecture:** Moved dynamic state from `config/` to `data/` and documented in `ARCHITECTURE.md`.
    - **UX Refinement:** Integrated navigation tabs and system status into the header; contextualized zone sync.
    - **Build Stability:** Resolved Docker and TypeScript build errors.

## Status: Maintenance Phase Complete
The project is secure, well-documented, and the MQTT implementation is fully production-ready for both heating and hot water. Current work is on the `feat/modernized-frontend-scheduler` branch.
