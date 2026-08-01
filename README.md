# docsgraph

Main product monorepo for docsgraph — synchronized web and desktop clients,
shared UI, the local-first document model, knowledge-graph visualization,
search interfaces, contract-analysis features, and the synchronization
client.

docsgraph is a local-first contract/document management platform:
documents live locally, get analyzed, and are explored via search and an
Obsidian-style knowledge-graph view. It works fully offline and syncs when
connected to the companion backend, [`docsgraph-server`](https://github.com/docsgraph/docsgraph-server).

## Layout

| Path                   | Description                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `apps/web`              | Vite + React web app                                                |
| `apps/desktop`          | Tauri app wrapping the web app (`src-tauri/` Rust shell)             |
| `packages/ui`           | Shared React component library                                      |
| `packages/data`         | Local-first data layer: SQLite abstraction, schema/migrations, sync client stub |
| `packages/graph-view`   | Knowledge-graph visualization component (d3-force + canvas)         |
| `packages/search`       | Evidence-grounded search UI/logic placeholder                       |
| `packages/config`       | Shared `tsconfig` base and ESLint flat-config preset                |
| `docs/sync-protocol.md` | Client-server sync contract shared with `docsgraph-server`          |

## Dev setup

Requires Node 20+ and [pnpm](https://pnpm.io) (via Corepack: `corepack
enable && corepack prepare pnpm@9.15.9 --activate`). Desktop work
additionally needs the [Rust toolchain and Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm dev        # turbo run dev — starts apps/web's Vite dev server
pnpm build      # turbo run build
pnpm test       # turbo run test
pnpm lint       # turbo run lint
pnpm typecheck  # turbo run typecheck
```

Desktop-specific commands (not wired into the root pipeline yet — see
`apps/desktop/README.md`):

```sh
pnpm --filter @docsgraph/desktop tauri dev
pnpm --filter @docsgraph/desktop tauri build
```

## Architecture

- **Framework**: React + TypeScript, Vite for the web build.
- **Desktop shell**: Tauri (Rust), wrapping the same `apps/web` frontend.
- **Monorepo**: pnpm workspaces + Turborepo.
- **Styling**: Tailwind CSS.
- **Sync**: local-first. Each client keeps a SQLite copy of its data
  (native SQLite via Tauri's SQL plugin on desktop, `wa-sqlite`/OPFS in
  the browser for web) plus an append-only op log, and syncs against
  `docsgraph-server` over a custom op-based protocol. See
  [`docs/sync-protocol.md`](./docs/sync-protocol.md) for the full contract.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
