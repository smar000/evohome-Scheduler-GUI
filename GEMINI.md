This project was originally created in javascript, usuing jsquery, to provide a browser based gui front-end to a cloud based Honeywell evohome heating scheduling system api (which in turns connects to a local heating controller unit). This . The gui allows drag and drop creation and edits of heating "slots".

I would like to retain the drag/drop gui functionality. I would like to move from jsquery to a modern/maintainable framework. I would like to update the whole architecture to a more modern structure, but only if it is necessary and would help in long term maintainability. In particular, I would like to modularise the backend communcations such that the user can select whether to use the existing remote Honeywell API or alternatively, they can interrogate/update the local heating control unit directly via MQTT.

## Modernization Roadmap

### Phase 1: Backend Refactoring (Foundation)
- **TypeScript Migration:** Convert the backend to TypeScript for better type safety and DX.
- **Dependency Refresh:** Replace deprecated `request` with `axios` and `moment` with `date-fns`/`luxon`.
- **Provider Pattern:** Modularize backend communications by implementing a `HeatingProvider` interface.
  - `HoneywellTccProvider`: Current cloud-based logic.
  - `MqttProvider`: New local control logic for MQTT.
- **Environment Configuration:** Transition from `config.json` to `.env` variables.

### Phase 2: Frontend Modernization (The GUI)
- **Framework Adoption:** Migrate from jQuery to **React**.
- **Component-Driven UI:** Break down the scheduler into reusable components (ZoneSelect, DayView, WeekView, SlotSlider).
- **State Management:** Implement a robust state management layer (e.g., Zustand) to handle complex schedule edits.
- **Modern Drag & Drop:** Utilize `dnd-kit` or similar to maintain and improve the drag-and-drop experience.

### Phase 3: Infrastructure & Validation
- **Containerization:** Provide a `Dockerfile` for consistent deployment environments.
- **Testing Suite:** Implement unit tests for providers and integration tests for API endpoints.
- **Documentation:** Document the REST API and the Provider interface for future extensions.

As of now, we have completed all steps of Phases 1 and 2, except the MqttProvider backend logic. We are now working on this. I will now provide you with the basic details of how this is to work.

We need an mqtt client that publishes our requests to a custom defined topic, default "evohome/evogateway/system/_command". Command status updates are provided in the "evohome/evogateway/system/_command/_lastcommand" topic. The client must also subscribe to zone data via another custom topic, default "evohome/evogateway/zones". This topic contains subtopics for each zone, using the zone name in camel case as the topic name. We must therefore maintain an internal list of zone Ids and their corresponding names. For now, this list can be obtained (or refreshed) from the Honeywell API on first connection, and then cached locally. In the future, we may be able to obtain it via the MQTT broker from the local provider. The request the current schedule for a given zone, we must publish a json command using the format:
{
  "command": "get_schedule",
  "zone_idx": "00",
  "force_refresh": false
} 
Here, the zone_idx corresponds to the zone ID mentioned earlier. "force_refresh" is a boolean which should be used to force a refresh of the schedule from the local server otherwise it will be sent from a cache. Given that forcing refresh is expensive resourceswise, we should default to cached data unless a genuine refresh is required.

The response back from the local server can take a little bit of time, as the data from the hardware devices comes in "fragments", which are then combined together and then decoded to form the final schedule, in json format. This schedule is posted to the zone subtopic under the topic "zone_schedule". Thus for the zone 00, Living Room, we would find the result under "evohome/evogateway/zones/living_room/ctl_controller/zone_schedule". The schedule json looks like:
{"schedule": [{"day_of_week": 0, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}, {"day_of_week": 1, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}, {"day_of_week": 2, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}, {"day_of_week": 3, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}, {"day_of_week": 4, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}, {"day_of_week": 5, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}, {"day_of_week": 6, "switchpoints": [{"time_of_day": "10:30", "heat_setpoint": 22.0}, {"time_of_day": "21:30", "heat_setpoint": 5.0}]}], "zone_idx": "00", "timestamp": "2026-02-28T10:15:14"}
We need to be able to translate this into our display format. After any edits to the schedule, we need to send it back to the command topic with a a set_schedule command, using the format:
{
  "command": "set_schedule",
  "zone_idx": "01",
  "schedule": { ... }
}




▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
