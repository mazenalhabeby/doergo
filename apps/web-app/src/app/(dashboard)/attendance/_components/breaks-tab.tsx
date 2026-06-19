import { cn, formatDurationMinutes } from "@/lib/utils"
import { type Break, type BreakSummary } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Coffee, Clock, TrendingUp, Users, UtensilsCrossed, Pause, RefreshCw, CheckCircle2, Calendar } from "lucide-react"
import { StatCard, formatTime } from "./attendance-helpers"

interface BreaksTabProps {
  isAdmin: boolean
  breakSummary?: BreakSummary
  loadingBreakSummary: boolean
  activeBreaks: Break[]
  loadingActiveBreaks: boolean
  refetchActiveBreaks: () => void
  breakHistoryData?: { data?: Break[] }
  loadingBreakHistory: boolean
  refetchBreakHistory: () => void
  breakDate: string
  setBreakDate: (v: string) => void
  breakTypeFilter: string
  setBreakTypeFilter: (v: string) => void
  endBreakManually: { mutate: (args: { breakId: string }) => void; isPending: boolean }
}

export function BreaksTab({
  isAdmin,
  breakSummary,
  loadingBreakSummary,
  activeBreaks,
  loadingActiveBreaks,
  refetchActiveBreaks,
  breakHistoryData,
  loadingBreakHistory,
  refetchBreakHistory,
  breakDate,
  setBreakDate,
  breakTypeFilter,
  setBreakTypeFilter,
  endBreakManually,
}: BreaksTabProps) {
  return (
    <>
            {/* Break Statistics */}
            {!loadingBreakSummary && breakSummary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  title="Total Breaks"
                  value={breakSummary.totalBreaks}
                  icon={Coffee}
                  color="blue"
                />
                <StatCard
                  title="Total Break Time"
                  value={formatDurationMinutes(breakSummary.totalBreakMinutes)}
                  icon={Clock}
                  color="amber"
                />
                <StatCard
                  title="Average Break"
                  value={`${breakSummary.averageBreakMinutes}m`}
                  icon={TrendingUp}
                  color="green"
                />
                <StatCard
                  title="Active Now"
                  value={activeBreaks.length}
                  icon={Users}
                  color="slate"
                />
              </div>
            )}

            {/* Break Stats by Type */}
            {!loadingBreakSummary && breakSummary && breakSummary.totalBreaks > 0 && (
              <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-6 mb-6">
                <h3 className="text-md font-semibold text-foreground mb-4">Breaks by Type</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <UtensilsCrossed className="size-5 text-amber-600" />
                      <p className="font-medium text-amber-900 dark:text-amber-300">Lunch Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{breakSummary.breaksByType?.LUNCH?.count || 0}</p>
                        <p className="text-xs text-amber-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{formatDurationMinutes(breakSummary.breaksByType?.LUNCH?.totalMinutes || 0)}</p>
                        <p className="text-xs text-amber-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-900 dark:text-amber-300">{breakSummary.breaksByType?.LUNCH?.averageMinutes || 0}m</p>
                        <p className="text-xs text-amber-600">Avg</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Coffee className="size-5 text-blue-600" />
                      <p className="font-medium text-blue-900 dark:text-blue-300">Short Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-300">{breakSummary.breaksByType?.SHORT?.count || 0}</p>
                        <p className="text-xs text-blue-600">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-300">{formatDurationMinutes(breakSummary.breaksByType?.SHORT?.totalMinutes || 0)}</p>
                        <p className="text-xs text-blue-600">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-blue-900 dark:text-blue-300">{breakSummary.breaksByType?.SHORT?.averageMinutes || 0}m</p>
                        <p className="text-xs text-blue-600">Avg</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-muted rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Pause className="size-5 text-muted-foreground" />
                      <p className="font-medium text-foreground">Other Breaks</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-foreground">{breakSummary.breaksByType?.OTHER?.count || 0}</p>
                        <p className="text-xs text-muted-foreground">Count</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{formatDurationMinutes(breakSummary.breaksByType?.OTHER?.totalMinutes || 0)}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{breakSummary.breaksByType?.OTHER?.averageMinutes || 0}m</p>
                        <p className="text-xs text-muted-foreground">Avg</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active Breaks Section */}
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm mb-6">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600">
                      <Coffee className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Active Breaks</h2>
                      <p className="text-sm text-muted-foreground">
                        Workers currently on break
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchActiveBreaks()}
                    className="rounded-lg"
                  >
                    <RefreshCw className="size-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>

              {loadingActiveBreaks ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : activeBreaks.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="size-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground">No active breaks</h3>
                  <p className="text-muted-foreground mt-1">All workers are currently working</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activeBreaks.map((breakItem: Break) => (
                    <div key={breakItem.id} className="p-4 flex items-center justify-between hover:bg-accent">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "size-10 rounded-full flex items-center justify-center",
                          breakItem.type === "LUNCH" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                          breakItem.type === "SHORT" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {breakItem.type === "LUNCH" ? (
                            <UtensilsCrossed className="size-5" />
                          ) : breakItem.type === "SHORT" ? (
                            <Coffee className="size-5" />
                          ) : (
                            <Pause className="size-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {breakItem.user?.firstName} {breakItem.user?.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="capitalize">{breakItem.type.toLowerCase()} break</span>
                            <span>•</span>
                            <span>Started {formatTime(breakItem.startedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full",
                          "bg-orange-50 dark:bg-orange-500/10 text-orange-700 border border-orange-200"
                        )}>
                          <Clock className="size-3.5" />
                          On break
                        </span>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm("End this break manually?")) {
                                endBreakManually.mutate({ breakId: breakItem.id })
                              }
                            }}
                            disabled={endBreakManually.isPending}
                            className="rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          >
                            End Break
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Break History Section */}
            <div className="bg-card rounded-2xl border border-border/60 shadow-sm">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Break History</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      View past break records
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Break Type Filter */}
                    <Select
                      value={breakTypeFilter}
                      onValueChange={setBreakTypeFilter}
                    >
                      <SelectTrigger className="w-[130px] h-10 rounded-lg bg-card border-border/80 shadow-sm">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="LUNCH">Lunch</SelectItem>
                        <SelectItem value="SHORT">Short</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Date Filter */}
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        value={breakDate}
                        onChange={(e) => setBreakDate(e.target.value)}
                        className="pl-9 w-[160px] h-10 bg-card/80 border-border/80 rounded-lg shadow-sm"
                      />
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => refetchBreakHistory()}
                      className="h-10 w-10 rounded-lg border-border/80 bg-card shadow-sm hover:bg-accent"
                    >
                      <RefreshCw className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>

              {loadingBreakHistory ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !breakHistoryData?.data?.length ? (
                <div className="p-12 text-center">
                  <Coffee className="size-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground">No break records</h3>
                  <p className="text-muted-foreground mt-1">No breaks found for the selected date</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80">
                      <TableHead className="font-semibold text-muted-foreground">Worker</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Type</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Started</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Ended</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Duration</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakHistoryData.data.map((breakItem: Break) => (
                      <TableRow key={breakItem.id} className="hover:bg-accent/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              firstName={breakItem.user?.firstName}
                              lastName={breakItem.user?.lastName}
        
                              seed={breakItem.user?.id}
                              size="md"
                            />
                            <span className="font-medium text-foreground">
                              {breakItem.user?.firstName} {breakItem.user?.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border",
                            breakItem.type === "LUNCH" ? "bg-amber-500/10 text-amber-700 border-amber-200" :
                            breakItem.type === "SHORT" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200" :
                            "bg-muted text-foreground border-border"
                          )}>
                            {breakItem.type === "LUNCH" ? (
                              <UtensilsCrossed className="size-3.5" />
                            ) : breakItem.type === "SHORT" ? (
                              <Coffee className="size-3.5" />
                            ) : (
                              <Pause className="size-3.5" />
                            )}
                            {breakItem.type.charAt(0) + breakItem.type.slice(1).toLowerCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-foreground">{formatTime(breakItem.startedAt)}</TableCell>
                        <TableCell className="text-foreground">
                          {breakItem.endedAt ? formatTime(breakItem.endedAt) : (
                            <span className="text-orange-600">On break</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {formatDurationMinutes(breakItem.durationMinutes)}
                        </TableCell>
                        <TableCell>
                          {breakItem.notes ? (
                            <span className="text-sm text-muted-foreground truncate max-w-[150px] block" title={breakItem.notes}>
                              {breakItem.notes}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
    </>
  )
}
