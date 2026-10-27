"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, type FocusEvent, type ReactNode } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
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
  /** The rule whose delete is in flight. */
  removing: string | null
}
type Boxes = { start: ReactNode; uncaught: ReactNode | null; add: ReactNode }
/** Two contexts: a box changing (a save starting greys "New rule") never re-renders the rules' nodes. */
const Ctx = createContext<RulesCtx | null>(null)
const BoxCtx = createContext<Boxes | null>(null)

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
        removing={ctx.removing === rule.id}
        onChange={(patch) => ctx.onChange(rule, patch)}
        onRemove={() => ctx.onRemove(rule)}
      />
    </div>
  )
}

function BoxNode({ data, id }: NodeProps<Node<BoxData>>) {
  // The box's content is read from the context, so the layout never has to change for it to change.
  const boxes = useContext(BoxCtx)
  return (
    <div className="nodrag nopan animate-in fade-in zoom-in-95 duration-300">
      <Ports left={id !== "start"} right={id === "start" || id === "uncaught"} />
      {boxes?.[data.box]}
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
 * Reads only the SHAPE (which rules, on or off, is there an uncaught row) — editing a rule moves no node; the
 * nodes read the rule itself from the context.
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

/** The zoom a node's words stay readable at — the view never fits the tree by shrinking below it. */
const READABLE = 0.7
/** Narrower than this (a phone), the tree is not fitted: it opens at a readable zoom on the start, to be panned. */
const NARROW = 768

/** Re-frames the view, animated, whenever the set of nodes changes (another type, a rule added or removed). */
function Refit({ signature }: { signature: string }) {
  const flow = useReactFlow()
  const store = useStoreApi()
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const { width, height } = store.getState()
      const start = flow.getNode("start")
      if ((width || window.innerWidth) >= NARROW || !start)
        return void flow.fitView({ duration: 450, padding: 0.08, maxZoom: 1, minZoom: READABLE })
      // The start at the left edge, its middle at the middle: the first rules beside it, the rest a pan away.
      const middle = start.position.y + (start.measured?.height ?? 100) / 2
      void flow.setViewport({ x: 16, y: (height || 380) / 2 - middle * READABLE, zoom: READABLE }, { duration: 450 })
    })
    return () => cancelAnimationFrame(id)
  }, [signature, flow, store])
  return null
}

/**
 * Keyboard: Tab may land on a control inside a node that is off screen (the nodes themselves take no focus).
 * The focused node is brought into view — and the browser's own scroll of the clipped canvas, which would
 * leave it drawn out of place, is undone.
 */
function useRevealFocus() {
  const flow = useReactFlow()
  return useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      for (let el = e.target as HTMLElement | null; el && el !== e.currentTarget; el = el.parentElement)
        if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0)
      const id = (e.target as HTMLElement).closest<HTMLElement>(".react-flow__node")?.dataset.id
      const node = id ? flow.getInternalNode(id) : undefined
      if (!node) return
      const { x, y } = node.internals.positionAbsolute
      const w = node.measured.width ?? 0
      const h = node.measured.height ?? 0
      const view = flow.getViewport()
      const box = e.currentTarget.getBoundingClientRect()
      const [left, top] = [x * view.zoom + view.x, y * view.zoom + view.y]
      if (left >= 0 && top >= 0 && left + w * view.zoom <= box.width && top + h * view.zoom <= box.height) return
      void flow.setCenter(x + w / 2, y + h / 2, { zoom: view.zoom, duration: 300 })
    },
    [flow],
  )
}

/** The canvas's frame: its height, and the focus that follows the keyboard. */
function Frame({ height, children }: { height: number; children: ReactNode }) {
  const reveal = useRevealFocus()
  return (
    <div
      className="w-full overflow-hidden rounded-[22px] border border-border bg-shell-chip"
      style={{ height }}
      onFocusCapture={reveal}
    >
      {children}
    </div>
  )
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
  const boxes = useMemo(() => ({ start, uncaught, add }), [start, uncaught, add])
  return (
    <Ctx.Provider value={ctx}>
      <BoxCtx.Provider value={boxes}>
        <ReactFlowProvider>
          <Frame height={Math.min(680, Math.max(380, (ctx.rules.length + 2) * ROW + 120))}>
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
              // The page scrolls over the canvas; zoom is a pinch or the buttons.
              zoomOnScroll={false}
              preventScrolling={false}
              proOptions={{ hideAttribution: true }}
              fitView
              fitViewOptions={{ padding: 0.08, maxZoom: 1, minZoom: READABLE }}
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
          </Frame>
        </ReactFlowProvider>
      </BoxCtx.Provider>
    </Ctx.Provider>
  )
}
