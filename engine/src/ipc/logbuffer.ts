// In-memory ring buffer of engine logs, for the Settings → Logs viewer.
// stdout is reserved for JSON-RPC; all human-readable logs go to stderr, so we
// intercept stderr once and keep the last N lines (tool exec, MCP, scheduler,
// connectors, errors, etc.).

export interface LogLine { ts: number; text: string }

const MAX = 800;
const buffer: LogLine[] = [];

export function pushLog(text: string): void {
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line) continue;
    buffer.push({ ts: Date.now(), text: line });
    if (buffer.length > MAX) buffer.shift();
  }
}

export function getLogs(limit = 500): LogLine[] {
  return buffer.length > limit ? buffer.slice(buffer.length - limit) : [...buffer];
}

export function clearLogs(): void {
  buffer.length = 0;
}

let installed = false;

/** Wrap process.stderr.write once so every log line is also kept in the buffer. */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;
  const stream = process.stderr as unknown as { write: (...args: unknown[]) => boolean };
  const orig = stream.write.bind(process.stderr);
  stream.write = (...args: unknown[]) => {
    try {
      const chunk = args[0];
      if (typeof chunk === "string") pushLog(chunk);
    } catch {
      /* logging must never throw */
    }
    return orig(...args);
  };
}
