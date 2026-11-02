# Agent Town

A little 3D town for your local Claude Code and Codex sessions.
Residents work, wait for you, and take coffee breaks. Life animations run locally and use no model tokens.

![Agent Town demo with six project districts and Claude and Codex residents](docs/assets/preview.png)

## Run

Requires Node.js 22.12+ and pnpm 11. The live bridge currently supports macOS with
[MH Desk Pets](https://github.com/chesterXalan/mh-desk-pets) installed and its hooks configured.
The desktop app does not need to be running.

```sh
pnpm install
pnpm start
```

Open **http://127.0.0.1:2510**. Use the top-right **Settings** gear for language, appearance, and demo mode,
or open `/?demo=1` to visit without a bridge. English, Traditional Chinese, and Japanese follow your system
by default, with English as the fallback.
Click a resident to find them. Drag to orbit, scroll to zoom, or choose **Take a walk** and use WASD.
Projects get their own districts; busy districts expand into additional wings and campuses.

## Development

```sh
pnpm dev        # API :2510, Vite :2511
pnpm check      # tests, typecheck, production build
```

`AGENT_TOWN_PORT` changes the API port. `AGENT_TOWN_HELPER` overrides the absolute path to
`deskpets-hook` (default: `/Applications/DeskPets.app/Contents/MacOS/deskpets-hook`).
The server always binds to loopback. See [Architecture](docs/architecture.md) for the adapter and scope.

## Credits and licensing

Adapted from our colleague **leolu**'s [sdd-dashboard](https://git.thebarkingdog.tw/leolu/claude-plugins/src/branch/master/apps/sdd-dashboard).
The retained scene, animation, and design-system code is recorded in [Provenance](docs/provenance.md).
The upstream code has no declared repository-wide license; this adaptation remains **private** and is not relicensed.
Kenney models are CC0; see the [asset notice](web/public/office/LICENSE.md).
