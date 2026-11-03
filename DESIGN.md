# Agent Town design

The scene and visual language retain sdd-dashboard's pixel neobrutalist style.

- Square corners, 2 px borders, hard `shadow-brutal` / `shadow-brutal-sm` shadows, 4 px spacing units.
- Use semantic CSS tokens from `web/src/index.css`; no hard-coded scene colors.
- Typography: `text-display`, `text-title`, `text-ui`, `text-body`, `text-label`, `text-mono`, `text-num`, `text-num-xl`.
- Status colors: `run` for working, `warn` for waiting, `ok` for idle, muted for unknown.
- English, Traditional Chinese, and Japanese UI; preserve user-provided session titles and directory names.
- Language follows the system by default, with English fallback; explicit preferences persist in browser storage.
- Labeled icon buttons and keyboard focus indicators; show district counts only above one.
- The top-right Settings popover contains language, graphics quality, frame rate, zoom sensitivity, city search, connection status, and the demo switch.
- A separate header button cycles system/light/dark appearance. Time and weather each have one toolbar selector:
  follow the selected city or use a manual override, without duplicate controls in Settings.
- Default to Balanced quality and 30 FPS; offer 10, 15, 20, 30, or 60 FPS without restarting the scene.
- Graphics quality and frame rate persist independently; never overwrite an existing frame-rate preference.
  Power saver disables shadows at 1× rendering resolution; Balanced uses 2048 px shadows at 1×;
  High retains 4096 px shadows and up to 1.5× resolution. Recommend 15 FPS for High, 30 FPS otherwise.
  Quality changes preserve the camera and residents, release obsolete shadow targets, and refresh paused scenes once.
- Zoom sensitivity defaults to 2×, with persisted 1×–4× choices that preserve the camera position.
- Resident status badges are keyboard-accessible 44 px selection targets; desks also select their owner.
- Selecting and closing a resident smoothly transitions between close-up and overview, unless reduced motion is enabled.
- App installation uses the browser’s built-in controls. PWA updates require an explicit reload; lost server connections remain visible above the town.
- A scrolling resident list beside a bounded canvas; a stacked layout below 720 px.
- Theme defaults to the system. Scene lighting follows the selected city's sunlight independently of the UI theme.
- Use approximate network location unless the user selects a city. Manual selection always wins and persists.
- Settings shows the city result directly below its heading, with re-detection or a return to network location on the right.
  Network estimates include a short source credit; stale estimates retain an explicit status message.
- If no location is available, automatic daylight uses the device clock and weather stays clear.
- Show city-local sunrise/sunset and weather observation time in Settings; label cached or unavailable weather explicitly.
- Geographic carpet tokens identify six reusable slots; runtime labels identify actual projects.
- Keep style/token regression tests intact. Update this document when changing shared UI or tokens.

District labels render in a dedicated DOM layer outside the canvas renderer; detail cards stay above that layer.
