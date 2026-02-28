# evoWeb Development Documentation

## Architecture Overview
The project follows a **Provider Pattern** to decouple the user interface from the underlying heating hardware. 

- **Frontend:** React (TypeScript) + Zustand for state management.
- **Backend:** Express (TypeScript) serving as a proxy and data translator.
- **Providers:** Implemented via the `HeatingProvider` interface.

## Provider Interface
Located at `src/providers/HeatingProvider.ts`. Any new provider must implement this interface:

```typescript
export interface HeatingProvider {
  initialize(): Promise<void>;
  getZonesStatus(force?: boolean, preferCache?: boolean): Promise<ZoneStatus[]>;
  getSystemStatus(force?: boolean, preferCache?: boolean): Promise<SystemStatus>;
  getHotWaterStatus(force?: boolean, preferCache?: boolean): Promise<DhwStatus | null>;
  getAllSchedules(force?: boolean, preferCache?: boolean): Promise<Record<string, ZoneSchedule>>;
  getScheduleForId(id: string): Promise<ZoneSchedule>;
  saveScheduleForZone(zoneId: string, schedule: ZoneSchedule): Promise<void>;
  setZoneSetpoint(zoneId: string, setpoint: number, until?: string): Promise<void>;
  setSystemMode(mode: string, until?: string): Promise<void>;
  setHotWaterState(state: string, until?: string): Promise<void>;
  renewSession(): Promise<void>;
  getSessionInfo(): any;
}
```

## REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/session` | Returns current provider info and connection status. |
| `GET` | `/rest/getcurrentstatus` | Returns temperatures, targets, and modes for all zones + DHW. |
| `GET` | `/rest/getallschedules` | Returns cached schedules for all known zones. |
| `GET` | `/rest/getscheduleforzone/:id` | Requests a fresh schedule for a specific zone. |
| `POST` | `/rest/saveallschedules` | Saves modified schedules back to the provider. |
| `POST` | `/rest/selectprovider` | Switches active provider (`honeywell`, `mqtt`, `mock`). |
| `POST` | `/rest/mqtt/refresh-mappings` | Syncs zone names/labels from Honeywell to local MQTT cache. |

## MQTT Specifics
The `MqttProvider` uses a 2-digit **hexadecimal** `zone_idx` for hardware commands but maps them to **decimal** strings internally for consistency with the Honeywell API.

- Topic structure: `evohome/evogateway/system/_command`
- Hex mapping: Decimal `10` -> Hex `0A`.

## Docker Production Build
To build and run the production environment:
```bash
docker-compose up --build
```
The Dockerfile uses a multi-stage build to ensure the final image contains only the compiled code and production dependencies.
