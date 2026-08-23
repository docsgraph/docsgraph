# Contributing to docsgraph

## Dev environment

- Node 22 (matches CI; Node 20+ also works locally)
- pnpm, activated via Corepack: `corepack enable && corepack prepare pnpm@9.15.9 --activate`
- For `apps/desktop` work: the Rust toolchain (`rustup`) and the [Tauri
  CLI prerequisites](https://tauri.app/start/prerequisites/) for your
  platform

Install dependencies once at the repo root — this is a pnpm workspace, so
a single `pnpm install` links all `apps/*`/`packages/*`:

```sh
pnpm install
```

## Before opening a PR

Run the same checks CI runs, from the repo root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four are Turborepo pipelines (`turbo run <task>`) that fan out across
every app/package that defines that script, so they run against your
whole change set, not just the package you touched.

## Guidelines

For commit style, branch naming, and review expectations shared across
docsgraph's repos, see [github.com/docsgraph/.github](https://github.com/docsgraph/.github).

## UI Architecture Guidelines

- **Shared UI Components**: Common UI elements (like buttons, dialogs, form controls, list items, search widgets, or graph elements) that are platform-agnostic live in the `packages/ui` workspace package. Both the web target (`apps/web`) and the desktop shell (`apps/desktop`) consume this shared package.
- **Platform-Specific UI**: Any shell integration, window management controls, or custom layouts specific to a platform live directly in the corresponding app directory (e.g. platform navigation wrappers in `apps/web` or custom window listeners).
