# Agent Town

Read README.md and DESIGN.md before changing behavior or UI.

- Keep `server/` → `shared/` → `web/src/` boundaries; do not import server modules into the browser.
- Preserve the read-only local integration. Never add external business integrations or change CLI hooks implicitly.
- Use pnpm, strict TypeScript, TanStack Query, and SSE for live data.
- Write new comments, documentation, and Gitmoji + Conventional Commit messages in English.
- Localize user-facing text in English, Traditional Chinese, and Japanese using the bundled i18next resources.
  Retain source attribution and asset notices.
- Run `pnpm check` for code changes. Pure tests use `// @vitest-environment node`.
- Use fake timers for time-dependent tests. Do not weaken style or token tests.
- Manually verify browser changes with ego-browser; do not add an E2E framework to this repository.
- Keep this repository private until the upstream code's licensing is resolved.
