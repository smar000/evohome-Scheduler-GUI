# evoWeb: Browser-based Schedule Editor for Honeywell evohome

**evoWeb** provides a modern, responsive web interface for managing Honeywell evohome heating systems. While Honeywell offers mobile apps, it lacks a dedicated browser-based portal for comprehensive schedule management.

The primary purpose of this project is to provide a powerful, web-based alternative to the mobile app, allowing for easy integration into home automation systems like [openHAB](https://www.openhab.org).

![Dashboard](./misc/other/embedded_sched.png)

## Why evoWeb?

*   **Browser-Based:** Heating management from any desktop or tablet browser—no mobile app required.
*   **Home Automation Ready:** Optimized for embedding in iframes (e.g., openHAB's HABPanel or Basic UI) with automatic resizing support.
*   **Dual-Mode Support:** Seamless switching between official **Cloud control** and fast, privacy-focused **Local control**.
*   **Precision Scheduling:** A visual grid-based editor that makes managing complex weekly schedules intuitive.

## Understanding "Slots"

In the evohome system, a schedule for a day is composed of **Slots**. 
*   A **Slot** is a specific period of time (e.g., 07:00 to 09:00) with a target temperature (e.g., 21°C).
*   The entire 24-hour period must be covered by slots.
*   When one slot ends, the next one immediately begins.

## Schedule Management

The **Scheduler** tab provides access to heating plans. Two primary view modes are available for different planning needs:

*   **Zone View (Week View):** Displays the full 7-day schedule for a single selected zone. This is ideal for managing the weekly rhythm of a specific room.
*   **Day View (Multi-Zone View):** Displays the schedules of all heating zones for a single selected day. This provides a comprehensive overview of the entire house's heating plan for that day.

The **Day View** is particularly effective for balancing heating requirements across the home. It facilitates the comparison of different zones and enables the efficient use of the **Copy** and **Paste** functionality to synchronize schedules across multiple rooms.

### Editing a Slot
1.  **Double-clicking** any slot in the grid opens the **Edit Popover**.
2.  The **Start Time**, **End Time**, or **Target Temperature** may then be adjusted.
3.  Clicking **OK** applies the changes locally.

### Resizing and Moving Slots
The **Edit Slots** mode in the header can be toggled to enable boundary adjustments:
*   In this mode, handles appear at the boundaries of each slot.
*   The **handles are dragged** to precisely adjust when a slot starts or ends.

### Splitting and Deleting
*   **Split:** Toggling **Split Slots** mode and clicking anywhere inside an existing slot divides it into two.
*   **Delete:** Clicking **Delete** within the Edit Popover (opened via double-click) removes the slot and automatically merges the space into the preceding slot.

### Copy and Paste
The **Copy** and **Paste** buttons next to each row allow for quick duplication of a full day's schedule to another day or a different zone.

### Saving Changes
Changes made in the UI remain local until the **Save** button is clicked. This pushes the entire week's schedule for the active zone(s) to the evohome controller.

## Cloud vs Local Control

evoWeb supports two distinct ways of communicating with the evohome system:

1.  **Cloud (Honeywell TCC):** Connection via Honeywell's official APIs. This is the simplest configuration and works with any internet-connected evohome gateway (RFG100 or built-in Wi-Fi).
2.  **Local (MQTT):** Connection to a local [evogateway](https://github.com/zxdavb/evogateway) instance. This mode is significantly faster, works without an internet connection, and provides real-time updates via MQTT.

### Provider Switching
Cloud and Local modes may be toggled at any time:
*   **On the Dashboard:** The dropdown selector in the top-left header may be used.
*   **In the Scheduler:** A long-click (press and hold) on the **Cloud/CPU icon** next to the "Schedule Manager" title initiates the switch. This is particularly useful when the UI is embedded in another system (like openHAB) where the main header might be hidden.

## Installation

### Using Docker (Recommended)
```bash
# 1. Clone and configure
git clone https://github.com/smar000/evohome-Scheduler-GUI.git evoweb
cd evoweb
cp .env.example .env

# 2. Run
docker-compose up -d
```
The UI is accessible at `http://localhost:3330`.

### Manual Installation
Prerequisites: **Node.js 20+**
```bash
npm install
cd frontend && npm install && cd ..
npm run build
npm run start:evoweb
```

## openHAB Integration

evoWeb is designed for embedding. Navigation can be hidden and focus placed on a single zone using URL parameters:

```
http://<your-ip>:3330/?embed=true&zoneId=01
```

**Sitemap Example:**
```
Webview url="http://192.168.1.50:3330/?embed=true&zoneId=123456" height=15
```

For advanced users, see `misc/openhab/` for a wrapper that handles automatic iframe resizing.

---
*Disclaimer: This project is unofficial and not affiliated with Honeywell. Use at your own risk.*
