"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  MapPin,
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  Navigation,
  Shield,
  Users,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  X,
  Loader2,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import {
  locationsApi,
  techniciansApi,
  type CompanyLocation,
  type CreateLocationInput,
  type UpdateLocationInput,
  type LocationAssignment,
  type AssignTechnicianInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Dynamically import map to avoid SSR issues with Leaflet
const LocationPicker = dynamic(
  () => import("./_components/location-picker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[340px] rounded-lg border border-dashed border-slate-200 bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-6 w-6 text-slate-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-400">Loading map...</p>
        </div>
      </div>
    ),
  }
)

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const
const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function LocationsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("active")
  const [page, setPage] = useState(1)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CompanyLocation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CompanyLocation | null>(null)
  const [assignTarget, setAssignTarget] = useState<CompanyLocation | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["locations", statusFilter, page],
    queryFn: () => locationsApi.list({
      page,
      limit: 20,
      includeInactive: statusFilter === "all" || statusFilter === "inactive",
    }),
  })

  const locations = data?.data || []
  const meta = data?.meta
  const filteredLocations = locations.filter((loc) => {
    if (statusFilter === "active" && !loc.isActive) return false
    if (statusFilter === "inactive" && loc.isActive) return false
    if (search) {
      const q = search.toLowerCase()
      return loc.name.toLowerCase().includes(q) || (loc.address || "").toLowerCase().includes(q)
    }
    return true
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      setDeleteTarget(null)
      toast.success("Location deactivated successfully")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to deactivate location"),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => locationsApi.update(id, { isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      toast.success("Location reactivated")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reactivate"),
  })

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Company Locations</h1>
            <p className="mt-1.5 text-slate-500">
              Manage work sites, geofence areas, and technician assignments
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-slate-200/80 shadow-sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button onClick={() => setCreateOpen(true)} className="h-11 gap-2 rounded-xl shadow-sm">
                <Plus className="h-4 w-4" />
                Add Location
              </Button>
            )}
          </div>
        </div>

        {/* Search + count */}
        <div className="mt-6 flex items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search locations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-xl border-slate-200/80 shadow-sm"
            />
          </div>
          {meta && (
            <p className="text-sm text-slate-500">
              Showing {filteredLocations.length} of {meta.total} location{meta.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Location Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-slate-100 p-4 mb-4">
            <MapPin className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700">No locations found</h3>
          <p className="text-sm text-slate-500 mt-1">
            {statusFilter === "active" ? "Add your first company location to get started." : "No inactive locations."}
          </p>
          {isAdmin && statusFilter === "active" && (
            <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Add Location
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredLocations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              isAdmin={isAdmin}
              onEdit={() => setEditTarget(location)}
              onDelete={() => setDeleteTarget(location)}
              onReactivate={() => reactivateMutation.mutate(location.id)}
              onAssign={() => setAssignTarget(location)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <CreateLocationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["locations"] })
          setCreateOpen(false)
        }}
      />

      {editTarget && (
        <EditLocationDialog
          location={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null) }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["locations"] })
            setEditTarget(null)
          }}
        />
      )}

      {assignTarget && (
        <AssignTechnicianDialog
          location={assignTarget}
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null) }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate <strong>{deleteTarget?.name}</strong>? Technicians will no longer be able to clock in at this location. You can reactivate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================================
// LOCATION CARD
// ============================================================================

function LocationCard({
  location,
  isAdmin,
  onEdit,
  onDelete,
  onReactivate,
  onAssign,
}: {
  location: CompanyLocation
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
  onReactivate: () => void
  onAssign: () => void
}) {
  const { data: assignments } = useQuery({
    queryKey: ["location-assignments", location.id],
    queryFn: () => locationsApi.getAssignedTechnicians(location.id),
    enabled: location.isActive,
  })

  return (
    <div className={`rounded-xl border p-5 transition-all hover:shadow-md ${location.isActive ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200/60 opacity-70"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${location.isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 truncate">{location.name}</h3>
              {!location.isActive && (
                <Badge variant="outline" className="text-slate-500 border-slate-300 text-xs">Inactive</Badge>
              )}
            </div>
            {location.address && (
              <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                <Navigation className="h-3 w-3 shrink-0" />
                <span className="truncate">{location.address}</span>
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Shield className="h-3.5 w-3.5" />
                {location.geofenceRadius}m geofence
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              </span>
              {assignments && assignments.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {assignments.length} technician{assignments.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {/* Assignment badges */}
            {assignments && assignments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {assignments.map((a) => (
                  <Badge key={a.id} variant="secondary" className="text-xs font-normal">
                    {a.user?.firstName} {a.user?.lastName}
                    {a.isPrimary && <span className="ml-1 text-emerald-600 font-medium">(Primary)</span>}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {location.isActive && (
                <DropdownMenuItem onClick={onAssign}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign Technicians
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {location.isActive ? (
                <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onReactivate} className="text-emerald-600 focus:text-emerald-600">
                  <ToggleRight className="mr-2 h-4 w-4" />
                  Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CREATE DIALOG
// ============================================================================

function CreateLocationDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [radius, setRadius] = useState("50")

  const mutation = useMutation({
    mutationFn: (data: CreateLocationInput) => locationsApi.create(data),
    onSuccess: () => {
      toast.success("Location created successfully")
      resetForm()
      onSuccess()
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create location"),
  })

  const resetForm = () => {
    setName(""); setAddress(""); setLat(null); setLng(null); setRadius("50")
  }

  const handleSubmit = () => {
    if (!name.trim()) return toast.error("Name is required")
    if (lat === null || lng === null) return toast.error("Select a location on the map or search an address")

    mutation.mutate({
      name: name.trim(),
      address: address.trim() || undefined,
      lat,
      lng,
      geofenceRadius: parseInt(radius) || 50,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Location</DialogTitle>
          <DialogDescription>
            Search for an address or click on the map to set the location.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Location Name *</Label>
            <Input id="name" placeholder="e.g. Main Office" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Map Picker */}
          <LocationPicker
            lat={lat}
            lng={lng}
            radius={parseInt(radius) || 50}
            address={address}
            onLocationChange={(newLat, newLng) => { setLat(newLat); setLng(newLng) }}
            onAddressChange={setAddress}
          />

          <div className="space-y-2">
            <Label htmlFor="radius">Geofence Radius (meters)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="radius"
                type="number"
                min={5}
                max={500}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-24"
              />
              <input
                type="range"
                min={5}
                max={500}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="flex-1 accent-emerald-600"
              />
              <span className="text-sm text-slate-500 w-12 text-right">{radius}m</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// EDIT DIALOG
// ============================================================================

function EditLocationDialog({
  location,
  open,
  onOpenChange,
  onSuccess,
}: {
  location: CompanyLocation
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(location.name)
  const [address, setAddress] = useState(location.address || "")
  const [lat, setLat] = useState<number | null>(location.lat)
  const [lng, setLng] = useState<number | null>(location.lng)
  const [radius, setRadius] = useState(location.geofenceRadius.toString())

  const mutation = useMutation({
    mutationFn: (data: UpdateLocationInput) => locationsApi.update(location.id, data),
    onSuccess: () => {
      toast.success("Location updated successfully")
      onSuccess()
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update location"),
  })

  const handleSubmit = () => {
    if (!name.trim()) return toast.error("Name is required")
    if (lat === null || lng === null) return toast.error("Location is required")

    mutation.mutate({
      name: name.trim(),
      address: address.trim() || undefined,
      lat,
      lng,
      geofenceRadius: parseInt(radius) || 50,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Location</DialogTitle>
          <DialogDescription>Update the details or move the pin on the map.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Location Name *</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Map Picker */}
          <LocationPicker
            lat={lat}
            lng={lng}
            radius={parseInt(radius) || 50}
            address={address}
            onLocationChange={(newLat, newLng) => { setLat(newLat); setLng(newLng) }}
            onAddressChange={setAddress}
          />

          {lat !== null && lng !== null && (
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-emerald-700">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-radius">Geofence Radius (meters)</Label>
            <div className="flex items-center gap-3">
              <Input id="edit-radius" type="number" min={5} max={500} value={radius} onChange={(e) => setRadius(e.target.value)} className="w-24" />
              <input type="range" min={5} max={500} value={radius} onChange={(e) => setRadius(e.target.value)} className="flex-1 accent-emerald-600" />
              <span className="text-sm text-slate-500 w-12 text-right">{radius}m</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// ASSIGN TECHNICIAN DIALOG
// ============================================================================

function AssignTechnicianDialog({
  location,
  open,
  onOpenChange,
}: {
  location: CompanyLocation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const [selectedTechId, setSelectedTechId] = useState("")
  const [isPrimary, setIsPrimary] = useState(false)
  const [selectedDays, setSelectedDays] = useState<string[]>([...DAYS])

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["location-assignments", location.id],
    queryFn: () => locationsApi.getAssignedTechnicians(location.id),
  })

  const { data: techData } = useQuery({
    queryKey: ["technicians-for-assign"],
    queryFn: () => techniciansApi.list({ limit: 100, status: "active", workMode: "all" }),
  })

  // Filter to only ON_SITE/HYBRID technicians not already assigned
  const assignedIds = new Set((assignments || []).map((a) => a.userId))
  const availableTechs = (techData?.data || []).filter(
    (t) => !assignedIds.has(t.id) && (t.workMode === "ON_SITE" || t.workMode === "HYBRID")
  )

  const assignMutation = useMutation({
    mutationFn: (data: AssignTechnicianInput) => locationsApi.assignTechnician(location.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-assignments", location.id] })
      toast.success("Technician assigned")
      setSelectedTechId("")
      setIsPrimary(false)
      setSelectedDays([...DAYS])
    },
    onError: (err: Error) => toast.error(err.message || "Failed to assign technician"),
  })

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => locationsApi.removeAssignment(location.id, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-assignments", location.id] })
      toast.success("Assignment removed")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to remove assignment"),
  })

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const handleAssign = () => {
    if (!selectedTechId) return toast.error("Select a technician")
    assignMutation.mutate({
      userId: selectedTechId,
      isPrimary,
      schedule: selectedDays.length === 7 ? undefined : selectedDays,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Technicians - {location.name}</DialogTitle>
          <DialogDescription>
            Assign technicians to this location for attendance tracking.
          </DialogDescription>
        </DialogHeader>

        {/* Current Assignments */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">Current Assignments</h4>
          {assignmentsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !assignments || assignments.length === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">No technicians assigned yet</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        {a.user?.firstName} {a.user?.lastName}
                      </span>
                      {a.isPrimary && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">Primary</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {a.schedule && a.schedule.length > 0 && a.schedule.length < 7
                        ? a.schedule.map((d) => DAY_LABELS[d] || d).join(", ")
                        : "All days"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-red-600"
                    onClick={() => removeMutation.mutate(a.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Add New Assignment */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">Add Technician</h4>
          <Select value={selectedTechId} onValueChange={setSelectedTechId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a technician..." />
            </SelectTrigger>
            <SelectContent>
              {availableTechs.length === 0 ? (
                <div className="p-2 text-sm text-slate-400 text-center">
                  No available technicians (ON_SITE/HYBRID only)
                </div>
              ) : (
                availableTechs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.firstName} {t.lastName} ({t.workMode})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {/* Schedule Days */}
          <div className="space-y-2">
            <Label className="text-xs">Work Days</Label>
            <div className="flex gap-1">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    selectedDays.includes(day)
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-slate-50 text-slate-400 border border-slate-200"
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-600">Set as primary location</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedTechId || assignMutation.isPending}
          >
            {assignMutation.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
