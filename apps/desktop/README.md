# @docsgraph/desktop

Tauri desktop shell wrapping the `apps/web` frontend — same web app, native
window via Rust/WebView2/WebKitGTK.

## Frontend wiring

`src-tauri/tauri.conf.json` points `build.frontendDist` at
`../../web/dist` (i.e. `apps/web/dist`, the built web app) and
`build.devUrl` at `apps/web`'s Vite dev server (`http://localhost:5173`).
`beforeDevCommand`/`beforeBuildCommand` shell out to
`pnpm --filter @docsgraph/web dev|build` so `tauri dev`/`tauri build` from
this directory build the same frontend as `apps/web` rather than a
separate copy.

## Running

This package intentionally has **no** `dev`/`build`/`lint`/`typecheck`/
`test` npm scripts, so Turborepo's root pipeline (`pnpm dev`/`pnpm build`)
skips it. Rust/Tauri builds need the Rust toolchain and platform build
dependencies (on Linux: `libwebkit2gtk`, `libgtk-3`, etc. — see
[Tauri's prerequisites](https://tauri.app/start/prerequisites/)), which
this scaffold does not assume are present in every dev/CI environment.
Once those are available, run manually:

```sh
pnpm --filter @docsgraph/desktop tauri dev
pnpm --filter @docsgraph/desktop tauri build
```

## TODO

- App icons referenced in `tauri.conf.json`'s `bundle.icon` don't exist
  yet — generate them with `pnpm --filter @docsgraph/desktop tauri icon
  <path-to-source-image>` before running a real `tauri build`.
