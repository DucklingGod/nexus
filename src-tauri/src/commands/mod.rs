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
use tauri::State;

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
    let mut params = json!({
        "messages": messages, "model": model, "baseUrl": base_url, "apiKey": api_key,
        "webKeys": { "tavily": tavily, "brave": brave },
        "mediaKeys": { "openai": openai },
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

/// Generic engine RPC passthrough. For methods that don't need key brokering.
#[tauri::command]
pub fn engine_rpc(state: State<'_, AppState>, method: String, params: Value) -> Result<Value, String> {
    state.sidecar.request(&method, params)
}

/// Start a platform connector (Telegram/Discord). Brokers the provider key + the
/// platform bot token from the keychain; neither is exposed to the WebView.
#[tauri::command]
pub fn connector_start(
    state: State<'_, AppState>,
    platform: String,
    provider: String,
    model: String,
    base_url: String,
) -> Result<Value, String> {
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
