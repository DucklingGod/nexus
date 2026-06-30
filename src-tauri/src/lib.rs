mod commands;
mod secure;
mod sidecar;

use std::sync::Arc;

use serde_json::json;
use tauri::{Emitter, Manager};

/// Shared application state. Holds the engine sidecar (internally synchronized).
pub struct AppState {
    pub sidecar: Arc<sidecar::Sidecar>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|_| ".".into());

            // Forward engine notifications (e.g. chat.delta) to the UI as a
            // single "engine-event" Tauri event carrying { method, params }.
            let handle = app.handle().clone();
            // Non-fatal: if the engine can't start, still open the window so the
            // user sees the UI (commands will surface the failure) instead of the
            // app silently exiting — there's no console in a release build.
            match sidecar::Sidecar::spawn(&data_dir, move |method, params| {
                let _ = handle.emit("engine-event", json!({ "method": method, "params": params }));
            }) {
                Ok(sidecar) => {
                    match sidecar.request("engine.health", serde_json::Value::Null) {
                        Ok(info) => println!("Engine connected: {info}"),
                        Err(e) => eprintln!("Engine health check failed: {e}"),
                    }
                    app.manage(AppState { sidecar });
                }
                Err(e) => eprintln!("Failed to start engine sidecar: {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::engine_health,
            commands::chat_send,
            commands::provider_test,
            commands::provider_set,
            commands::provider_get,
            commands::provider_list_models,
            commands::agent_personality_set,
            commands::agent_personality_get,
            commands::engine_rpc,
            commands::connector_start,
            commands::connector_stop,
            commands::connector_status,
            commands::workflow_run,
            secure::secure_set,
            secure::secure_has,
            secure::secure_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
