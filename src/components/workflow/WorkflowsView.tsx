import { useState, useCallback, useEffect, useMemo, createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge,
  Handle, Position, type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface BlockData {
  [key: string]: unknown;
  type: string;
  label?: string;
  tool?: string;
  trigger?: string;
  status?: string;
  onUpdate?: (id: string, patch: Partial<BlockData>) => void;
}

const BLOCKS: Record<string, { label: string; color: string }> = {
  trigger: { label: "Trigger", color: "#4ade80" },
  agent:   { label: "Agent",   color: "#c8a24e" },
  tool:    { label: "Tool",    color: "#60a5fa" },
  output:  { label: "Output",  color: "#c084fc" },
};

const ToolsContext = createContext<string[]>([]);

function BlockNode({ id, data }: NodeProps) {
  const d = data as BlockData;
  const meta = BLOCKS[d.type] ?? BLOCKS.agent;
  const tools = useContext(ToolsContext);
  const ring = d.status === "running" ? "#facc15" : d.status === "done" ? "#4ade80" : d.status === "error" ? "#f87171" : `${meta.color}66`;
  const upd = (patch: Partial<BlockData>) => d.onUpdate?.(id, patch);
  const cls = "nodrag nowheel w-full rounded bg-nexus-bg/60 px-2 py-1 text-[11px] text-nexus-fg placeholder-nexus-muted/40 outline-none";

  return (
    <div className={`w-48 rounded-lg border-2 bg-nexus-surface shadow-lg ${d.status === "running" ? "animate-pulse" : ""}`} style={{ borderColor: ring }}>
      {d.type !== "trigger" && <Handle type="target" position={Position.Top} style={{ background: meta.color }} />}
      <div className="border-b border-nexus-border/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</div>
      <div className="flex flex-col gap-1 p-2">
        {d.type === "trigger" && (
          <>
            <select value={d.trigger ?? "manual"} onChange={(e) => upd({ trigger: e.target.value })} className={cls}>
              <option value="manual">Manual run</option>
              <option value="message">On message</option>
            </select>
            <input value={d.label ?? ""} onChange={(e) => upd({ label: e.target.value })} placeholder="Initial input (optional)" className={cls} />
          </>
        )}
        {d.type === "agent" && (
          <textarea value={d.label ?? ""} onChange={(e) => upd({ label: e.target.value })} rows={3} placeholder="Prompt — use {input} for upstream output" className={`${cls} resize-none`} />
        )}
        {d.type === "tool" && (
          <>
            <select value={d.tool ?? ""} onChange={(e) => upd({ tool: e.target.value })} className={cls}>
              <option value="">Choose tool…</option>
              {tools.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={d.label ?? ""} onChange={(e) => upd({ label: e.target.value })} placeholder="Input / query ({input} ok)" className={cls} />
          </>
        )}
        {d.type === "output" && (
          <input value={d.label ?? ""} onChange={(e) => upd({ label: e.target.value })} placeholder="Label (collects the result)" className={cls} />
        )}
      </div>
      {d.type !== "output" && <Handle type="source" position={Position.Bottom} style={{ background: meta.color }} />}
    </div>
  );
}

interface TplNode { id: string; type: string; label?: string; tool?: string; trigger?: string; x: number; y: number }
const TEMPLATES: { name: string; desc: string; nodes: TplNode[]; edges: [string, string][] }[] = [
  {
    name: "Web research → summary",
    desc: "Search the web, then summarize",
    nodes: [
      { id: "t", type: "trigger", trigger: "manual", label: "AI agents 2026", x: 60, y: 30 },
      { id: "s", type: "tool", tool: "web_search", label: "{input}", x: 60, y: 170 },
      { id: "a", type: "agent", label: "Summarize these results into 5 bullet points:\n{input}", x: 60, y: 300 },
      { id: "o", type: "output", label: "Summary", x: 60, y: 450 },
    ],
    edges: [["t", "s"], ["s", "a"], ["a", "o"]],
  },
  {
    name: "Quick answer",
    desc: "Answer a question with the agent",
    nodes: [
      { id: "t", type: "trigger", trigger: "manual", label: "What is RAG?", x: 60, y: 40 },
      { id: "a", type: "agent", label: "Answer clearly and concisely:\n{input}", x: 60, y: 190 },
      { id: "o", type: "output", label: "Answer", x: 60, y: 340 },
    ],
    edges: [["t", "a"], ["a", "o"]],
  },
  {
    name: "Draft → polish",
    desc: "Draft something, then improve it",
    nodes: [
      { id: "t", type: "trigger", trigger: "manual", label: "a tweet announcing our launch", x: 60, y: 30 },
      { id: "d", type: "agent", label: "Write a first draft of {input}", x: 60, y: 170 },
      { id: "p", type: "agent", label: "Make this punchier and clearer:\n{input}", x: 60, y: 320 },
      { id: "o", type: "output", label: "Final", x: 60, y: 470 },
    ],
    edges: [["t", "d"], ["d", "p"], ["p", "o"]],
  },
];

let counter = 1;

export function WorkflowsView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState("Untitled workflow");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [prov, setProv] = useState<{ provider: string; model: string; baseUrl: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; output: string }[]>([]);
  const [toolNames, setToolNames] = useState<string[]>([]);

  const updateNode = useCallback((id: string, patch: Partial<BlockData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setNodes]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  useEffect(() => {
    invoke<{ provider: string; model: string; baseUrl: string } | null>("provider_get").then(setProv).catch(() => {});
    invoke<{ tools: { name: string }[] }>("engine_rpc", { method: "tools.list", params: {} })
      .then((r) => setToolNames((r.tools ?? []).map((t) => t.name))).catch(() => {});
  }, []);

  const addNode = (type: string) => {
    const id = `n${counter++}`;
    setNodes((nds) => [
      ...nds,
      { id, type: "block", position: { x: 120 + (nds.length % 4) * 50, y: 60 + nds.length * 40 }, data: { type, label: "", trigger: type === "trigger" ? "manual" : undefined, onUpdate: updateNode } },
    ]);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    setCurrentId(null);
    setName(tpl.name);
    setResult(null); setLog([]);
    setNodes(tpl.nodes.map((n) => ({ id: n.id, type: "block", position: { x: n.x, y: n.y }, data: { type: n.type, label: n.label ?? "", tool: n.tool, trigger: n.trigger, onUpdate: updateNode } })));
    setEdges(tpl.edges.map(([s, t], i) => ({ id: `e${i}`, source: s, target: t })));
  };

  const loadList = useCallback(async () => {
    const r = await invoke<{ workflows: { id: string; name: string }[] }>("engine_rpc", { method: "workflow.list", params: {} }).catch(() => ({ workflows: [] }));
    setList(r.workflows ?? []);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(null), 2000); }

  function cleanGraph() {
    return {
      nodes: nodes.map((n) => {
        const d = n.data as BlockData;
        return { id: n.id, type: n.type, position: n.position, data: { type: d.type, label: d.label ?? "", tool: d.tool, trigger: d.trigger } };
      }),
      edges,
    };
  }

  async function save() {
    const r = await invoke<{ id: string }>("engine_rpc", { method: "workflow.save", params: { id: currentId, name, graph: cleanGraph() } }).catch(() => null);
    if (r) { setCurrentId(r.id); loadList(); flash("Saved"); }
  }

  async function load(id: string) {
    const r = await invoke<{ workflow: { id: string; name: string; graph: { nodes: Node[]; edges: Edge[] } } | null }>("engine_rpc", { method: "workflow.get", params: { id } }).catch(() => null);
    if (r?.workflow) {
      setCurrentId(r.workflow.id);
      setName(r.workflow.name);
      setResult(null); setLog([]);
      setNodes((r.workflow.graph.nodes ?? []).map((n) => ({ ...n, data: { ...(n.data as BlockData), status: undefined, onUpdate: updateNode } })));
      setEdges(r.workflow.graph.edges ?? []);
    }
  }

  function newWorkflow() { setCurrentId(null); setName("Untitled workflow"); setNodes([]); setEdges([]); setResult(null); setLog([]); }

  async function remove(id: string) {
    await invoke("engine_rpc", { method: "workflow.delete", params: { id } }).catch(() => {});
    if (id === currentId) newWorkflow();
    loadList();
  }

  async function run() {
    if (!prov || running) return;
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: undefined } })));
    setLog([]); setResult(null); setRunning(true);
    try {
      const r = await invoke<{ result: string }>("workflow_run", { graph: cleanGraph(), provider: prov.provider, model: prov.model, baseUrl: prov.baseUrl });
      setResult(r.result);
    } catch (e) {
      setResult(`Error: ${e}`);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const un = listen<{ method: string; params: { id?: string; status?: string; output?: string; result?: string } }>("engine-event", (e) => {
      const { method, params } = e.payload;
      if (method === "workflow.node" && params.id) {
        setNodes((nds) => nds.map((n) => (n.id === params.id ? { ...n, data: { ...n.data, status: params.status } } : n)));
        if (params.output) setLog((l) => [...l, { id: params.id!, output: params.output! }]);
      } else if (method === "workflow.done") {
        setResult(params.result ?? "");
      }
    });
    return () => { un.then((f) => f()).catch(() => {}); };
  }, [setNodes]);

  const nodeTypes = useMemo(() => ({ block: BlockNode }), []);

  return (
    <ToolsContext.Provider value={toolNames}>
      <div className="flex h-full">
        {/* Left rail */}
        <div className="flex w-52 flex-col gap-3 overflow-y-auto border-r border-nexus-border/50 bg-nexus-surface/30 p-3">
          <button onClick={newWorkflow} className="rounded-md bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90">+ New workflow</button>

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-nexus-muted/60">Templates</p>
            {TEMPLATES.map((tpl) => (
              <button key={tpl.name} onClick={() => applyTemplate(tpl)} title={tpl.desc} className="mb-1 block w-full truncate rounded border border-gold-faint px-2 py-1.5 text-left text-[11px] text-nexus-fg hover:bg-nexus-surface">{tpl.name}</button>
            ))}
          </div>

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-nexus-muted/60">Saved</p>
            {list.length === 0 && <p className="px-1 text-[10px] text-nexus-muted/40">None yet</p>}
            {list.map((w) => (
              <div key={w.id} className={`group flex items-center justify-between rounded px-2 py-1 text-[11px] hover:bg-nexus-surface ${w.id === currentId ? "bg-nexus-surface text-nexus-gold" : "text-nexus-fg"}`}>
                <button onClick={() => load(w.id)} className="flex-1 truncate text-left">{w.name}</button>
                <button onClick={() => remove(w.id)} className="hidden text-nexus-muted/40 hover:text-red-400 group-hover:block">✕</button>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-nexus-muted/60">Add block</p>
            {Object.entries(BLOCKS).map(([type, meta]) => (
              <button key={type} onClick={() => addNode(type)} className="mb-1 flex w-full items-center gap-2 rounded border border-nexus-border px-2 py-1.5 text-[11px] text-nexus-fg hover:bg-nexus-surface">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-nexus-border/40 px-3 py-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md border border-nexus-border bg-nexus-surface px-3 py-1.5 text-sm text-nexus-fg outline-none focus:border-nexus-accent" />
            <button onClick={run} disabled={running || nodes.length === 0} className="rounded-md border border-nexus-accent px-4 py-1.5 text-sm font-medium text-nexus-accent hover:bg-nexus-accent/10 disabled:opacity-50">{running ? "Running…" : "▶ Run"}</button>
            <button onClick={save} className="rounded-md bg-nexus-accent px-4 py-1.5 text-sm font-medium text-black hover:opacity-90">Save</button>
            {msg && <span className="text-[11px] text-green-400">{msg}</span>}
          </div>
          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              colorMode="dark"
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
          {(result !== null || log.length > 0) && (
            <div className="max-h-44 overflow-y-auto border-t border-nexus-border/40 bg-nexus-surface/40 p-3 text-[11px]">
              <p className="mb-1 font-medium text-nexus-muted">Run output</p>
              {log.map((l, i) => (
                <div key={i} className="mb-0.5 text-nexus-muted/80"><span className="text-nexus-accent">{l.id}</span>: {l.output.slice(0, 200)}</div>
              ))}
              {result !== null && (
                <div className="mt-2 whitespace-pre-wrap rounded border border-gold-faint bg-nexus-bg/40 p-2 text-nexus-fg">{result || "(no output)"}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </ToolsContext.Provider>
  );
}
