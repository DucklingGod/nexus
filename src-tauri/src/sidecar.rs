//! Manages the TypeScript agent engine running as a Node sidecar.
//! Transport: newline-delimited JSON-RPC 2.0 over the child's stdio (SPEC §14).
//!
//! A background reader thread demultiplexes the engine's stdout:
//!   - responses (have `id` + `result`/`error`) resolve the matching pending call
//!   - notifications (have `method`, e.g. `chat.delta`) are handed to `on_notify`
//!     which the app forwards to the UI as Tauri events (streaming).
//!
//! `request` is synchronous (blocks until the response); callers that may block
//! for a while (chat) run it from an async command so the UI thread stays free.
//! Dev resolves the engine via CARGO_MANIFEST_DIR; production will spawn the
//! bundled sidecar binary instead (TODO).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

type Pending = Arc<Mutex<HashMap<u64, Sender<Result<Value, String>>>>>;

/// Find the Node.js executable.
/// Priority: NEXUS_NODE env var > PATH > common Windows/macOS install locations.
fn find_node() -> String {
    // 1. Environment override
    if let Ok(custom) = std::env::var("NEXUS_NODE") {
        if std::path::Path::new(&custom).exists() {
            return custom;
        }
    }
    // 2. Try PATH (works in dev and when node is on PATH)
    if Command::new("node").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok() {
        return "node".to_string();
    }
    // 3. Common Windows locations
    for candidate in [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
    ] {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    // 4. Windows AppData local install
    if let Ok(appdata) = std::env::var("LOCALAPPDATA") {
        let p = format!("{}\\Programs\\nodejs\\node.exe", appdata);
        if std::path::Path::new(&p).exists() {
            return p;
        }
    }
    // 5. macOS nvm — load from shell profile
    if cfg!(target_os = "macos") {
        if let Ok(home) = std::env::var("HOME") {
            // Check nvm default alias
            let nvm_default = format!("{}/.nvm/alias/default", home);
            if let Ok(ver) = std::fs::read_to_string(&nvm_default) {
                let ver = ver.trim();
                let nvm_node = format!("{}/.nvm/versions/node/{}/bin/node", home, ver);
                if std::path::Path::new(&nvm_node).exists() {
                    return nvm_node;
                }
            }
            // Scan nvm versions directory for latest
            let versions_dir = format!("{}/.nvm/versions/node", home);
            if let Ok(entries) = std::fs::read_dir(&versions_dir) {
                let mut versions: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .filter_map(|e| e.file_name().into_string().ok())
                    .filter(|n| n.starts_with('v'))
                    .collect();
                versions.sort();
                if let Some(latest) = versions.last() {
                    let nvm_node = format!("{}/.nvm/versions/node/{}/bin/node", home, latest);
                    if std::path::Path::new(&nvm_node).exists() {
                        return nvm_node;
                    }
                }
            }
            // Homebrew
            let brew_node = "/opt/homebrew/bin/node";
            if std::path::Path::new(brew_node).exists() {
                return brew_node.to_string();
            }
        }
    }
    // Fallback: hope it's on PATH
    "node".to_string()
}

/// Resolve the current user's home directory in a cross-platform way without
/// pulling in the `dirs` crate. Returns None if it can't be determined.
fn home_dir() -> Option<String> {
    // Windows: %USERPROFILE%; Unix: $HOME
    if cfg!(target_os = "windows") {
        if let Ok(p) = std::env::var("USERPROFILE") {
            if !p.trim().is_empty() {
                return Some(p);
            }
        }
        // %HOMEDRIVE%%HOMEPATH% fallback (e.g. C:\Users\name)
        let drive = std::env::var("HOMEDRIVE").ok();
        let path = std::env::var("HOMEPATH").ok();
        if let (Some(d), Some(p)) = (drive, path) {
            return Some(format!("{d}{p}"));
        }
        return None;
    }
    std::env::var("HOME").ok().filter(|s| !s.trim().is_empty())
}

pub struct Sidecar {
    stdin: Option<Mutex<ChildStdin>>,
    pending: Pending,
    next_id: AtomicU64,
    child: Option<Mutex<Child>>,
    alive: bool,
}

impl Sidecar {
    /// Create a dummy sidecar that returns errors for all requests.
    /// Used when the engine fails to spawn so AppState is still managed.
    pub fn dummy() -> Self {
        Self {
            stdin: None,
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            child: None,
            alive: false,
        }
    }

    /// Spawn `node engine/src/main.ts` (Node 24 runs TypeScript natively).
    /// `data_dir` is handed to the engine for its SQLite database.
    /// `on_notify(method, params)` receives engine notifications.
    pub fn spawn<F>(data_dir: &str, on_notify: F) -> std::io::Result<Arc<Self>>
    where
        F: Fn(&str, Value) + Send + 'static,
    {
        // Engine lives at ../engine/ relative to src-tauri/.
        // CARGO_MANIFEST_DIR is baked at compile time — correct after rebuild.
        let engine = std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../engine/src/main.ts"));

        // Find node executable: NEXUS_NODE env > PATH > common Windows locations
        let node = find_node();

        // Default the engine's working directory to the user's home so relative
        // paths and `terminal_exec` resolve there (not the app bundle dir).
        // Users can override via NEXUS_WORKDIR. Absolute paths reach anywhere.
        let workdir = std::env::var("NEXUS_WORKDIR")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(home_dir)
            .unwrap_or_else(|| data_dir.to_string());

        let mut child = Command::new(&node)
            .arg(&engine)
            .env("NEXUS_DATA_DIR", data_dir)
            .env("NEXUS_WORKDIR", &workdir)
            .current_dir(&workdir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");

        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));

        // Engine stderr (incl. "Nexus Engine Ready") → our console.
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[engine] {line}");
            }
        });

        // Demux stdout: responses resolve pending calls; notifications → on_notify.
        let pending_reader = pending.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(v) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(method) = v.get("method").and_then(Value::as_str) {
                    on_notify(method, v.get("params").cloned().unwrap_or(Value::Null));
                } else if let Some(id) = v.get("id").and_then(Value::as_u64) {
                    if let Some(tx) = pending_reader.lock().unwrap().remove(&id) {
                        let result = match v.get("error") {
                            Some(err) => Err(err.to_string()),
                            None => Ok(v.get("result").cloned().unwrap_or(Value::Null)),
                        };
                        let _ = tx.send(result);
                    }
                }
            }
        });

        Ok(Arc::new(Self {
            stdin: Some(Mutex::new(stdin)),
            pending,
            next_id: AtomicU64::new(1),
            child: Some(Mutex::new(child)),
            alive: true,
        }))
    }

    /// Send a JSON-RPC request and block until its response.
    pub fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        if !self.alive {
            return Err("Engine not running — sidecar failed to start".to_string());
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = channel();
        self.pending.lock().map_err(|e| e.to_string())?.insert(id, tx);

        let mut payload = serde_json::to_string(
            &json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
        )
        .map_err(|e| e.to_string())?;
        payload.push('\n');
        {
            let stdin = self.stdin.as_ref().ok_or("no stdin")?;
            let mut stdin = stdin.lock().map_err(|e| e.to_string())?;
            stdin.write_all(payload.as_bytes()).map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
        }

        rx.recv().map_err(|_| "engine closed the connection".to_string())?
    }

    /// Abort all pending requests — the agent loop will stop because the pending
    /// channels are dropped, causing the engine to get a closed-connection error
    /// on its next response write.  We also fire a `chat.abort` notification so
    /// the engine can stop mid-stream if it wants to.
    pub fn abort(&self) {
        if !self.alive { return; }
        // 1. Drop all pending senders → rx.recv() in request() returns Err → caller gets error
        if let Ok(mut map) = self.pending.lock() {
            map.clear();
        }
        // 2. Tell the engine to stop (best-effort — engine may ignore if not streaming)
        let notification = serde_json::to_string(
            &json!({ "jsonrpc": "2.0", "method": "chat.abort", "params": {} }),
        );
        if let (Ok(mut payload), Some(stdin)) = (notification, &self.stdin) {
            payload.push('\n');
            if let Ok(mut stdin) = stdin.lock() {
                let _ = stdin.write_all(payload.as_bytes());
                let _ = stdin.flush();
            }
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        if let Some(child) = &self.child {
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spawn_test() -> Arc<Sidecar> {
        let tmp = std::env::temp_dir();
        Sidecar::spawn(tmp.to_str().unwrap(), |_, _| {}).expect("spawn engine")
    }

    // End-to-end: Rust spawns the Node engine, sends JSON-RPC, reads the reply
    // through the demux reader.
    #[test]
    fn health_roundtrip() {
        let sidecar = spawn_test();
        let result = sidecar.request("engine.health", Value::Null).expect("health request");
        assert_eq!(result["ok"], json!(true));
        assert!(result["version"].is_string());
    }

    #[test]
    fn unknown_method_is_error() {
        let sidecar = spawn_test();
        assert!(sidecar.request("does.not.exist", Value::Null).is_err());
    }

    // Two sequential requests reuse the one engine + reader thread correctly.
    #[test]
    fn sequential_requests() {
        let sidecar = spawn_test();
        assert!(sidecar.request("engine.health", Value::Null).is_ok());
        assert!(sidecar.request("engine.health", Value::Null).is_ok());
    }
}
