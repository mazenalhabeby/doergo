"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

/*
  Each Settings section loads when it is opened, not with the page: the page shows one section at a
  time, and carrying all eleven in its first load made it the heaviest page of the app. The first
  time a section opens, the frame every section is drawn in (SettingCard's header + body) stands in
  for it while its code arrives.
*/
function SectionSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden" aria-busy="true">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </div>
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    </div>
  )
}

const loading = () => <SectionSkeleton />

export const GeneralSection = dynamic(() => import("./general-section").then((m) => m.GeneralSection), { loading })
export const MembersSection = dynamic(() => import("./members-section").then((m) => m.MembersSection), { loading })
export const NotificationsSection = dynamic(
  () => import("./notifications-section").then((m) => m.NotificationsSection),
  { loading },
)
export const HolidaysSection = dynamic(() => import("./holidays-section").then((m) => m.HolidaysSection), { loading })
export const CompaniesSection = dynamic(() => import("./companies-section").then((m) => m.CompaniesSection), {
  loading,
})
export const ProfileSection = dynamic(() => import("./profile-section").then((m) => m.ProfileSection), { loading })
export const SecuritySection = dynamic(() => import("./security-section").then((m) => m.SecuritySection), { loading })
export const MyEmailNotificationsSection = dynamic(
  () => import("./my-emails-section").then((m) => m.MyEmailNotificationsSection),
  { loading },
)
export const ClockInSection = dynamic(() => import("./clock-in-section").then((m) => m.ClockInSection), { loading })
