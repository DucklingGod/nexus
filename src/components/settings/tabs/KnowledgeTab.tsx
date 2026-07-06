import { useSettings } from "../SettingsContext";

export default function KnowledgeTab() {
  const {
    docs, docTitle, setDocTitle, docContent, setDocContent,
    docPath, setDocPath, folders, folderSyncing, vaults, vaultSyncing,
    saving, handleAddDoc, handleIngestFile, handleDeleteDoc,
    handleAddFolder, handleRemoveFolder, handleSyncFolders,
    handleAddVault, handleRemoveVault, handleSyncVaults,
  } = useSettings();

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-nexus-muted">Add documents the agent can search and cite during chats (RAG). Embeddings are computed on first use with your provider key.</p>
      <div className="flex flex-col gap-2">
        <input type="text" value={docTitle} onChange={e => setDocTitle(e.target.value)}
          placeholder="Document title"
          className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <textarea value={docContent} onChange={e => setDocContent(e.target.value)}
          rows={5} placeholder="Paste document text here…"
          className="w-full resize-none rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <button onClick={handleAddDoc} disabled={saving || !docContent.trim()}
          className="self-start rounded-lg bg-nexus-accent px-5 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Add text</button>
      </div>
      <div className="flex gap-2">
        <input type="text" value={docPath} onChange={e => setDocPath(e.target.value)}
          placeholder="C:\\path\\to\\file.pdf  (PDF, DOCX, XLSX, CSV, TXT, MD)"
          className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <button onClick={handleIngestFile} disabled={saving || !docPath.trim()}
          className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Ingest file</button>
      </div>

      <div className="flex flex-col gap-2 border-t border-nexus-border/40 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-nexus-fg">Watched folders ({folders.length})</h3>
          <div className="flex gap-2">
            <button onClick={handleAddFolder} className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-fg hover:bg-nexus-surface">+ Add folder</button>
            <button onClick={handleSyncFolders} disabled={folderSyncing || folders.length === 0} className="rounded-lg bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50">{folderSyncing ? "Syncing…" : "Sync now"}</button>
          </div>
        </div>
        {folders.length === 0 ? (
          <p className="text-xs text-nexus-muted">No folders. Add a folder to auto-index its files (PDF/DOCX/XLSX/CSV/TXT/MD/JSON) into the knowledge base.</p>
        ) : folders.map(f => (
          <div key={f} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2">
            <span className="truncate text-xs text-nexus-fg">{f}</span>
            <button onClick={() => handleRemoveFolder(f)} className="ml-2 flex-shrink-0 text-xs text-red-400 hover:text-red-300">Remove</button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-nexus-border/40 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-nexus-fg">Obsidian vaults ({vaults.length})</h3>
          <div className="flex gap-2">
            <button onClick={handleAddVault} className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-fg hover:bg-nexus-surface">+ Add vault</button>
            <button onClick={handleSyncVaults} disabled={vaultSyncing || vaults.length === 0} className="rounded-lg bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50">{vaultSyncing ? "Syncing…" : "Sync now"}</button>
          </div>
        </div>
        <p className="text-xs text-nexus-muted">Index an Obsidian vault: strips YAML frontmatter, captures tags, and resolves <code className="text-nexus-gold-light">[[wikilinks]]</code> into linked-note context so graph neighborhood is searchable.</p>
        {vaults.length === 0 ? (
          <p className="text-xs text-nexus-muted">No vaults. Add a vault folder to index its markdown notes.</p>
        ) : vaults.map(v => (
          <div key={v} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2">
            <span className="truncate text-xs text-nexus-fg">{v}</span>
            <button onClick={() => handleRemoveVault(v)} className="ml-2 flex-shrink-0 text-xs text-red-400 hover:text-red-300">Remove</button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-nexus-fg">Documents ({docs.length})</h3>
        {docs.length === 0 ? (
          <p className="text-xs text-nexus-muted">No documents yet.</p>
        ) : docs.map(d => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2">
            <span className="text-sm text-nexus-fg">{d.title} <span className="text-xs text-nexus-muted">· {d.chunks} chunks</span></span>
            <button onClick={() => handleDeleteDoc(d.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
