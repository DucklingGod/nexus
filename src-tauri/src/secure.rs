//! Secure API key storage via the OS keychain (keyring crate).
//!
//! Per SPEC §15.3 the Rust core is the SOLE keychain broker — stored keys are
//! never exposed to the WebView. The UI may store (`secure_set`), delete
//! (`secure_delete`), and check existence (`secure_has`), but it can NEVER read a
//! stored key. Engine calls that need a key have Rust inject it (see `commands`).

use keyring::Entry;

const SERVICE: &str = "nexus.desktop";

fn entry(key: &str) -> Result<Entry, String> {
  Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Internal broker: read a key from the keychain. NOT a Tauri command — never
/// reachable from JS, so a compromised WebView cannot exfiltrate stored keys.
pub fn get_key(key: &str) -> Result<Option<String>, String> {
  match entry(key)?.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

/// Store an API key in the OS keychain.
#[tauri::command]
pub fn secure_set(key: String, value: String) -> Result<(), String> {
  entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Whether a key exists — returns a boolean, never the secret itself.
#[tauri::command]
pub fn secure_has(key: String) -> Result<bool, String> {
  Ok(get_key(&key)?.is_some())
}

/// Delete an API key from the OS keychain.
#[tauri::command]
pub fn secure_delete(key: String) -> Result<(), String> {
  match entry(&key)?.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()), // already gone
    Err(e) => Err(e.to_string()),
  }
}
