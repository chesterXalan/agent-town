# Agent Town design

The scene and visual language retain sdd-dashboard's pixel neobrutalist style.

- Square corners, 2 px borders, hard `shadow-brutal` / `shadow-brutal-sm` shadows, 4 px spacing units.
- Use semantic CSS tokens from `web/src/index.css`; no hard-coded scene colors.
- Typography: `text-display`, `text-title`, `text-ui`, `text-body`, `text-label`, `text-mono`, `text-num`, `text-num-xl`.
- Status colors: `run` for working, `warn` for waiting, `ok` for idle, muted for unknown.
- English, Traditional Chinese, and Japanese UI; preserve user-provided session titles and directory names.
- Language follows the system by default, with English fallback; explicit preferences persist in browser storage.
- Labeled icon buttons and keyboard focus indicators; show district counts only above one.
- The top-right Settings popover contains language, appearance, connection status, and the demo switch.
- A scrolling resident list beside a bounded canvas; a stacked layout below 720 px.
- Theme defaults to the system. Scene lighting follows local time independently of the UI theme.
- Geographic carpet tokens identify six reusable slots; runtime labels identify actual projects.
- Keep style/token regression tests intact. Update this document when changing shared UI or tokens.

District labels render in a dedicated DOM layer outside the canvas renderer; detail cards stay above that layer.
