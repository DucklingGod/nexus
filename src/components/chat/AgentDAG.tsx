import { useState, useMemo, useRef, useCallback } from "react";
import type { ToolEvent } from "../../hooks/useChat";

interface Props {
  toolEvents: ToolEvent[];
}

interface DAGNode {
  id: string;
  name: string;
  label: string;
  status: "success" | "error" | "pending";
  x: number;
  y: number;
  elapsed_ms?: number;
}

interface DAGEdge {
  from: string;
  to: string;
}

const NODE_W = 140;
const NODE_H = 36;
const GAP_X = 24;
const GAP_Y = 16;

/** Friendly labels */
const LABELS: Record<string, string> = {
  terminal_exec: "Terminal",
  file_read: "Read",
  file_write: "Write",
  file_list: "List files",
  file_edit: "Edit",
  remember: "Memory",
  web_search: "Search",
  web_extract: "Extract",
  search_documents: "Docs search",
  knowledge_search: "Facts",
  image_generate: "Image",
  complete_once: "AI",
  delegate_task: "Delegate",
  skill_manage: "Skill",
};

function label(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Status colors */
function statusFill(s: string): string {
  if (s === "success") return "#065f46"; // green-800
  if (s === "error") return "#7f1d1d";   // red-900
  return "#1e3a5f";                       // blue-900
}
function statusStroke(s: string): string {
  if (s === "success") return "#34d399";  // green-400
  if (s === "error") return "#f87171";    // red-400
  return "#60a5fa";                       // blue-400
}
function statusText(s: string): string {
  if (s === "success") return "#a7f3d0";  // green-200
  if (s === "error") return "#fca5a5";    // red-200
  return "#bfdbfe";                       // blue-200
}

/** Format elapsed */
function fmtMs(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

export function AgentDAG({ toolEvents }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Build graph data
  const { nodes, edges, width, height } = useMemo(() => {
    const callMap = new Map<string, ToolEvent>();
    const resultMap = new Map<string, ToolEvent>();

    for (const e of toolEvents) {
      if (e.type === "call") callMap.set(e.id, e);
      else if (e.type === "result") resultMap.set(e.id, e);
    }

    // Merge into steps, preserving order
    const seen = new Set<string>();
    const ordered: { id: string; name: string; status: "success" | "error" | "pending"; elapsed_ms?: number }[] = [];
    for (const e of toolEvents) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const call = callMap.get(e.id);
      const result = resultMap.get(e.id);
      ordered.push({
        id: e.id,
        name: call?.name ?? result?.name ?? "?",
        status: result ? (result.error ? "error" : "success") : "pending",
        elapsed_ms: result?.elapsed_ms,
      });
    }

    // Layout: rows of up to 3 nodes
    const COLS = 3;
    const nodes: DAGNode[] = ordered.map((step, i) => ({
      id: step.id,
      name: step.name,
      label: label(step.name),
      status: step.status,
      x: (i % COLS) * (NODE_W + GAP_X),
      y: Math.floor(i / COLS) * (NODE_H + GAP_Y),
      elapsed_ms: step.elapsed_ms,
    }));

    // Edges: sequential within each row, and from last of row N to first of row N+1
    const edges: DAGEdge[] = [];
    for (let i = 1; i < nodes.length; i++) {
      edges.push({ from: nodes[i - 1].id, to: nodes[i].id });
    }

    const cols = Math.min(nodes.length, COLS);
    const rows = Math.ceil(nodes.length / COLS);
    const w = cols * NODE_W + (cols - 1) * GAP_X + 16;
    const h = rows * NODE_H + (rows - 1) * GAP_Y + 16;

    return { nodes, edges, width: w, height: h };
  }, [toolEvents]);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (nodes.length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-nexus-border/30 bg-nexus-bg/80">
      <div className="flex items-center gap-2 border-b border-nexus-border/20 px-3 py-1.5">
        <span className="text-[10px] font-medium text-nexus-muted/60">Execution graph</span>
        <span className="text-[9px] text-nexus-muted/40">{nodes.length} nodes</span>
        {/* Legend */}
        <span className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-400" /><span className="text-[9px] text-nexus-muted/40">OK</span></span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /><span className="text-[9px] text-nexus-muted/40">Error</span></span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-400" /><span className="text-[9px] text-nexus-muted/40">Pending</span></span>
        </span>
      </div>
      <div
        className="cursor-grab active:cursor-grabbing overflow-auto"
        style={{ maxHeight: 300 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width={Math.max(width + 32, 420)}
          height={height + 32}
          className="select-none"
        >
          <g transform={`translate(${pan.x + 16}, ${pan.y + 16})`}>
            {/* Edges */}
            {edges.map((edge, i) => {
              const from = nodeMap.get(edge.from);
              const to = nodeMap.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W / 2;
              const y1 = from.y + NODE_H;
              const x2 = to.x + NODE_W / 2;
              const y2 = to.y;
              // Curved connector
              const midY = (y1 + y2) / 2;
              const isHighlighted = hovered === edge.from || hovered === edge.to;
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
                  fill="none"
                  stroke={isHighlighted ? "#d4d4d8" : "#3f3f46"}
                  strokeWidth={isHighlighted ? 1.5 : 1}
                  markerEnd="url(#arrow)"
                />
              );
            })}

            {/* Arrow marker */}
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6" fill="#52525b" />
              </marker>
            </defs>

            {/* Nodes */}
            {nodes.map((node) => {
              const isHovered = hovered === node.id;
              return (
                <g
                  key={node.id}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={statusFill(node.status)}
                    stroke={statusStroke(node.status)}
                    strokeWidth={isHovered ? 2 : 1}
                    opacity={isHovered ? 1 : 0.85}
                  />
                  <text
                    x={node.x + NODE_W / 2}
                    y={node.y + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={500}
                    fill={statusText(node.status)}
                  >
                    {node.label}
                  </text>
                  {node.elapsed_ms && (
                    <text
                      x={node.x + NODE_W / 2}
                      y={node.y + 27}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#a1a1aa"
                    >
                      {fmtMs(node.elapsed_ms)}
                    </text>
                  )}
                  {/* Status icon */}
                  <text
                    x={node.x + NODE_W - 10}
                    y={node.y + 12}
                    textAnchor="middle"
                    fontSize={8}
                    fill={statusText(node.status)}
                  >
                    {node.status === "success" ? "✓" : node.status === "error" ? "✗" : "…"}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
