"use client"

import { useState, use, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Send,
  Loader2,
  RefreshCw,
  FileText,
  Download,
  Image as ImageIcon,
  AlertCircle,
  MessageCircle,
  Phone,
  Film,
  X,
  Star,
  MapPin,
  Clock,
  Briefcase,
  Calendar,
  Headphones,
  Pencil,
  CheckCircle2,
  ChevronDown,
  Package,
  Eye,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useBreadcrumbOverride } from "@/contexts/breadcrumb-context"
import { tasksApi, usersApi, type Comment, type Worker } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const stepLabels = ["Company Accepted", "Technician Assigned", "Work in Progress", "Completed"]

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { setOverride, clearOverride } = useBreadcrumbOverride()
  const isDispatcher = user?.role === "DISPATCHER"
  const isClient = user?.role === "CLIENT"

  const [newComment, setNewComment] = useState("")
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [technicianSearch, setTechnicianSearch] = useState("")
  const [showRequestDetails, setShowRequestDetails] = useState(true)

  const { data: task, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["task", id],
    queryFn: () => tasksApi.getById(id),
  })

  useEffect(() => {
    if (task?.title) setOverride(id, task.title)
    return () => clearOverride(id)
  }, [id, task?.title, setOverride, clearOverride])

  const canAssign = isClient || isDispatcher
  const { data: workers, isLoading: loadingWorkers } = useQuery({
    queryKey: ["workers"],
    queryFn: () => usersApi.getWorkers(),
    enabled: canAssign,
  })

  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.addComment(id, content),
    onSuccess: () => { toast.success("Comment added"); setNewComment(""); queryClient.invalidateQueries({ queryKey: ["task", id] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const assignMutation = useMutation({
    mutationFn: (workerId: string) => tasksApi.assign(id, workerId),
    onSuccess: () => {
      toast.success("Technician assigned")
      setShowAssignModal(false)
      queryClient.invalidateQueries({ queryKey: ["task", id] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.delete(id),
    onSuccess: () => { toast.success("Request cancelled"); queryClient.invalidateQueries({ queryKey: ["tasks"] }); router.push("/tasks") },
    onError: (e: Error) => toast.error(e.message),
  })

  // Determine states
  const isCanceled = task?.status === "CANCELED"
  const isCompleted = task?.status === "COMPLETED" || task?.status === "CLOSED"
  const isInProgress = task?.status === "IN_PROGRESS" || task?.status === "BLOCKED"
  const isAssigned = task?.status === "ASSIGNED"
  const isPending = task?.status === "NEW" || task?.status === "DRAFT"
  const hasAssignee = !!task?.assignedTo

  // Determine current step (0-3)
  const getCurrentStep = () => {
    if (isCompleted) return 3
    if (isInProgress) return 2
    if (isAssigned) return 1
    return 0
  }
  const currentStep = getCurrentStep()

  // Mock: Has technician note (for State 2)
  const hasTechnicianNote = isInProgress && hasAssignee
  // Mock: Is recently accepted (for State 1 - show orange banner)
  const isRecentlyAccepted = isAssigned || (isInProgress && !hasTechnicianNote)

  // Mock technician data
  const mockTechnicians = workers?.map((w: Worker, i: number) => ({
    ...w,
    rating: 4.4 + (i * 0.1),
    specialty: ["Electrical", "Mechanical", "CNC Specialist", "Plumbing"][i % 4],
    status: ["Available", "Busy", "Available", "On vacation"][i % 4],
    currentJobs: i % 3,
    availableAt: ["Today 4 PM", "Tomorrow 9 AM", "Today 2 PM", "Next week"][i % 4],
    distance: `${(1.5 + i * 0.2).toFixed(1)} km away`,
  })) || []

  const suggestedTechnician = mockTechnicians[0]

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 p-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-20 w-full rounded-xl mb-4" />
        <Skeleton className="h-40 w-full rounded-xl mb-4" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  if (isError || !task) {
    return (
      <div className="min-h-full bg-slate-50 p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Task Details</h1>
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <AlertCircle className="mx-auto size-12 text-red-400 mb-4" />
          <p className="font-semibold text-lg mb-2">Failed to load task</p>
          <p className="text-gray-500 mb-4">{(error as Error)?.message || "Not found"}</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 size-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  const comments = task.comments || []
  const requestId = `REQ-${new Date(task.createdAt).getFullYear()}-${task.id.slice(0, 3).toUpperCase()}`
  const taskDate = new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  return (
    <div className="min-h-full bg-slate-50">
      {/* ========== TECHNICIAN ASSIGNMENT MODAL ========== */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Technicians</h2>
                <p className="text-sm text-gray-500">Select a technician to handle this maintenance request.</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="size-5 text-gray-400" />
              </button>
            </div>
            {suggestedTechnician && (
              <div className="px-6 py-4 bg-slate-50 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10"><AvatarFallback className="bg-blue-100 text-blue-600 font-medium text-sm">{suggestedTechnician.firstName[0]}{suggestedTechnician.lastName[0]}</AvatarFallback></Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Suggested Technician:</span>
                        <span className="text-sm font-medium text-gray-900">{suggestedTechnician.firstName} {suggestedTechnician.lastName}</span>
                      </div>
                      <p className="text-xs text-gray-500">Available today at 2 PM</p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs h-8 px-4" onClick={() => assignMutation.mutate(suggestedTechnician.id)} disabled={assignMutation.isPending}>
                    {assignMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Assign Automatically"}
                  </Button>
                </div>
              </div>
            )}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex gap-3">
                <Input placeholder="Name" className="flex-1 h-9 text-sm" value={technicianSearch} onChange={(e) => setTechnicianSearch(e.target.value)} />
                <Select><SelectTrigger className="w-28 h-9 text-sm"><SelectValue placeholder="Distance" /></SelectTrigger><SelectContent><SelectItem value="nearest">Nearest</SelectItem><SelectItem value="5km">Within 5km</SelectItem></SelectContent></Select>
                <Select><SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Specialization" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="electrical">Electrical</SelectItem></SelectContent></Select>
                <Select><SelectTrigger className="w-28 h-9 text-sm"><SelectValue placeholder="Availability" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="available">Available</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[400px] divide-y divide-gray-100">
              {loadingWorkers ? (
                <div className="p-6 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
              ) : mockTechnicians.length > 0 ? (
                mockTechnicians.map((tech: typeof mockTechnicians[0]) => (
                  <div key={tech.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <Avatar className="size-11"><AvatarFallback className="bg-orange-100 text-orange-600 font-medium">{tech.firstName[0]}{tech.lastName[0]}</AvatarFallback></Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{tech.firstName} {tech.lastName}</span>
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-sm text-gray-600">{tech.rating.toFixed(1)}</span>
                        </div>
                        <p className="text-sm text-gray-500">{tech.specialty}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                          <span className={cn("flex items-center gap-1", tech.status === "Available" ? "text-green-600" : tech.status === "Busy" ? "text-amber-600" : "text-gray-400")}>
                            <span className={cn("size-1.5 rounded-full", tech.status === "Available" ? "bg-green-500" : tech.status === "Busy" ? "bg-amber-500" : "bg-gray-300")} />{tech.status}
                          </span>
                          <span className="flex items-center gap-1"><Briefcase className="size-3" />{tech.currentJobs} Jobs</span>
                          <span className="flex items-center gap-1"><Clock className="size-3" />{tech.availableAt}</span>
                          <span className="flex items-center gap-1"><MapPin className="size-3" />{tech.distance}</span>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" className={cn("h-8 px-4 text-xs", tech.status === "Busy" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700")} onClick={() => assignMutation.mutate(tech.id)} disabled={assignMutation.isPending || tech.status === "On vacation"}>Assign</Button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">No technicians available</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-8 max-w-6xl mx-auto">
        {/* ========== PAGE HEADER ========== */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">Task Details</h1>
            <div className="flex items-center gap-3 mb-2">
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-medium",
                isCompleted ? "bg-green-100 text-green-700" :
                (isInProgress || isAssigned) ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-600"
              )}>
                {isCompleted ? "Completed" : (isInProgress || isAssigned) ? "In Progress" : "Pending"}
              </span>
              <span className="text-base font-medium text-gray-900">{task.title}</span>
              <span className="text-sm text-gray-400">Model GE1345</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>Request: {requestId}</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" />
                {taskDate}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="h-9 px-4 text-sm">
              <Headphones className="size-4 mr-2" />
              Contact support
            </Button>
            {!hasAssignee && canAssign ? (
              <Button className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700" onClick={() => setShowAssignModal(true)}>
                <Pencil className="size-4 mr-2" />
                Assign Technician
              </Button>
            ) : (
              <Button className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700">
                <Pencil className="size-4 mr-2" />
                Edit task request
              </Button>
            )}
          </div>
        </div>

        {/* ========== STATE 1: ACCEPTANCE BANNER (shown when recently assigned) ========== */}
        {isAssigned && hasAssignee && (
          <div className="border-2 border-amber-300 bg-amber-50 rounded-xl px-6 py-4 mb-6 text-center">
            <p className="text-base font-medium text-amber-900 mb-1">
              Your maintenance request has been accepted
            </p>
            <p className="text-sm text-amber-700">
              A technician has been assigned to your case. You can view details and progress below.
            </p>
          </div>
        )}

        {/* ========== PROGRESS CARD + TECHNICIAN CARD ========== */}
        {hasAssignee && !isCanceled && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex gap-6">
              {/* Progress Section */}
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {isCompleted ? "Maintenance Completed" : "Your Task is in Progress"}
                </h3>
                {isCompleted && (
                  <p className="text-sm text-gray-500 mb-4">
                    The technician has finished all required work. Please review the final report before signing.
                  </p>
                )}

                {/* Stepper */}
                <div className="flex items-center mt-6">
                  {stepLabels.map((label, index) => (
                    <div key={label} className="flex items-center flex-1">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "size-8 rounded-full flex items-center justify-center text-sm font-medium border-2",
                          index < currentStep ? "bg-blue-600 border-blue-600 text-white" :
                          index === currentStep ? "bg-blue-600 border-blue-600 text-white" :
                          "bg-white border-gray-200 text-gray-400"
                        )}>
                          {index < currentStep ? (
                            <CheckCircle2 className="size-5" />
                          ) : (
                            <span className="size-2 rounded-full bg-current" />
                          )}
                        </div>
                        <span className={cn(
                          "text-xs mt-2 text-center max-w-[80px]",
                          index <= currentStep ? "text-gray-900 font-medium" : "text-gray-400"
                        )}>
                          {label}
                        </span>
                      </div>
                      {index < stepLabels.length - 1 && (
                        <div className={cn(
                          "flex-1 h-0.5 -mt-6 mx-2",
                          index < currentStep ? "bg-blue-600" : "bg-gray-200"
                        )} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Technician Card */}
              <div className="w-64 border-l border-gray-100 pl-6">
                <p className="text-xs text-gray-400 mb-3">Technician</p>
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="size-12">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-medium">
                      {task.assignedTo!.firstName[0]}{task.assignedTo!.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-gray-900">{task.assignedTo!.firstName} {task.assignedTo!.lastName}</p>
                    <p className="text-xs text-gray-500">CNC Specialist</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-green-500" />
                    On site
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    Est. 2h
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-xs">
                    <Phone className="size-3.5 mr-1.5" />
                    Call
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-9 text-xs">
                    <MessageCircle className="size-3.5 mr-1.5" />
                    Message
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== STATE 3: JOB REPORT (only when completed) ========== */}
        {isCompleted && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Job Report</h3>

            {/* Spare Parts */}
            <button className="w-full flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Package className="size-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">Spare Parts used</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">3</span>
                <ChevronDown className="size-4 text-gray-400" />
              </div>
            </button>

            {/* Closing Notes */}
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-900 mb-3">Closing Notes</p>
              <div className="border-l-4 border-green-500 bg-green-50 rounded-r-lg p-4">
                <p className="text-sm text-green-900">
                  Motor coupling replaced. Power stability restored. Full function test passed for 30 minutes continuous run.
                </p>
                <p className="text-xs text-green-600 mt-2">
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at 14:30
                </p>
              </div>
            </div>

            {/* Job Attachments */}
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-900 mb-3">Attachments</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3">
                  <FileText className="size-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Maintenance Report.pdf</p>
                    <p className="text-xs text-gray-400">2.4 MB</p>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <button className="p-1.5 hover:bg-gray-100 rounded"><Download className="size-4 text-gray-400" /></button>
                    <button className="p-1.5 hover:bg-gray-100 rounded"><Eye className="size-4 text-gray-400" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3">
                  <ImageIcon className="size-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Before-After Photos.zip</p>
                    <p className="text-xs text-gray-400">8.1 MB</p>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <button className="p-1.5 hover:bg-gray-100 rounded"><Download className="size-4 text-gray-400" /></button>
                    <button className="p-1.5 hover:bg-gray-100 rounded"><Eye className="size-4 text-gray-400" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== STATE 2: LATEST TECHNICIAN NOTE (in progress with note) ========== */}
        {isInProgress && hasTechnicianNote && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Latest Technician Note</h3>
            <div className="border-l-4 border-amber-500 bg-amber-50 rounded-r-lg p-4 mb-4">
              <p className="text-sm text-amber-900">
                Checked hydraulic hose coupling. Replacing with upgraded part. Will need thorough testing before completion.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at 10:45
              </p>
            </div>
          </div>
        )}

        {/* ========== REQUEST DETAILS SECTION ========== */}
        <div className="bg-white rounded-2xl shadow-sm mb-6">
          {isCompleted && (
            <button
              onClick={() => setShowRequestDetails(!showRequestDetails)}
              className="w-full flex items-center justify-between p-6 border-b border-gray-100"
            >
              <h3 className="text-base font-semibold text-gray-900">Request details</h3>
              <ChevronDown className={cn("size-5 text-gray-400 transition-transform", showRequestDetails && "rotate-180")} />
            </button>
          )}

          {(showRequestDetails || !isCompleted) && (
            <div className="p-6 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Description</h3>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
                </div>
              </div>

              {/* Task Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Task Information</h3>
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Location</p>
                      <a href="#" className="text-sm text-blue-600 hover:underline">{task.locationAddress || "https://maps.app.goo.gl/..."}</a>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Time preferred</p>
                      <p className="text-sm text-gray-900">{task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "1× Day"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Name of Person Responsible</p>
                      <p className="text-sm text-gray-900">{task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Phone</p>
                      <p className="text-sm text-gray-900">+1 212 555 0123</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Priority</p>
                      <p className="text-sm text-blue-600 font-medium">{task.priority || "Norm"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Maintenance History */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Maintenance History</h3>
                <div className="border border-gray-200 rounded-xl p-5">
                  <p className="text-sm font-medium text-gray-900 mb-4">Task ID: #{task.id.slice(0, 3).toUpperCase()}</p>
                  <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Issue:</span>
                      <span className="text-gray-900">{task.title}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Duration:</span>
                      <span className="text-gray-900">{Math.max(1, Math.ceil((Date.now() - new Date(task.createdAt).getTime()) / 86400000))} days</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Reported Date:</span>
                      <span className="text-gray-900">{new Date(task.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Technician:</span>
                      <span className="text-gray-900">{task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName[0]}.` : "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Start Date:</span>
                      <span className="text-gray-900">{hasAssignee ? new Date(task.updatedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Technician Contact:</span>
                      <span className="text-gray-900">{task.assignedTo?.email || "—"}</span>
                    </div>
                    {isCompleted && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Completed Date:</span>
                        <span className="text-gray-900">{new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Attachments */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Attachments</h3>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { name: "oven-issue-1.jpg", size: "2.4 MB", Icon: ImageIcon },
                    { name: "oven-demo.mp4", size: "12.8 MB", Icon: Film },
                    { name: "warranty-info.pdf", size: "1.2 MB", Icon: FileText },
                    { name: "receipt.pdf", size: "0.8 MB", Icon: FileText },
                  ].map((file) => (
                    <div key={file.name} className="border border-gray-200 rounded-xl p-4">
                      <div className="w-12 h-12 border border-gray-200 rounded-lg flex items-center justify-center mb-3">
                        <file.Icon className="size-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate mb-0.5">{file.name}</p>
                      <p className="text-xs text-gray-400 mb-2">{file.size}</p>
                      <a href="#" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                        <Download className="size-3.5" /> Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== COMMENTS ========== */}
        {comments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Comments ({comments.length})</h3>
            <div className="space-y-4">
              {comments.map((c: Comment) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar className="size-8"><AvatarFallback className="bg-gray-100 text-xs">{c.user.firstName[0]}{c.user.lastName[0]}</AvatarFallback></Avatar>
                  <div>
                    <p className="text-sm"><span className="font-medium">{c.user.firstName} {c.user.lastName}</span><span className="text-gray-400 ml-2 text-xs">{new Date(c.createdAt).toLocaleDateString()}</span></p>
                    <p className="text-sm text-gray-600 mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== ADD COMMENT ========== */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex gap-3">
            <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." className="flex-1 resize-none text-sm" rows={2} />
            <Button className="h-auto bg-blue-600 hover:bg-blue-700" onClick={() => commentMutation.mutate(newComment.trim())} disabled={!newComment.trim() || commentMutation.isPending}>
              {commentMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>

        {/* ========== FOOTER ACTIONS ========== */}
        <div className="flex justify-end gap-3">
          {!isCompleted && !isCanceled && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="h-9 px-4 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-600">
                  Cancel request
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Request</AlertDialogTitle>
                  <AlertDialogDescription>Are you sure you want to cancel this maintenance request? This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Request</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-red-600 hover:bg-red-700">Cancel Request</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  )
}
