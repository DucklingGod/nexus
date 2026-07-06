import { useSettings } from "../SettingsContext";

export default function SshTab() {
  const {
    sshHosts, sshForm, setSshForm, sshEditingId, setSshEditingId, sshTesting,
    saveSshHost, editSshHost, deleteSshHost, testSshHost,
  } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-nexus-muted">Let the agent control remote machines over SSH (e.g. a PC, Mac, or server on your Tailscale network). Authentication uses an SSH <span className="text-nexus-fg/70">key file</span> — the key itself is never read or stored by Nexus; <code className="text-nexus-gold-light">ssh -i &lt;path&gt;</code> reads it from disk. Leave the key path empty to use your default ssh config / agent.</p>

      {/* Add / edit form */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-4">
        <p className="mb-3 text-sm font-medium text-nexus-fg">{sshEditingId ? "Edit host" : "Add a host"}</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={sshForm.name} onChange={e => setSshForm({ ...sshForm, name: e.target.value })} placeholder="Name (e.g. macbook)"
            className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <input value={sshForm.host} onChange={e => setSshForm({ ...sshForm, host: e.target.value })} placeholder="Host (IP / Tailscale name / domain)"
            className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <input value={sshForm.user} onChange={e => setSshForm({ ...sshForm, user: e.target.value })} placeholder="User (e.g. euromoods)"
            className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <input value={sshForm.port} onChange={e => setSshForm({ ...sshForm, port: e.target.value })} placeholder="Port (22)"
            className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <input value={sshForm.key_path} onChange={e => setSshForm({ ...sshForm, key_path: e.target.value })} placeholder="Private key path (optional, e.g. ~/.ssh/id_ed25519)"
            className="col-span-2 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={saveSshHost} className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90">{sshEditingId ? "Update" : "Add host"}</button>
          {sshEditingId && <button onClick={() => { setSshEditingId(null); setSshForm({ name: "", host: "", user: "", port: "22", key_path: "" }); }} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-muted hover:bg-nexus-surface">Cancel</button>}
        </div>
      </div>

      {/* Host list */}
      {sshHosts.length === 0 ? (
        <p className="text-xs text-nexus-muted/60">No SSH hosts yet. Add one above to let the agent run commands on a remote machine.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sshHosts.map(h => (
            <div key={h.id} className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-nexus-fg">{h.name}</p>
                  <p className="truncate font-mono text-[11px] text-nexus-muted">{h.user}@{h.host}:{h.port}{h.key_path ? `  ·  key: ${h.key_path}` : "  ·  default key/agent"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => testSshHost(h)} disabled={sshTesting === h.id}
                    className="rounded-md border border-nexus-border px-2.5 py-1 text-[11px] text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">{sshTesting === h.id ? "…" : "Test"}</button>
                  <button onClick={() => editSshHost(h)} className="rounded-md border border-nexus-border px-2.5 py-1 text-[11px] text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg">Edit</button>
                  <button onClick={() => deleteSshHost(h.id)} className="rounded-md px-2.5 py-1 text-[11px] text-red-400/80 hover:bg-nexus-surface hover:text-red-400">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-nexus-muted/50">The agent reaches these hosts via the <code className="text-nexus-gold-light">ssh_exec</code> / <code className="text-nexus-gold-light">ssh_upload</code> / <code className="text-nexus-gold-light">ssh_download</code> tools. Ask it to "run a command on &lt;name&gt;" or "copy a file to &lt;name&gt;".</p>
    </div>
  );
}
