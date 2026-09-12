# frontend

The blotter's web app: Next.js 16 App Router, React 19, Tailwind v4, TanStack Query and Table,
socket.io-client. Run it through the root scripts described in the [repository README](../README.md).

```
src/app/          routes: the authenticated group, /login, providers, the global stylesheet and tokens
src/providers/    query client, session, theme, and the socket that patches the cache
src/components/   ui primitives, shell, blotter, trade, positions, audit, auth
src/hooks/        camelCase hooks in snake_case files, per React's rules-of-hooks
src/lib/          api clients, query keys and the cache patch, formatting, permissions, stores
src/types/        data shapes the components share
e2e/              Playwright journeys, run with the compose stack up
scripts/          the Lighthouse audit and the README image capture
```

`npm test` runs the unit tier (vitest, jsdom). `npm run test:e2e` runs Playwright against
`http://localhost:3000`, or `E2E_BASE_URL`. Both are wired into the root `package.json`.

The design tokens in `src/app/globals.css` are ported verbatim from
[the prototype](../docs/artifacts/fusion_blotter_prototype.html) and mapped onto Tailwind utilities
with `@theme inline`, so `bg-glass` and `text-gain` follow the active theme at runtime. The
behaviour is specified in
[the interface behaviour design](../docs/superpowers/specs/2026-09-12-interface-behaviour-design.md).
