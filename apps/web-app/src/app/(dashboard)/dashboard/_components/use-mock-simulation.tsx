"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import type {
  WorkspaceBoxProps,
  PersonNodeProps,
  WorkerStatus,
  LiveEvent,
  PendingAction,
} from "@/components/dashboard"

type AbsenceReason = "time_off" | "sick" | "day_off" | "unexcused"

type WorkerSim = {
  id: string
  initials: string
  color: string
  name: string
  imageUrl?: string
  loc: string | null
  status: WorkerStatus
  tag: PersonNodeProps["tag"]
  away?: "on_road" | "remote" | "off"
  absenceReason?: AbsenceReason
}

const WORKERS_INIT: WorkerSim[] = [
  // Main Office — 8 assigned (5 on-site, 1 on road, 1 remote, 1 off)
  { id:"w1",  initials:"MW", color:"linear-gradient(135deg,#2980b9,#1d4ed8)", name:"Mike W.",    imageUrl:"https://randomuser.me/api/portraits/men/32.jpg",   loc:"Main Office",    status:"on",   tag:undefined },
  { id:"w2",  initials:"RH", color:"linear-gradient(135deg,#1abc9c,#0d9488)", name:"Rami H.",    imageUrl:"https://randomuser.me/api/portraits/men/45.jpg",   loc:"Main Office",    status:"busy", tag:{text:"On Task",variant:"task"} },
  { id:"w3",  initials:"KA", color:"linear-gradient(135deg,#8e44ad,#7c3aed)", name:"Karim A.",   imageUrl:"https://randomuser.me/api/portraits/men/22.jpg",   loc:"Main Office",    status:"on",   tag:undefined },
  { id:"w4",  initials:"LA", color:"linear-gradient(135deg,#10b981,#059669)", name:"Lisa A.",    imageUrl:"https://randomuser.me/api/portraits/women/44.jpg", loc:"Main Office",    status:"on",   tag:undefined },
  { id:"w5",  initials:"FS", color:"linear-gradient(135deg,#3b82f6,#2563eb)", name:"Fatima S.",  imageUrl:"https://randomuser.me/api/portraits/women/68.jpg", loc:"Main Office",    status:"late", tag:{text:"12m Late",variant:"late"} },
  { id:"w6",  initials:"NK", color:"linear-gradient(135deg,#f59e0b,#d97706)", name:"Noor K.",    imageUrl:"https://randomuser.me/api/portraits/men/75.jpg",   loc:null,             status:"busy", tag:{text:"In Field",variant:"task"}, away:"on_road" },
  { id:"w7",  initials:"AH", color:"linear-gradient(135deg,#ec4899,#db2777)", name:"Alex H.",    imageUrl:"https://randomuser.me/api/portraits/men/86.jpg",   loc:null,             status:"on",   tag:{text:"Off-site",variant:"hrs"}, away:"remote" },
  { id:"w8",  initials:"OB", color:"linear-gradient(135deg,#64748b,#475569)", name:"Omar B.",    imageUrl:"https://randomuser.me/api/portraits/men/91.jpg",   loc:null,             status:"off",  tag:undefined, away:"off", absenceReason:"time_off" },
  // Warehouse — 6 assigned (4 on-site, 1 on road, 1 off)
  { id:"w9",  initials:"YR", color:"linear-gradient(135deg,#2ecc71,#16a34a)", name:"Yusuf R.",   imageUrl:"https://randomuser.me/api/portraits/men/55.jpg",   loc:"Warehouse",      status:"on",   tag:undefined },
  { id:"w10", initials:"SM", color:"linear-gradient(135deg,#f59e0b,#d97706)", name:"Sara M.",    imageUrl:"https://randomuser.me/api/portraits/women/26.jpg", loc:"Warehouse",      status:"busy", tag:{text:"On Task",variant:"task"} },
  { id:"w11", initials:"HB", color:"linear-gradient(135deg,#14b8a6,#0d9488)", name:"Hassan B.",  imageUrl:"https://randomuser.me/api/portraits/men/11.jpg",   loc:"Warehouse",      status:"on",   tag:undefined },
  { id:"w12", initials:"DP", color:"linear-gradient(135deg,#06b6d4,#0891b2)", name:"Dana P.",    imageUrl:"https://randomuser.me/api/portraits/women/33.jpg", loc:"Warehouse",      status:"on",   tag:undefined },
  { id:"w13", initials:"JD", color:"linear-gradient(135deg,#a855f7,#9333ea)", name:"Jad D.",     imageUrl:"https://randomuser.me/api/portraits/men/67.jpg",   loc:null,             status:"busy", tag:{text:"In Field",variant:"task"}, away:"on_road" },
  { id:"w14", initials:"ZK", color:"linear-gradient(135deg,#64748b,#475569)", name:"Zain K.",    imageUrl:"https://randomuser.me/api/portraits/men/40.jpg",   loc:null,             status:"off",  tag:undefined, away:"off", absenceReason:"sick" },
  // Service Center — 3 assigned (2 on-site, 1 remote)
  { id:"w15", initials:"DK", color:"linear-gradient(135deg,#e67e22,#d35400)", name:"David K.",   imageUrl:"https://randomuser.me/api/portraits/men/52.jpg",   loc:"Service Center", status:"busy", tag:{text:"On Task",variant:"task"} },
  { id:"w16", initials:"RE", color:"linear-gradient(135deg,#2ecc71,#27ae60)", name:"Rita E.",    imageUrl:"https://randomuser.me/api/portraits/women/17.jpg", loc:"Service Center", status:"on",   tag:undefined },
  { id:"w17", initials:"LM", color:"linear-gradient(135deg,#8b5cf6,#7c3aed)", name:"Layla M.",   imageUrl:"https://randomuser.me/api/portraits/women/85.jpg", loc:null,             status:"on",   tag:{text:"Off-site",variant:"hrs"}, away:"remote" },
  // Branch Office — 2 assigned (1 on-site, 1 off)
  { id:"w18", initials:"TM", color:"linear-gradient(135deg,#ef4444,#dc2626)", name:"Tom M.",     imageUrl:"https://randomuser.me/api/portraits/men/3.jpg",    loc:"Branch Office",  status:"on",   tag:undefined },
  { id:"w19", initials:"LW", color:"linear-gradient(135deg,#64748b,#475569)", name:"Lena W.",    imageUrl:"https://randomuser.me/api/portraits/women/90.jpg", loc:null,             status:"off",  tag:undefined, away:"off", absenceReason:"unexcused" },
  // Factory Floor — 1 assigned (1 on-site)
  { id:"w20", initials:"RB", color:"linear-gradient(135deg,#0d9488,#059669)", name:"Raya B.",    imageUrl:"https://randomuser.me/api/portraits/women/51.jpg", loc:"Factory Floor",  status:"on",   tag:undefined },
]

const LOCATIONS = ["Main Office", "Warehouse", "Service Center", "Branch Office", "Factory Floor"]
const TASKS = ["HVAC Repair", "Plumbing Fix", "AC Install", "Generator Check", "Wiring Job", "Boiler Service"]

const HOME_LOCATIONS: Record<string, string> = {
  w1: "Main Office", w2: "Main Office", w3: "Main Office", w4: "Main Office", w5: "Main Office", w6: "Main Office", w7: "Main Office", w8: "Main Office",
  w9: "Warehouse", w10: "Warehouse", w11: "Warehouse", w12: "Warehouse", w13: "Warehouse", w14: "Warehouse",
  w15: "Service Center", w16: "Service Center", w17: "Service Center",
  w18: "Branch Office", w19: "Branch Office",
  w20: "Factory Floor",
}

export function useMockSimulation(
  handleEditLocation: (locationId: string) => void,
  handleAssignWorkers: (locationId: string) => void,
) {
  const WORKERS = useRef<WorkerSim[]>(WORKERS_INIT.map(w => ({ ...w }))).current

  const [simTick, setSimTick] = useState(0)
  const [events, setEvents] = useState<LiveEvent[]>([
    { id:"e1", dot:"green", message:<><strong>Mike W.</strong> en route to <strong>HVAC Repair</strong></>, time:"just now" },
    { id:"e2", dot:"green", message:<><strong>Sara M.</strong> started <strong>Generator Check</strong></>, time:"5m ago" },
    { id:"e3", dot:"green", message:<><strong>Hassan B.</strong> clocked in at Warehouse</>, time:"15m ago" },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      const actions = ["clock_in","clock_out","go_task","complete_task","arrive","go_late"]
      const action = actions[Math.floor(Math.random() * actions.length)]!
      const active = WORKERS.filter(w => w.status !== "off")
      const offWorkers = WORKERS.filter(w => w.status === "off")
      const w = active[Math.floor(Math.random() * active.length)]
      if (!w) return

      let dot: LiveEvent["dot"] = "green"
      let msg: React.ReactNode = ""

      switch(action) {
        case "clock_in": {
          if (offWorkers.length === 0) break
          const ow = offWorkers[Math.floor(Math.random() * offWorkers.length)]!
          const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]!
          ow.status = "on"; ow.loc = loc; ow.tag = undefined
          dot = "green"; msg = <><strong>{ow.name}</strong> clocked in at <strong>{loc}</strong></>
          break
        }
        case "clock_out": {
          if (w.status === "off") break
          w.status = "off"; w.loc = null; w.tag = undefined
          dot = "blue"; msg = <><strong>{w.name}</strong> clocked out</>
          break
        }
        case "go_task": {
          if (w.status !== "on") break
          const task = TASKS[Math.floor(Math.random() * TASKS.length)]!
          w.status = "busy"; w.loc = null; w.tag = { text: "En Route", variant: "task" }
          dot = "blue"; msg = <><strong>{w.name}</strong> en route to <strong>{task}</strong></>
          break
        }
        case "complete_task": {
          if (w.status !== "busy") break
          const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]!
          w.status = "on"; w.loc = loc; w.tag = undefined
          dot = "blue"; msg = <><strong>{w.name}</strong> completed task, returned to <strong>{loc}</strong></>
          break
        }
        case "arrive": {
          if (w.status === "busy" && w.tag?.text === "En Route") {
            w.tag = { text: "Arrived", variant: "task" }
            dot = "green"; msg = <><strong>{w.name}</strong> arrived at task site</>
          }
          break
        }
        case "go_late": {
          if (w.status === "on") {
            const mins = Math.floor(Math.random() * 15 + 3)
            w.status = "late"; w.tag = { text: `${mins}m late`, variant: "late" }
            dot = "amber"; msg = <><strong>{w.name}</strong> flagged {mins}m late</>
          }
          break
        }
      }

      if (msg) {
        setEvents(prev => [{ id: `e${Date.now()}`, dot, message: msg, time: "just now" }, ...prev].slice(0, 12))
      }
      setSimTick(t => t + 1)
    }, 3000)
    return () => clearInterval(interval)
  }, [WORKERS])

  // Build boxes from simulation state
  const simBoxes: WorkspaceBoxProps[] = useMemo(() => {
    const boxes: WorkspaceBoxProps[] = []

    const toPersonNode = (w: WorkerSim) => ({ initials: w.initials, color: w.color, status: w.status, name: w.name, tag: w.tag, imageUrl: w.imageUrl, absenceReason: w.absenceReason })

    // Fixed locations
    LOCATIONS.forEach((loc, i) => {
      const people = WORKERS.filter(w => w.loc === loc && w.status !== "off")
        .map(toPersonNode)

      // Workers assigned to this location but currently away
      const assignedIds = Object.entries(HOME_LOCATIONS).filter(([, home]) => home === loc).map(([id]) => id)
      const activePeopleIds = new Set(WORKERS.filter(w => w.loc === loc && w.status !== "off").map(w => w.id))
      const awayWorkers = WORKERS.filter(w => assignedIds.includes(w.id) && !activePeopleIds.has(w.id))

      const offDutyPeople = awayWorkers.filter(w => w.away === "off" || (!w.away && w.status === "off")).map(toPersonNode)
      const onRoadPeople = awayWorkers.filter(w => w.away === "on_road").map(w => ({
        ...toPersonNode(w),
        tag: w.tag || { text: "In Field", variant: "task" as const },
      }))
      const remotePeople = awayWorkers.filter(w => w.away === "remote").map(w => ({
        ...toPersonNode(w),
        tag: w.tag || { text: "Off-site", variant: "hrs" as const },
      }))

      const activeCount = people.length + onRoadPeople.length + remotePeople.length

      boxes.push({
        title: loc,
        type: "fixed",
        totalAssigned: assignedIds.length,
        locationId: `mock-${i}`,
        onEdit: handleEditLocation,
        onAssign: handleAssignWorkers,
        people,
        activeCount,
        offDutyPeople,
        onRoadPeople,
        remotePeople,
      })
    })

    return boxes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTick])

  const mockPending: PendingAction[] = useMemo(() => [
    { id: "p1", initials: "NK", color: "linear-gradient(135deg,#f59e0b,#d97706)", imageUrl: "https://randomuser.me/api/portraits/men/75.jpg", title: "Noor K. — Overtime", description: "Budget exceeded (152/160h)", onApprove: () => {}, onReject: () => {} },
    { id: "p2", initials: "AH", color: "linear-gradient(135deg,#8b5cf6,#7c3aed)", imageUrl: "https://randomuser.me/api/portraits/men/86.jpg", title: "Alex H. — Time Off", description: "May 12-14 (3 days)", onApprove: () => {}, onReject: () => {} },
    { id: "p3", initials: "TM", color: "linear-gradient(135deg,#ef4444,#dc2626)", imageUrl: "https://randomuser.me/api/portraits/men/3.jpg", title: "Tom M. — Missing", description: "No clock-in, scheduled 9:00", onMessage: () => {} },
  ], [])

  return { simBoxes, events, mockPending, simTick }
}
