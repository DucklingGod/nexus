import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Phase = "idle" | "downloading" | "ready" | "error";

/**
 * Checks for an app update once on launch. If one exists it downloads in the
 * background with a visible progress toast, then prompts the user to restart to
 * apply it. Renders nothing when the app is up to date, offline, or in dev.
 */
export function UpdateNotifier() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState("");
  const [pct, setPct] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void (async () => {
      let update: Update | null = null;
      try {
        update = await check();
      } catch {
        return; // no endpoint / offline / dev build — stay silent
      }
      if (!update) return; // already up to date

      setVersion(update.version);
      setPhase("downloading");
      try {
        let total = 0;
        let got = 0;
        await update.downloadAndInstall((e) => {
          if (e.event === "Started") {
            total = e.data.contentLength ?? 0;
          } else if (e.event === "Progress") {
            got += e.data.chunkLength;
            if (total > 0) setPct(Math.min(100, Math.round((got / total) * 100)));
          } else if (e.event === "Finished") {
            setPct(100);
          }
        });
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    })();
  }, []);

  if (phase === "idle" || dismissed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-80 rounded-lg border border-gold-faint bg-nexus-elevated px-4 py-3 text-sm text-nexus-fg shadow-xl animate-toast">
      {phase === "downloading" && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-nexus-gold">✦</span>
            <span className="font-medium">Downloading update{version ? ` v${version}` : ""}…</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-nexus-bg">
            <div className="h-full bg-nexus-gold transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 text-xs text-nexus-fg opacity-60">{pct}% — keep working; we'll tell you when it's ready.</div>
        </>
      )}

      {phase === "ready" && (
        <>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-nexus-gold">✦</span>
            <span className="font-medium">Update{version ? ` v${version}` : ""} ready</span>
          </div>
          <div className="mb-2.5 text-xs text-nexus-fg opacity-60">Restart Nexus to apply the update.</div>
          <div className="flex gap-2">
            <button
              onClick={() => { void relaunch(); }}
              className="rounded-md bg-nexus-gold px-3 py-1.5 text-xs font-medium text-nexus-bg hover:opacity-90"
            >
              Restart now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-md border border-gold-faint px-3 py-1.5 text-xs text-nexus-fg opacity-70 hover:opacity-100"
            >
              Later
            </button>
          </div>
        </>
      )}

      {phase === "error" && (
        <div className="flex items-center gap-2">
          <span className="text-nexus-gold">✦</span>
          <span className="flex-1">Update download failed — we'll retry next launch.</span>
          <button onClick={() => setDismissed(true)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
