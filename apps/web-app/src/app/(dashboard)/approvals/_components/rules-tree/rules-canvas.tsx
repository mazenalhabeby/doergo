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
const Ctx = createContext<RulesCtx | null>(null)

type PartData = { ruleId: string; part: RulePartName }
type BoxData = { el: ReactNode }

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
  return (
    <div className="nodrag nopan animate-in fade-in zoom-in-95 duration-300">
      <Ports left={id !== "start"} right={id === "start" || id === "uncaught"} />
      {data.el}
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

/** Lays the rules out: the start on the left, one row per rule, then what nothing catches, then "new rule". */
function layout(
  ctx: RulesCtx,
  start: ReactNode,
  uncaught: ReactNode | null,
  add: ReactNode,
): { nodes: Node[]; edges: Edge[] } {
  const rows = ctx.rules.length + (uncaught ? 1 : 0) + 1
  const nodes: Node[] = [
    { id: "start", type: "box", position: { x: 0, y: ((rows - 1) * ROW) / 2 - 20 }, data: { el: start } },
  ]
  const edges: Edge[] = []
  ctx.rules.forEach((r, i) => {
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
  let y = ctx.rules.length * ROW
  if (uncaught) {
    nodes.push({ id: "uncaught", type: "box", position: { x: 290, y }, data: { el: uncaught } })
    edges.push({
      id: "start>uncaught",
      source: "start",
      target: "uncaught",
      style: { ...EDGE, strokeDasharray: "5 5" },
    })
    y += ROW
  }
  nodes.push({ id: "add", type: "box", position: { x: 290, y: y + 10 }, data: { el: add } })
  edges.push({ id: "start>add", source: "start", target: "add", style: { ...EDGE, strokeDasharray: "5 5" } })
  return { nodes, edges }
}

/** Re-frames the view, animated, whenever the set of nodes changes (another type, a rule added or removed). */
function Refit({ signature }: { signature: string }) {
  const flow = useReactFlow()
  useEffect(() => {
    const id = requestAnimationFrame(() => flow.fitView({ duration: 450, padding: 0.08, maxZoom: 1, minZoom: 0.7 }))
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
  const { nodes, edges } = useMemo(() => layout(ctx, start, uncaught, add), [ctx, start, uncaught, add])
  const signature = `${kind}:${ctx.rules.map((r) => r.id).join(",")}:${uncaught ? 1 : 0}`
  return (
    <Ctx.Provider value={ctx}>
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
            minZoom={0.4}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1, minZoom: 0.7 }}
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
