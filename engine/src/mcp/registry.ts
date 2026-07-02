// MCP registry fetch (Task 55b). Pulls the live catalog of MCP servers from the
// official community registry (registry.modelcontextprotocol.io) — read-only,
// unauthenticated, cursor-paginated. Each entry is normalized to a clean shape
// the marketplace UI can render and install from.
//
// Registry doc: GET /v0.1/servers?limit=N&cursor=...  → { servers: [...], next_cursor }

import { getServers } from "./client.ts";

const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0.1/servers";

export interface CatalogServer {
  id: string;
  name: string;
  title?: string;
  description?: string;
  /** Best transport Nexus can use to connect: "stdio" (local subprocess) or "http" (streamable-HTTP). */
  transport: "stdio" | "http";
  /** Package identifier for stdio installs (e.g. "@modelcontextprotocol/server-filesystem"). */
  packageIdentifier?: string;
  /** Registry type of the package: "npm" | "pypi" | ... (determines the run command). */
  registryType?: string;
  repositoryUrl?: string;
  status?: string;
  /** True if already configured in Nexus (matched by name). */
  installed: boolean;
}

interface RawServer {
  server?: {
    name?: string;
    title?: string;
    description?: string;
    repository?: { url?: string };
    status?: string;
    packages?: Array<{
      registryType?: string;
      identifier?: string;
      transport?: { type?: string };
    }>;
  };
}

interface RawResponse {
  servers?: RawServer[];
  next_cursor?: string;
}

/** Pick the best transport for a raw registry entry: prefer stdio (works fully), then http. */
function pickTransport(raw: RawServer): { transport: "stdio" | "http"; packageIdentifier?: string; registryType?: string } {
  const pkgs = raw.server?.packages ?? [];
  // Prefer a package with a stdio transport + an installable identifier.
  const stdio = pkgs.find((p) => p.transport?.type === "stdio" && p.identifier);
  if (stdio) return { transport: "stdio", packageIdentifier: stdio.identifier, registryType: stdio.registryType };
  // Fall back to any package; map streamable-http/sse → http (Nexus's http transport).
  const any = pkgs.find((p) => p.identifier);
  if (any) {
    const t = any.transport?.type;
    return { transport: t === "stdio" ? "stdio" : "http", packageIdentifier: any.identifier, registryType: any.registryType };
  }
  // No package info → assume http (many catalog servers are remote-only).
  return { transport: "http" };
}

function installedNames(): Set<string> {
  return new Set(getServers().map((s) => s.name));
}

/**
 * Fetch a page of the live MCP catalog. `cursor` pages through results.
 * Network failures return an error result rather than throwing so the UI can
 * show a friendly message + the "add manually" fallback.
 */
export async function fetchCatalog(opts: { limit?: number; cursor?: string; query?: string } = {}): Promise<{ servers: CatalogServer[]; nextCursor?: string; error?: string }> {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  if (opts.cursor) params.set("cursor", opts.cursor);
  const url = `${REGISTRY_BASE}?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { servers: [], error: `Registry returned ${res.status} ${res.statusText}` };
    const data = (await res.json()) as RawResponse;
    const installed = installedNames();
    let servers = (data.servers ?? []).map((raw) => {
      const name = raw.server?.name ?? "unknown";
      const t = pickTransport(raw);
      return {
        id: name,
        name,
        title: raw.server?.title,
        description: raw.server?.description,
        transport: t.transport,
        packageIdentifier: t.packageIdentifier,
        registryType: t.registryType,
        repositoryUrl: raw.server?.repository?.url,
        status: raw.server?.status,
        installed: installed.has(name),
      } satisfies CatalogServer;
    });
    // Optional client-side query filter (substring on name/title/description).
    if (opts.query) {
      const q = opts.query.toLowerCase();
      servers = servers.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.title?.toLowerCase().includes(q)) ||
        (s.description?.toLowerCase().includes(q)),
      );
    }
    return { servers, nextCursor: data.next_cursor || undefined };
  } catch (e) {
    return { servers: [], error: e instanceof Error ? e.message : String(e) };
  }
}
