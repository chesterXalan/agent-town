# Architecture

`server/` → `shared/` → `web/src/`. React 19, Three.js / React Three Fiber, Vite, Hono, Bun, and TanStack Query.

The server uses Bun’s native HTTP server and the Hono Bun static-file adapter.
Bun also runs Vite, Vitest, TypeScript, and Prettier; dependency versions are pinned in `bun.lock`.
SSE requests disable Bun’s per-request idle timeout. SIGINT and SIGTERM close active connections.

## State adapter

The server invokes the installed `deskpets-hook list` executable with a fixed argument array, without a shell.
That bridge supplies live processes, provider, PID, hook state, friendly title, and working directory.
It reuses MH Desk Pets' established PID/start-time and session-ID matching, including tmux and ordinary terminals.
A directory is used to group residents, never to merge their identities in Agent Town.

Scans are bounded to five seconds and 1 MiB, shared between simultaneous requests, and cached for one second.
Open SSE connections request a scan every two seconds; without a browser, no background scan is scheduled.
Unavailable or failed bridges clear residents and display a source warning. Missing hooks remain `unknown`.
If a browser loses its server connection, it labels the retained snapshot as potentially stale.

The session API exposes only metadata. Agent Town does not read or store prompts, tool arguments,
terminal output, or transcripts. The separately installed bridge may inspect local transcript metadata to derive titles.
Titles and paths stay on the local machine. The optional weather integration sends only city searches or
selected coordinates to Open-Meteo; no session information or telemetry is sent.
Automatic location queries IPWhois from the local server's public egress IP; that provider receives no session metadata.

GET `/api/town` returns a snapshot. GET `/api/events` streams changed snapshots and heartbeats.
API responses are not cached. Foreign hosts/origins and write methods are rejected; the server binds only to `127.0.0.1`, advertised as `http://localhost:2510`.

## Weather and sunlight

GET `/api/location` estimates the local server's network location using `https://ipwho.is/`.
It requests only city, region, country, approximate coordinates and timezone; raw IP/ISP fields are neither returned nor stored.
Successful estimates are shared between tabs for one hour. `?refresh=1` allows explicit re-detection with a ten-second
cooldown; failures back off for one minute. Retained estimates are labeled stale and expire after 24 hours.
The client refreshes hourly while visible (once per minute after failure), only when no manual city is selected.
Manual cities persist across reloads and take priority even if an in-flight network lookup finishes later.
There is no browser location permission prompt. VPNs, proxies and network changes can affect the estimate;
the Settings re-detection button provides an immediate refresh after the cooldown.

GET `/api/cities?q=…&language=…` searches Open-Meteo's GeoNames geocoding service.
GET `/api/weather?latitude=…&longitude=…` maps its current WMO weather code to a scene condition.
Both providers have fixed HTTPS endpoints and eight-second timeouts. Requests validate input and retain the local-only API boundary.
Weather estimates are shared between tabs with a bounded, in-memory 15-minute cache and deduplicated requests;
provider failures back off for one minute. The client refreshes every 15 minutes while visible, only in automatic mode.
The last successful reading for the selected coordinates survives reloads. Failures retain it with a cached label,
but readings older than 24 hours are discarded and the scene falls back to clear with an unavailable message.

SunCalc computes the sun's direction and twilight from coordinates, independently of the network.
Sunrise/sunset use the selected city's calendar day and timezone, including DST and polar day/night.
Manual cities and time/weather overrides persist locally. If neither a manual city nor a network estimate is available,
the original device-clock day/night cycle and clear weather remain available.

## Town

Each working directory gets a district. There are six districts per campus and at most twelve residents per wing.
Additional wings/campuses preserve every resident without overlapping desks. Ordering is deterministic by directory;
adding/removing a project can change its campus slot. Browser theme and language preferences are persisted locally.
Language defaults to the primary system language (English, Chinese, or Japanese), otherwise English.
Bundled i18next resources translate UI, demo titles, and speech at render time; language changes do not reset the scene.

Observed session state and simulated life are separate: `working` types, `waiting` asks for attention,
`idle` rests, and `unknown` remains explicitly labeled. All walking, breaks, and weather effects are local animation.
The canvas defaults to Balanced quality at 30 FPS. Settings offers 10, 15, 20, 30, or 60 FPS;
quality and frame rate persist independently, preserving existing frame-rate preferences.
Power saver disables shadows at 1× pixel ratio, Balanced uses 2048 px shadows at 1×,
and High retains 4096 px shadows at up to 1.5×. High recommends 15 FPS; the other profiles recommend 30 FPS.
Quality changes release obsolete shadow targets and preserve the camera and residents.
Changing the drawing rate preserves simulation time. The canvas stops while hidden or paused,
refreshes a paused scene once when quality changes, and respects reduced-motion preference.

Selecting a resident smoothly follows their movement using the existing frame clock, preserving orbit, zoom,
and manual pan offsets. Closing the card, losing the resident, or changing campus ends following;
first-person mode retains independent camera controls.

## Installed app

The production build generates a standalone web app manifest and a Workbox service worker.
Only build assets, fonts, icons, and GLB models are precached; APIs and SSE always use the network.
Navigation fallback excludes `/api`, so unavailable endpoints cannot return the cached app shell.
The offline shell can show the demo, but live mode explicitly marks a disconnected service.
Town queries can reach the loopback server even when the browser reports no internet connection.
New builds offer a reload action rather than replacing an active scene automatically.
Installation still uses the browser engine and requires the local server for live sessions.
Preferences and installations are origin-specific: use a consistent host and port.

## First-version boundaries

- Live source: macOS plus the MH Desk Pets bridge; demo mode works independently.
- Main CLI sessions only. Subagent-level tracking needs a future provider adapter.
- Read-only observation; no terminal focus, command execution in sessions, or hook installation from the page.
- The upstream business dashboards, SDD review events, NPC story scheduler, and company integrations are not connected.
  Retained pure animation primitives remain available for future town events.
- Human residents first. Monster companions can later be added as a separate renderer using existing frame assets.
- Friendly titles and state resolution have the same limits as the installed bridge, including ambiguous provider metadata.
