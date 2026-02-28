# evoWeb: Browser-based Schedule Editor for Honeywell evohome

**evoWeb** provides a modern, responsive web interface for managing Honeywell evohome heating systems. While Honeywell offers mobile apps, it lacks a dedicated browser-based portal for comprehensive schedule management and real-time monitoring.

Designed to be used on larger screens and easily integrated into home automation systems like [openHAB](https://www.openhab.org), evoWeb allows you to view and edit zone schedules across your entire home with ease.

![Dashboard](./misc/other/dayView.png)

## Key Features

*   **Dual-Mode Support:** Seamlessly switch between **Cloud mode** (via Honeywell Total Connect Comfort) and **Local mode** (via [evogateway](https://github.com/zxdavb/evogateway) and MQTT).
*   **Live Dashboard:** Real-time monitoring of zone temperatures, setpoints, and system status.
*   **Comprehensive Scheduler:** View and edit weekly schedules for all heating zones.
*   **Home Automation Integration:** Optimized for embedding in iframes (e.g., openHAB's HABPanel or Basic UI) with automatic resizing support.
*   **Mobile Friendly:** Responsive design with touch-optimized controls for tablets and phones.
*   **Focus Mode:** View real-time status for the specific zone you are currently editing.

## Installation

### Using Docker (Recommended)

The easiest way to run evoWeb is using Docker and Docker Compose.

1.  Clone this repository.
2.  Copy `.env.example` to `.env` and configure your credentials and provider settings.
3.  Run the application:
    ```bash
    docker-compose up -d
    ```
4.  Access the UI at `http://localhost:3330`.

### Manual Installation

Prerequisites: **Node.js 20+**

1.  Install dependencies for both backend and frontend:
    ```bash
    npm install
    cd frontend && npm install && cd ..
    ```
2.  Build the project:
    ```bash
    npm run build
    cd frontend && npm run build && cd ..
    ```
3.  Configure your environment by creating a `.env` file (see `.env.example`).
4.  Start the server:
    ```bash
    npm run start:modern
    ```

## Usage

### Editing Schedules
Navigate to the **Scheduler** tab to manage your heating plans.
*   **Select a Zone:** Use the zone selector to pick the heating zone you wish to modify.
*   **Edit Slots:** Double-click any time slot in the grid to open the edit popover. You can adjust the start/end times and the target temperature.
*   **Save Changes:** Click "Update" to save the individual slot, and then "Save Schedule" to push the entire week's schedule to your evohome controller.
*   **Copy/Paste:** Use the copy and paste buttons to quickly duplicate daily schedules across different days or zones.

*Note: Drag-and-drop editing is currently disabled. Use the double-click method for precise control.*

### Embedding in openHAB
evoWeb supports an **Embed Mode** which hides navigation elements for a cleaner look within other UIs.

1.  Add a Webview element to your sitemap:
    ```
    Webview url="http://<your-ip>:3330/?embed=true&zoneId=01" height=15
    ```
2.  Alternatively, use the provided wrapper in `misc/openhab/evoscheduler.html` for advanced iframe resizing.

## Technology Stack

evoWeb has been modernized from its original jQuery foundation to a robust, type-safe architecture:

*   **Frontend:** Built with **React** and **TypeScript**, using **Zustand** for efficient state management and **Tailwind CSS** for styling.
*   **Backend:** **Node.js (TypeScript)** powered by **Express**, acting as a high-performance proxy and data translator.
*   **Architecture:** Implements a modular **Provider Pattern** to decouple the UI from specific hardware protocols.

## Provider Configuration

evoWeb uses a modular provider pattern to communicate with your heating hardware:

*   **Honeywell Cloud:** Uses your TCC credentials to sync via Honeywell's official APIs.
*   **Local MQTT:** Connects to a local [evogateway](https://github.com/zxdavb/evogateway) instance. This mode is faster and works without an internet connection, provided you have the necessary hardware (e.g., an HGI80 or SSM-D2).

Switching between providers is as simple as updating the `HEATING_PROVIDER` variable in your `.env` file.

---
*Disclaimer: This project is unofficial and not affiliated with Honeywell. Use at your own risk.*
