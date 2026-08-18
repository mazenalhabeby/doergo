"use client"

import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { WorkspaceGrid, type WorkspaceBoxProps } from "@/components/dashboard"

/**
 * The "no spaces yet" screen: an animated setup invitation for admins, a plain
 * message for everyone else, and — while the welcome guide is still pending —
 * an example space so the tour has something real to point at.
 *
 * Decorative markup only. It lived inline in the dashboard page, where ~150
 * lines of floating blobs and popup cards sat between the data logic and the
 * layouts that actually render it.
 */
export function EmptyWorkspace({
  isAdminOrDispatcher,
  showExample,
  exampleSpace,
}: {
  isAdminOrDispatcher: boolean
  /** Show the example space beneath the message (guide not yet completed). */
  showExample: boolean
  exampleSpace: WorkspaceBoxProps
}) {
  const { t } = useTranslation()

  return (
  <div className="flex flex-1 flex-col items-center justify-center gap-12 py-16 relative overflow-x-hidden min-h-[calc(100vh-4rem)]">
    {/* Layer 1: Gradient blobs */}
    <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
      {[
        { w:500, h:500, bg:'#3b82f6', x:'-5%', y:'-10%', anim:'tileFloat1', dur:'18s', blur:120 },
        { w:450, h:450, bg:'#8b5cf6', x:'50%', y:'50%',  anim:'tileFloat3', dur:'20s', blur:120 },
        { w:400, h:400, bg:'#10b981', x:'60%', y:'-5%',  anim:'tileFloat2', dur:'22s', blur:100 },
      ].map((blob, i) => (
        <div key={i} className="absolute rounded-full" style={{ width:blob.w, height:blob.h, background:blob.bg, left:blob.x, top:blob.y, filter:`blur(${blob.blur}px)`, animation:`${blob.anim} ${blob.dur} ease-in-out infinite` }} />
      ))}
    </div>

    {/* Layer 2: Popup workspace boxes with connection lines */}
    <div className="absolute inset-0 pointer-events-none">
      {(() => {
        const boxes = [
          { w:130, h:90, delay:'0.3s', avatars:[
            { color:'#10b981', in:4, out:12, dur:16 },
            { color:'#3b82f6', in:6, out:14, dur:18 },
          ]},
          { w:140, h:90, delay:'0.7s', avatars:[
            { color:'#8b5cf6', in:3, out:11, dur:15 },
            { color:'#f59e0b', in:7, out:13, dur:17 },
            { color:'#10b981', in:9, out:16, dur:19 },
          ]},
          { w:120, h:90, delay:'1.1s', avatars:[
            { color:'#3b82f6', in:5, out:10, dur:14 },
          ]},
          { w:130, h:90, delay:'1.5s', avatars:[
            { color:'#ec4899', in:4, out:9,  dur:13 },
            { color:'#06b6d4', in:8, out:15, dur:18 },
          ]},
          { w:140, h:90, delay:'1.9s', avatars:[
            { color:'#f59e0b', in:3, out:8,  dur:12 },
            { color:'#8b5cf6', in:6, out:11, dur:14 },
            { color:'#ef4444', in:10, out:16, dur:17 },
          ]},
          { w:120, h:90, delay:'2.3s', avatars:[
            { color:'#06b6d4', in:5, out:13, dur:16 },
          ]},
        ]
        const count = boxes.length
        const radius = 42
        return boxes.map((box, i) => {
          const angle = (i * 360 / count) - 90
          const rad = (angle * Math.PI) / 180
          const cx = 50 + radius * Math.cos(rad)
          const cy = 50 + radius * Math.sin(rad)
          return { ...box, x: `${cx}%`, y: `${cy}%`, angle }
        })
      })().map((box, i) => (
        <div
          key={i}
          className="absolute rounded-2xl border border-foreground/[0.06] bg-card/50 backdrop-blur-md -translate-x-1/2 -translate-y-1/2 shadow-lg shadow-black/10"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            animation: `boxPopIn 0.6s cubic-bezier(0.34,1.56,0.64,1) ${box.delay} both`,
          }}
        >
          <div className="flex items-center gap-1.5 px-3 pt-2.5">
            <div className="h-1.5 w-12 rounded-full bg-foreground/[0.08]" />
            <div className="h-1.5 w-5 rounded-full bg-foreground/[0.05] ml-auto" />
          </div>
          <div className="flex items-center justify-center gap-2 pt-3 pb-2">
            {box.avatars.map((av, j) => (
              <div
                key={j}
                className="w-7 h-7 rounded-full"
                style={{
                  background: av.color,
                  boxShadow: `0 0 10px ${av.color}25`,
                  animation: `avatarClockIn ${av.dur}s ease-in-out ${av.in}s infinite`,
                }}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 px-3 pb-2">
            {box.avatars.map((_, j) => (
              <div key={j} className="h-1 w-6 rounded-full bg-foreground/[0.05]" />
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* Content — admins get the setup CTA; everyone else a neutral message */}
    <div className="relative text-center max-w-md space-y-10 z-10 px-6">
      {isAdminOrDispatcher ? (
        <>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight leading-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
              {t("dashboard.client.setupTitleLine1")}<br />{t("dashboard.client.setupTitleLine2")}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-sm mx-auto">
              {t("dashboard.client.setupDescription")}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2 h-12 px-6 text-sm shadow-lg shadow-primary/25">
              <Link href="/locations">
                <Plus className="h-4 w-4" />
                {t("dashboard.client.addSpace")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 h-12 px-6 text-sm">
              <Link href="/members">
                <Users className="h-4 w-4" />
                {t("dashboard.client.inviteTeam")}
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("dashboard.client.noSpacesTitle")}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
            {t("dashboard.client.noSpacesDescription")}
          </p>
        </div>
      )}
    </div>

    {/* Onboarding preview: on a brand-new dashboard (no spaces yet) show an
        example space with example teammates so the guide has something real to
        demonstrate (statuses, tap-a-teammate, space actions). Shown until the
        welcome guide is completed, then it's gone — nothing is persisted. */}
    {showExample && (
      <div className="relative z-10 w-full max-w-sm px-6" data-tour="dash-spaces">
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("dashboard.client.exampleLabel")}
        </p>
        <WorkspaceGrid boxes={[exampleSpace]} autoExpandSingle />
      </div>
    )}
  </div>
  )
}
