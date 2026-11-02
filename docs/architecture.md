# Architecture

`server/` → `shared/` → `web/src/`. React 19, Three.js / React Three Fiber, Vite, Hono, and TanStack Query.

## State adapter

The server invokes the installed `deskpets-hook list` executable with a fixed argument array, without a shell.
That bridge supplies live processes, provider, PID, hook state, friendly title, and working directory.
It reuses MH Desk Pets' established PID/start-time and session-ID matching, including tmux and ordinary terminals.
A directory is used to group residents, never to merge their identities in Agent Town.

Scans are bounded to five seconds and 1 MiB, shared between simultaneous requests, and cached for one second.
Open SSE connections request a scan every two seconds; without a browser, no background scan is scheduled.
Unavailable or failed bridges clear residents and display a source warning. Missing hooks remain `unknown`.
If a browser loses its server connection, it labels the retained snapshot as potentially stale.

The HTTP API exposes only session metadata. Agent Town does not read or store prompts, tool arguments,
terminal output, or transcripts. The separately installed bridge may inspect local transcript metadata to derive titles.
Titles and paths stay on the local machine; no telemetry or remote integrations are configured.

GET `/api/town` returns a snapshot. GET `/api/events` streams changed snapshots and heartbeats.
API responses are not cached. Foreign hosts/origins and write methods are rejected; the server binds only to `127.0.0.1`.

## Town

Each working directory gets a district. There are six districts per campus and at most twelve residents per wing.
Additional wings/campuses preserve every resident without overlapping desks. Ordering is deterministic by directory;
adding/removing a project can change its campus slot. Browser theme and language preferences are persisted locally.
Language defaults to the primary system language (English, Chinese, or Japanese), otherwise English.
Bundled i18next resources translate UI, demo titles, and speech at render time; language changes do not reset the scene.

Observed session state and simulated life are separate: `working` types, `waiting` asks for attention,
`idle` rests, and `unknown` remains explicitly labeled. All walking, breaks, and weather are local animation.
The canvas defaults to 15 FPS; Settings offers 10, 15, 20, or 30 FPS, persisted in browser storage.
Changing the drawing rate preserves simulation time and does not reset the camera or residents.
The canvas stops while hidden or paused, caps device pixel ratio at 1.5, and respects reduced-motion preference.

## First-version boundaries

- Live source: macOS plus the MH Desk Pets bridge; demo mode works independently.
- Main CLI sessions only. Subagent-level tracking needs a future provider adapter.
- Read-only observation; no terminal focus, command execution in sessions, or hook installation from the page.
- The upstream business dashboards, SDD review events, NPC story scheduler, and company integrations are not connected.
  Retained pure animation primitives remain available for future town events.
- Human residents first. Monster companions can later be added as a separate renderer using existing frame assets.
- Friendly titles and state resolution have the same limits as the installed bridge, including ambiguous provider metadata.
