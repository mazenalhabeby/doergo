"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  Star,
  MapPin,
  Clock,
  ClipboardList,
  Calendar,
  BarChart3,
  Edit,
  MoreHorizontal,
  Mail,
  Building2,
  AlertCircle,
  Activity,
  Umbrella,
} from "lucide-react"
import { format } from "date-fns"

import { useAuth } from "@/contexts/auth-context"
import {
  techniciansApi,
  type TechnicianProfile,
  type TechnicianStats,
  type Task,
  type TimeEntry,
  TechnicianType,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import {
  OverviewTab,
  TasksTab,
  AttendanceTab,
  LocationsTab,
  PerformanceTab,
  ScheduleTab,
  TimeOffTab,
} from "./_components"

export default function TechnicianDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()

  const technicianId = params.id as string
  const [activeTab, setActiveTab] = useState("overview")

  // Fetch technician detail
  const { data: technician, isLoading, isError, error } = useQuery({
    queryKey: ["technician", technicianId],
    queryFn: () => techniciansApi.getById(technicianId),
    enabled: !!technicianId,
  })

  // Fetch tasks for technician
  const { data: tasks } = useQuery({
    queryKey: ["technicianTasks", technicianId],
    queryFn: () => techniciansApi.getTasks(technicianId),
    enabled: !!technicianId && activeTab === "tasks",
  })

  // Fetch attendance for technician
  const { data: attendance } = useQuery({
    queryKey: ["technicianAttendance", technicianId],
    queryFn: () => techniciansApi.getAttendance(technicianId),
    enabled: !!technicianId && activeTab === "attendance",
  })

  // Fetch performance metrics
  const { data: performance } = useQuery({
    queryKey: ["technicianPerformance", technicianId],
    queryFn: () => techniciansApi.getPerformance(technicianId),
    enabled: !!technicianId && activeTab === "performance",
  })

  // Fetch assignments
  const { data: assignments } = useQuery({
    queryKey: ["technicianAssignments", technicianId],
    queryFn: () => techniciansApi.getAssignments(technicianId),
    enabled: !!technicianId && activeTab === "locations",
  })

  const stats = technician?.stats

  // Helper functions
  const getTypeBadge = (type: TechnicianType) => {
    switch (type) {
      case TechnicianType.FULL_TIME:
        return <Badge className="bg-blue-100 text-blue-700">Full-Time</Badge>
      case TechnicianType.FREELANCER:
        return <Badge className="bg-purple-100 text-purple-700">Freelancer</Badge>
      default:
        return null
    }
  }

  // Check if user can manage technicians (ADMIN or DISPATCHER)
  const canManage = user?.role === "ADMIN" || user?.role === "DISPATCHER"

  if (isLoading) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="bg-white rounded-xl border p-6">
          <div className="flex gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-3 flex-1">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  if (isError || !technician) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/technicians">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Technicians
          </Button>
        </Link>
        <div className="bg-white rounded-xl border p-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-800 mb-2">
            Technician not found
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {(error as Error)?.message || "The technician you're looking for doesn't exist."}
          </p>
          <Link href="/technicians">
            <Button>Back to Technicians</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <Link href="/technicians">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Technicians
        </Button>
      </Link>

      {/* Profile Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex gap-6">
            {/* Avatar */}
            <div
              className={cn(
                "h-24 w-24 rounded-full flex items-center justify-center text-white text-2xl font-medium",
                technician.isOnline ? "bg-green-500" : "bg-slate-400"
              )}
            >
              {technician.firstName[0]}
              {technician.lastName[0]}
            </div>

            {/* Info */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold text-slate-800">
                  {technician.firstName} {technician.lastName}
                </h1>
                {getTypeBadge(technician.technicianType)}
                {technician.isActive ? (
                  technician.isOnline ? (
                    <Badge className="bg-green-100 text-green-700">Online</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600">Offline</Badge>
                  )
                ) : (
                  <Badge className="bg-red-100 text-red-700">Inactive</Badge>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {technician.email}
                </span>
                {technician.specialty && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {technician.specialty}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "h-5 w-5",
                        star <= Math.round(technician.rating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-200"
                      )}
                    />
                  ))}
                  <span className="ml-1 text-sm font-medium">
                    {technician.rating.toFixed(1)}
                  </span>
                  <span className="text-sm text-slate-400">
                    ({technician.ratingCount} reviews)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {technician.isActive ? (
                  <DropdownMenuItem className="text-red-600">
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="text-green-600">
                    Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="h-4 w-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="locations" className="gap-2">
            <MapPin className="h-4 w-4" />
            Locations
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2">
            <Calendar className="h-4 w-4" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="time-off" className="gap-2">
            <Umbrella className="h-4 w-4" />
            Time Off
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab stats={stats} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab tasks={tasks} />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab attendance={attendance} />
        </TabsContent>

        <TabsContent value="locations">
          <LocationsTab assignments={assignments} />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleTab technicianId={technicianId} canManage={canManage} />
        </TabsContent>

        <TabsContent value="time-off">
          <TimeOffTab technicianId={technicianId} canManage={canManage} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceTab performance={performance} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
