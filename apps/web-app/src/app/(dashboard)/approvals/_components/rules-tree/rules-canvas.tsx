"use client"

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { ApprovalRuleInput, ApprovalRuleView } from "@hbcfield/shared/client"
import type { RuleRange } from "../../_lib/rule-range"
import type { RuleRole } from "../../_hooks/use-rules-tree"
import { RulePart, type RulePartName } from "./rule-step"

/** What every rule node needs, shared once instead of copied into each node's data. */
export interface RulesCtx {
  rules: ApprovalRuleView[]
  ranges: RuleRange[]
  roles: RuleRole[]
  workspaces: { id: string; name: string }[]
  currency: string
  onChange: (r: ApprovalRuleView, patch: Partial<ApprovalRuleInput>) => void
  onRemove: (r: ApprovalRuleView) => void
  /** How many items each rule would have taken over the last 90 days (absent while loading). */
  hits?: Record<string, number>
  everywhere: boolean
}
type Boxes = { start: ReactNode; uncaught: ReactNode | null; add: ReactNode }
const Ctx = createContext<(RulesCtx & { boxes: Boxes }) | null>(null)

type PartData = { ruleId: string; part: RulePartName }
type BoxData = { box: keyof Boxes }

const HANDLE = "!size-2 !min-h-0 !min-w-0 !border-2 !border-[hsl(var(--muted-foreground)/0.5)] !bg-card"

function Ports({ left = true, right = true }: { left?: boolean; right?: boolean }) {
  return (
    <>
      {left && <Handle type="target" position={Position.Left} className={HANDLE} isConnectable={false} />}
      {right && <Handle type="source" position={Position.Right} className={HANDLE} isConnectable={false} />}
    </>
  )
}

function PartNode({ data }: NodeProps<Node<PartData>>) {
  const ctx = useContext(Ctx)
  const i = ctx?.rules.findIndex((r) => r.id === data.ruleId) ?? -1
  if (!ctx || i < 0) return null
  const rule = ctx.rules[i]
  return (
    <div className="nodrag nopan animate-in fade-in zoom-in-95 duration-300">
      {data.part !== "head" && <Ports right={data.part !== "done"} />}
      <RulePart
        part={data.part}
        rule={rule}
        n={i + 1}
        roles={ctx.roles}
        workspaces={ctx.workspaces}
        currency={ctx.currency}
        range={ctx.ranges[i]}
        hits={ctx.hits ? (ctx.hits[rule.id] ?? 0) : undefined}
        everywhere={ctx.everywhere}
        onChange={(patch) => ctx.onChange(rule, patch)}
        onRemove={() => ctx.onRemove(rule)}
      />
    </div>
  )
}

function BoxNode({ data, id }: NodeProps<Node<BoxData>>) {
  // The box's content is read from the context, so the layout never has to change for it to change.
  const ctx = useContext(Ctx)
  return (
    <div className="nodrag nopan animate-in fade-in zoom-in-95 duration-300">
      <Ports left={id !== "start"} right={id === "start" || id === "uncaught"} />
      {ctx?.boxes[data.box]}
    </div>
  )
}

/** Nodes take pointer events only when something listens to them — this keeps their editors clickable. */
const NOOP = () => {}
const NODE_TYPES = { part: PartNode, box: BoxNode }
/** The chain's columns; the rule's head (number, on/off, delete) sits just above its first node. */
const COLUMNS: { part: RulePartName; x: number }[] = [
  { part: "where", x: 290 },
  { part: "when", x: 486 },
  { part: "also", x: 682 },
  { part: "chase", x: 878 },
  { part: "done", x: 1074 },
]
const ROW = 132
/** The zoom buttons in the theme's colours (the library draws them white). */
const CONTROLS =
  "!overflow-hidden !rounded-xl !border !border-border !shadow-shell [&>button]:!border-border [&>button]:!bg-card " +
  "[&>button]:!fill-foreground [&>button:hover]:!bg-accent"
const EDGE = { stroke: "hsl(var(--muted-foreground) / 0.45)", strokeWidth: 1.6 }

/**
 * Lays the rules out: the start on the left, one row per rule, then what nothing catches, then "new rule".
 * Reads only the SHAPE (which rules, on or off, is there an uncaught row) — editing a rule changes no node.
 */
function layout(rules: { id: string; isActive: boolean }[], hasUncaught: boolean): { nodes: Node[]; edges: Edge[] } {
  const rows = rules.length + (hasUncaught ? 1 : 0) + 1
  const nodes: Node[] = [
    { id: "start", type: "box", position: { x: 0, y: ((rows - 1) * ROW) / 2 - 20 }, data: { box: "start" } },
  ]
  const edges: Edge[] = []
  rules.forEach((r, i) => {
    const y = i * ROW
    nodes.push({
      id: `${r.id}:head`,
      type: "part",
      position: { x: 290, y: y - 36 },
      data: { ruleId: r.id, part: "head" },
    })
    COLUMNS.forEach(({ part, x }, c) => {
      const id = `${r.id}:${part}`
      nodes.push({ id, type: "part", position: { x, y }, data: { ruleId: r.id, part } })
      const from = c === 0 ? "start" : `${r.id}:${COLUMNS[c - 1].part}`
      edges.push({
        id: `${from}>${id}`,
        source: from,
        target: id,
        animated: r.isActive && c > 0,
        style: EDGE,
        type: c === 0 ? "default" : "straight",
      })
    })
  })
  let y = rules.length * ROW
  if (hasUncaught) {
    nodes.push({ id: "uncaught", type: "box", position: { x: 290, y }, data: { box: "uncaught" } })
    edges.push({
      id: "start>uncaught",
      source: "start",
      target: "uncaught",
      style: { ...EDGE, strokeDasharray: "5 5" },
    })
    y += ROW
  }
  nodes.push({ id: "add", type: "box", position: { x: 290, y: y + 10 }, data: { box: "add" } })
  edges.push({ id: "start>add", source: "start", target: "add", style: { ...EDGE, strokeDasharray: "5 5" } })
  return { nodes, edges }
}

/** How far the view may zoom out to fit: a phone needs the whole chain in view, a desk keeps it readable. */
const fitMinZoom = () => (typeof window !== "undefined" && window.innerWidth < 900 ? 0.3 : 0.7)

/** Re-frames the view, animated, whenever the set of nodes changes (another type, a rule added or removed). */
function Refit({ signature }: { signature: string }) {
  const flow = useReactFlow()
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      flow.fitView({ duration: 450, padding: 0.08, maxZoom: 1, minZoom: fitMinZoom() }),
    )
    return () => cancelAnimationFrame(id)
  }, [signature, flow])
  return null
}

/** The rules of one kind on a pannable, zoomable canvas — curved connectors from the start, flowing while a rule is on. */
export function RulesCanvas(props: {
  ctx: RulesCtx
  start: ReactNode
  uncaught: ReactNode | null
  add: ReactNode
  kind: string
}) {
  const { ctx, start, uncaught, add, kind } = props
  const shape = ctx.rules.map((r) => `${r.id}${r.isActive ? "" : "-"}`).join(",") + (uncaught ? "|u" : "")
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the shape string IS what the layout reads
  const { nodes, edges } = useMemo(() => layout(ctx.rules, !!uncaught), [shape])
  const signature = `${kind}:${ctx.rules.map((r) => r.id).join(",")}:${uncaught ? 1 : 0}`
  const value = useMemo(() => ({ ...ctx, boxes: { start, uncaught, add } }), [ctx, start, uncaught, add])
  return (
    <Ctx.Provider value={value}>
      <ReactFlowProvider>
        <div
          className="w-full overflow-hidden rounded-[22px] border border-border bg-shell-chip"
          style={{ height: Math.min(680, Math.max(380, (ctx.rules.length + 2) * ROW + 120)) }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={NOOP}
            nodesFocusable={false}
            edgesFocusable={false}
            minZoom={0.25}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1, minZoom: fitMinZoom() }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="hsl(var(--muted-foreground) / 0.25)"
            />
            <Controls showInteractive={false} className={CONTROLS} />
            <Refit signature={signature} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    </Ctx.Provider>
  )
}
