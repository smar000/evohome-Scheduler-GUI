# Project Progress - February 28, 2026

## Completed
- [x] **Phase 1 (Backend):** TypeScript migration, Provider pattern, and MqttProvider implementation.
- [x] **Phase 2 (Frontend):** React migration, state management, and API hook integration.
- [x] **MQTT Protocol:** Implemented snake_case zone mapping and async schedule/status handling.
- [x] **Testing:** Jest unit tests implemented and passing for all providers.
- [x] **Containerization:** Dockerfile and docker-compose.yml created.

## Current Configuration
- **Provider:** MQTT (`HEATING_PROVIDER=mqtt` in `.env`)
- **Broker:** `mqtt://bridgeserver:1883`
- **Port:** 3330
- **Zone Mapping:** Cached in `config/zones.json` (Syncable via `/rest/mqtt/refresh-mappings`).

## Pending / Next Steps
1. **Live Validation:** Monitor logs for successful MQTT subscription and message handling.
2. **Phase 3:** Full validation of the Docker container environment.
3. **Cleanup:** Remove legacy `server.js` and `lib/` files once live data is verified.
4. **UI Enhancement:** Add a button to trigger `refreshMqttMappings` in the settings.
