// docsgraph desktop shell — a Tauri window wrapping the `apps/web`
// frontend (see ../tauri.conf.json for `devUrl`/`frontendDist`).
//
// Intentionally the default Tauri hello-world entry point: no custom
// commands are registered yet. Add `#[tauri::command]` functions and
// `.invoke_handler(tauri::generate_handler![...])` here once the desktop
// shell needs to expose native functionality (e.g. the native SQLite
// adapter in `packages/data/src/sqlite/native.ts`) to the frontend.

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running docsgraph desktop application");
}
