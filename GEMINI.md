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