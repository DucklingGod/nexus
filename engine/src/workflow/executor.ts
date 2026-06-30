// Workflow execution engine (Task 36). Runs a saved node-graph:
//   trigger → agent → tool → output, with each node's output flowing to its
//   successors. Emits `workflow.node` notifications for live canvas status, and
//   `workflow.done` with the final result.
//
// Agent nodes run the safe (non-dangerous-tool) agent — workflows execute
// autonomously, so they must not trigger terminal/code/file-write.

import { runConnectorAgent, type ConnectorConfig } from "../connectors/agent.ts";
import { executeTool } from "../tools/registry.ts";
import { notify } from "../ipc/notify.ts";

interface WfNode { id: string; data: { type: string; label?: string; tool?: string; trigger?: string } }
interface WfEdge { source: string; target: string }
interface Graph { nodes: WfNode[]; edges: WfEdge[] }

/** Kahn topological order; nodes with no incoming edges (triggers) run first. */
function topoOrder(graph: Graph): string[] {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of graph.nodes) { incoming.set(n.id, []); outgoing.set(n.id, []); }
  for (const e of graph.edges) {
    outgoing.get(e.source)?.push(e.target);
    incoming.get(e.target)?.push(e.source);
  }
  const indeg = new Map([...incoming].map(([id, preds]) => [id, preds.length]));
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of outgoing.get(id) ?? []) {
      indeg.set(t, (indeg.get(t) ?? 1) - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  return order;
}

export async function runWorkflow(graph: Graph, config: ConnectorConfig): Promise<{ result: string }> {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  for (const n of graph.nodes) incoming.set(n.id, []);
  for (const e of graph.edges) incoming.get(e.target)?.push(e.source);

  const outputs = new Map<string, string>();
  let last = "";

  for (const id of topoOrder(graph)) {
    const node = nodes.get(id);
    if (!node) continue;
    const type = node.data.type;
    const label = (node.data.label ?? "").trim();
    const input = (incoming.get(id) ?? []).map((p) => outputs.get(p) ?? "").filter(Boolean).join("\n\n");

    notify("workflow.node", { id, status: "running" });
    try {
      let out = "";
      if (type === "trigger") {
        out = label || input;
      } else if (type === "agent") {
        const prompt = label.includes("{input}")
          ? label.replace(/\{input\}/g, input)
          : input ? `${label}\n\n${input}` : label;
        out = await runConnectorAgent(config, [{ role: "user", content: prompt || input || "Proceed." }], "a workflow");
      } else if (type === "tool") {
        const toolName = node.data.tool || label.split(/\s+/)[0] || "web_search";
        const arg = (label.includes("{input}") ? label.replace(/\{input\}/g, input) : (label || input)).trim();
        const res = await executeTool(toolName, { query: arg, input: arg, path: arg });
        out = res.error ? `Error: ${res.error}` : res.output;
      } else {
        // output / unknown — pass the input through
        out = input || label;
      }
      outputs.set(id, out);
      if (out) last = out;
      notify("workflow.node", { id, status: "done", output: out.slice(0, 600) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      outputs.set(id, `Error: ${msg}`);
      notify("workflow.node", { id, status: "error", error: msg });
    }
  }

  const outputNodes = graph.nodes.filter((n) => n.data.type === "output");
  const result = outputNodes.length
    ? outputNodes.map((n) => outputs.get(n.id) ?? "").filter(Boolean).join("\n\n")
    : last;
  notify("workflow.done", { result: result.slice(0, 4000) });
  return { result };
}
