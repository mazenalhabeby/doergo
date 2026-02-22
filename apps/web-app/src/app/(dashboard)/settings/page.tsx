"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Copy,
  Check,
  RefreshCw,
  Shield,
  Key,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { organizationsApi, JoinPolicy } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const JOIN_POLICY_OPTIONS = [
  {
    value: JoinPolicy.OPEN,
    label: "Open",
    description: "Anyone with your organization code can join immediately without approval.",
  },
  {
    value: JoinPolicy.INVITE_ONLY,
    label: "Invite Only",
    description:
      "People can request to join using your org code, but an admin must approve each request.",
  },
  {
    value: JoinPolicy.CLOSED,
    label: "Closed",
    description:
      "No one can join via org code. Members can only be added through invitations.",
  },
] as const

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // Join code state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Join policy state
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null)

  // Fetch join code info
  const {
    data: joinCodeData,
    isLoading: isLoadingJoinCode,
  } = useQuery({
    queryKey: ["organization-join-code"],
    queryFn: () => organizationsApi.getJoinCode(),
  })

  // Initialize selectedPolicy from fetched data
  const currentPolicy = selectedPolicy ?? joinCodeData?.joinPolicy ?? JoinPolicy.INVITE_ONLY
  const hasUnsavedPolicyChange = selectedPolicy !== null && selectedPolicy !== joinCodeData?.joinPolicy

  // Regenerate join code mutation
  const regenerateMutation = useMutation({
    mutationFn: () => organizationsApi.regenerateJoinCode(),
    onSuccess: (data) => {
      setGeneratedCode(data?.code || null)
      queryClient.invalidateQueries({ queryKey: ["organization-join-code"] })
      toast.success("Join code regenerated successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to regenerate join code")
    },
  })

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: { joinPolicy: string }) => organizationsApi.updateSettings(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organization-join-code"] })
      setSelectedPolicy(null)
      toast.success("Join policy updated successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update settings")
    },
  })

  const handleCopyCode = async () => {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    toast.success("Code copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSavePolicy = () => {
    if (!selectedPolicy) return
    updateSettingsMutation.mutate({ joinPolicy: selectedPolicy })
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Organization Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your organization's join code and membership policy
        </p>
      </div>

      {/* Join Code Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Key className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Join Code</CardTitle>
              <CardDescription>
                Share this code with people you want to join your organization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingJoinCode ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600">
                  {joinCodeData?.hasJoinCode
                    ? "Your organization has an active join code."
                    : "Your organization does not have a join code yet."}
                </span>
              </div>

              {/* Show generated code */}
              {generatedCode && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-2xl font-mono font-bold tracking-[0.3em] text-slate-800">
                    {generatedCode}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyCode}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : (
                      <Copy className="h-5 w-5 text-slate-400" />
                    )}
                  </Button>
                </div>
              )}

              {generatedCode && (
                <p className="text-xs text-amber-600">
                  This code will only be shown once. Make sure to copy it before leaving.
                </p>
              )}

              <Button
                variant="outline"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="gap-2"
              >
                {regenerateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {joinCodeData?.hasJoinCode ? "Regenerate Code" : "Generate Code"}
              </Button>

              {joinCodeData?.hasJoinCode && !generatedCode && (
                <p className="text-xs text-slate-500">
                  Regenerating will invalidate the previous code. Anyone using the old code will no longer be able to join.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Join Policy Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Join Policy</CardTitle>
              <CardDescription>
                Control how people can join your organization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingJoinCode ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {JOIN_POLICY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedPolicy(option.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      currentPolicy === option.value
                        ? "border-blue-500 bg-blue-50/50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          currentPolicy === option.value
                            ? "border-blue-500"
                            : "border-slate-300"
                        }`}
                      >
                        {currentPolicy === option.value && (
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            currentPolicy === option.value
                              ? "text-blue-700"
                              : "text-slate-800"
                          }`}
                        >
                          {option.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {hasUnsavedPolicyChange && (
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={handleSavePolicy}
                    disabled={updateSettingsMutation.isPending}
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPolicy(null)}
                    disabled={updateSettingsMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
