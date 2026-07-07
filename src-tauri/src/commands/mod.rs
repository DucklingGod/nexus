//! Tauri IPC commands invoked from the React UI.
//!
//! Secrets: commands that need an API key read it from the OS keychain via
//! `secure::get_key` (Rust is the broker, SPEC §15.3). The key never comes from,
//! nor returns to, the WebView — the UI only ever passes a `provider` id.
//!
//! The slow, network-bound commands (chat, provider tests) are `async` so they
//! run off the UI thread; `chat.send` streams tokens to the UI via the
//! "engine-event" Tauri event while this call blocks for the final result.

use serde_json::{json, Value};
use tauri::{Manager, State};

use crate::{secure, AppState};

/// Resolve a provider's stored API key. Local providers have none → "".
fn key_for(provider: &str) -> Result<String, String> {
    Ok(secure::get_key(&format!("api_key_{provider}"))?.unwrap_or_default())
}

/// Resolve API key, returning empty string for localhost providers.
fn key_for_local_aware(provider: &str, base_url: &str) -> Result<String, String> {
    if base_url.contains("localhost") || base_url.contains("127.0.0.1") {
        Ok(String::new())
    } else {
        key_for(provider)
    }
}

/// Health-check the agent engine sidecar. Returns `{ ok, version }`.
#[tauri::command]
pub fn engine_health(state: State<'_, AppState>) -> Result<Value, String> {
    state.sidecar.request("engine.health", Value::Null)
}

/// Send a chat message. Streams `chat.delta` events; resolves with the final
/// `{ content, model, usage }`. The API key is brokered from the keychain.
#[tauri::command]
pub async fn chat_send(
    state: State<'_, AppState>,
    messages: Vec<Value>,
    model: String,
    provider: String,
    base_url: String,
    reasoning_effort: Option<String>,
    safety_mode: Option<String>,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    // Broker optional web-search keys (Tavily/Brave) from the keychain for in-chat tool use.
    let tavily = secure::get_key("api_key_tavily")?.unwrap_or_default();
    let brave = secure::get_key("api_key_brave")?.unwrap_or_default();
    // Broker OpenAI key for media tools (image_generate, text_to_speech).
    let openai = secure::get_key("api_key_openai")?.unwrap_or_default();
    // Broker optional GitHub token for the search_skills / install_skills tools.
    let github = secure::get_key("api_key_github")?.unwrap_or_default();
    let mut params = json!({
        "messages": messages, "model": model, "baseUrl": base_url, "apiKey": api_key,
        "webKeys": { "tavily": tavily, "brave": brave },
        "mediaKeys": { "openai": openai },
        "githubToken": github,
    });
    if let Some(effort) = reasoning_effort {
        params["reasoningEffort"] = json!(effort);
    }
    if let Some(mode) = safety_mode {
        params["safetyMode"] = json!(mode);
    }
    state.sidecar.request("chat.send", params)
}

/// Abort the current chat request (panic button).
#[tauri::command]
pub fn chat_abort(state: State<'_, AppState>) {
    state.sidecar.abort();
}

/// Test a provider connection using its brokered key.
#[tauri::command]
pub async fn provider_test(
    state: State<'_, AppState>,
    provider: String,
    base_url: String,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    state.sidecar.request(
        "provider.test",
        json!({ "id": provider, "name": provider, "baseUrl": base_url, "apiKey": api_key }),
    )
}

/// List available models from a provider using its brokered key.
#[tauri::command]
pub async fn provider_list_models(
    state: State<'_, AppState>,
    provider: String,
    base_url: String,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    state.sidecar.request(
        "provider.listModels",
        json!({ "id": provider, "name": provider, "baseUrl": base_url, "apiKey": api_key }),
    )
}

/// Save provider selection.
#[tauri::command]
pub fn provider_set(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    state.sidecar.request("provider.set", json!({ "provider": provider, "model": model, "baseUrl": base_url }))
}

/// Get saved provider config.
#[tauri::command]
pub fn provider_get(state: State<'_, AppState>) -> Result<Value, String> {
    state.sidecar.request("provider.get", Value::Null)
}

/// Save agent personality.
#[tauri::command]
pub fn agent_personality_set(
    state: State<'_, AppState>,
    name: Option<String>,
    role: Option<String>,
    tone: Option<String>,
    language: Option<String>,
    instructions: Option<String>,
) -> Result<Value, String> {
    state.sidecar.request(
        "agent.personality.set",
        json!({ "name": name, "role": role, "tone": tone, "language": language, "instructions": instructions }),
    )
}

/// Get agent personality.
#[tauri::command]
pub fn agent_personality_get(state: State<'_, AppState>) -> Result<Value, String> {
    state.sidecar.request("agent.personality.get", Value::Null)
}

/// Generic engine RPC passthrough. Most methods need no key brokering; the skill
/// marketplace calls get an optional GitHub token injected from the keychain to
/// raise GitHub's rate limits. The token never reaches the WebView.
#[tauri::command]
pub fn engine_rpc(state: State<'_, AppState>, method: String, mut params: Value) -> Result<Value, String> {
    if method == "skills.search" || method == "skills.importGithub" {
        if let Ok(Some(tok)) = secure::get_key("api_key_github") {
            if !tok.is_empty() {
                if let Value::Object(ref mut m) = params {
                    m.insert("githubToken".into(), json!(tok));
                }
            }
        }
    }
    state.sidecar.request(&method, params)
}

/// Start a platform connector (Telegram/Discord). Brokers the provider key + the
/// platform bot token from the keychain; neither is exposed to the WebView.
#[tauri::command]
pub fn connector_start(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    platform: String,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    // Stop gateway first to prevent duplicate message processing
    let _ = gateway_stop(app_handle);
    let api_key = key_for_local_aware(&provider, &base_url)?;
    let token = secure::get_key(&format!("api_key_{platform}"))?.unwrap_or_default();
    let openai = secure::get_key("api_key_openai")?.unwrap_or_default();
    if token.is_empty() {
        return Err(format!("No bot token saved for {platform}. Add it first."));
    }
    state.sidecar.request(
        "connector.start",
        json!({
            "platform": platform,
            "token": token,
            "config": { "id": provider, "baseUrl": base_url, "apiKey": api_key, "model": model },
            "mediaKeys": { "openai": openai },
        }),
    )
}

/// Stop a running platform connector.
#[tauri::command]
pub fn connector_stop(state: State<'_, AppState>, platform: String) -> Result<Value, String> {
    state.sidecar.request("connector.stop", json!({ "platform": platform }))
}

/// Status of all platform connectors.
#[tauri::command]
pub fn connector_status(state: State<'_, AppState>) -> Result<Value, String> {
    state.sidecar.request("connector.status", Value::Null)
}

/// Start the gateway as a detached background process.
/// The gateway keeps running even if the app closes.
#[tauri::command]
pub fn gateway_start(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    platform: String,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    // Stop in-app connector first to prevent duplicate message processing
    let _ = state.sidecar.request("connector.stop", json!({ "platform": &platform }));

    // Get bot token from keychain
    let token = secure::get_key(&format!("api_key_{platform}"))?.unwrap_or_default();
    let api_key = key_for_local_aware(&provider, &base_url)?;
    let _openai = secure::get_key("api_key_openai")?.unwrap_or_default();
    if token.is_empty() {
        return Err(format!("No bot token saved for {platform}."));
    }

    // Get data dir for PID file
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    // Build gateway config JSON
    let config = serde_json::json!({
        "platform": platform,
        "token": token,
        "config": {
            "id": provider,
            "name": provider,
            "baseUrl": base_url,
            "apiKey": api_key,
            "model": model
        }
    });

    // Find node executable and gateway script
    // Use same node that runs the engine sidecar
    let engine_dir = std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../engine"));
    let gateway_script = engine_dir.join("src/gateway/main.ts");

    // Spawn detached process
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        std::process::Command::new("node")
            .arg(&gateway_script)
            .env("NEXUS_DATA_DIR", &data_dir)
            .env("NEXUS_GATEWAY_CONFIG", config.to_string())
            .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::process::CommandExt;
        std::process::Command::new("node")
            .arg(&gateway_script)
            .env("NEXUS_DATA_DIR", &data_dir)
            .env("NEXUS_GATEWAY_CONFIG", config.to_string())
            .process_group(0)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(serde_json::json!({ "ok": true }))
}

/// Stop the gateway by killing its PID.
#[tauri::command]
pub fn gateway_stop(app_handle: tauri::AppHandle) -> Result<Value, String> {
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let pid_file = data_dir.join("gateway.pid");

    if !pid_file.exists() {
        return Err("Gateway is not running".to_string());
    }

    let pid_str = std::fs::read_to_string(&pid_file)
        .map_err(|e| e.to_string())?;
    let pid: u32 = pid_str.trim().parse()
        .map_err(|_| "Invalid PID file".to_string())?;

    // Kill the process
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        unsafe { libc::kill(pid as i32, libc::SIGTERM); }
    }

    // Clean up PID file
    let _ = std::fs::remove_file(&pid_file);

    Ok(serde_json::json!({ "ok": true }))
}

/// Restart the gateway (stop + start with new config).
#[tauri::command]
pub fn gateway_restart(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    platform: String,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    // Stop if running (ignore errors if not running)
    let _ = gateway_stop(app_handle.clone());
    // Small delay to ensure process is fully stopped
    std::thread::sleep(std::time::Duration::from_millis(500));
    // Start with new config
    gateway_start(state, app_handle, platform, provider, model, base_url)
}

/// Check if the gateway is running.
#[tauri::command]
pub fn gateway_status(app_handle: tauri::AppHandle) -> Result<Value, String> {
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let pid_file = data_dir.join("gateway.pid");

    if !pid_file.exists() {
        return Ok(serde_json::json!({ "running": false }));
    }

    let pid_str = std::fs::read_to_string(&pid_file)
        .map_err(|e| e.to_string())?;
    let pid: u32 = pid_str.trim().parse()
        .map_err(|_| "Invalid PID file".to_string())?;

    // Check if process is alive
    #[cfg(target_os = "windows")]
    let alive = {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.contains(&pid.to_string())
    };

    #[cfg(not(target_os = "windows"))]
    let alive = {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    };

    if !alive {
        let _ = std::fs::remove_file(&pid_file);
        return Ok(serde_json::json!({ "running": false }));
    }

    Ok(serde_json::json!({ "running": true, "pid": pid }))
}

/// Execute a workflow graph. Brokers the provider key; the engine emits
/// `workflow.node` progress events and returns the final result.
#[tauri::command]
pub async fn workflow_run(
    state: State<'_, AppState>,
    graph: Value,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    state.sidecar.request(
        "workflow.run",
        json!({
            "graph": graph,
            "config": { "id": provider, "baseUrl": base_url, "apiKey": api_key, "model": model },
        }),
    )
}

/// One-off completion (used by the prompt assistant + A/B testing). Brokers the key.
#[tauri::command]
pub async fn complete_once(
    state: State<'_, AppState>,
    text: String,
    system: Option<String>,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    state.sidecar.request(
        "complete.once",
        json!({
            "text": text,
            "system": system,
            "config": { "id": provider, "baseUrl": base_url, "apiKey": api_key, "model": model },
        }),
    )
}

/// Run one prompt-optimization pass (Task 61). Brokers the key; never applies
/// the result automatically — the caller reviews the proposal and calls
/// engine_rpc("optimize.apply") explicitly to accept it.
#[tauri::command]
pub async fn optimize_prompt(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    state.sidecar.request(
        "optimize.run",
        json!({
            "config": { "id": provider, "baseUrl": base_url, "apiKey": api_key, "model": model },
        }),
    )
}

/// Unified Search over documents (Task 53). Brokers the provider key for embeddings.
#[tauri::command]
pub async fn search_documents(
    state: State<'_, AppState>,
    query: String,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
    let api_key = key_for_local_aware(&provider, &base_url)?;
    state.sidecar.request(
        "documents.search",
        json!({
            "query": query,
            "config": { "id": provider, "baseUrl": base_url, "apiKey": api_key, "model": model },
        }),
    )
}
