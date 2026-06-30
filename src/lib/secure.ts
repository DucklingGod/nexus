import { invoke } from "@tauri-apps/api/core";

// ponytail: thin wrappers around Tauri IPC commands for secure storage

export async function secureSet(key: string, value: string): Promise<void> {
  await invoke("secure_set", { key, value });
}

// No secureGet: the WebView can never read a stored key (SPEC §15.3).
// Engine calls that need a key have Rust broker it from the keychain.
export async function secureHas(key: string): Promise<boolean> {
  return await invoke<boolean>("secure_has", { key });
}

export async function secureDelete(key: string): Promise<void> {
  await invoke("secure_delete", { key });
}
