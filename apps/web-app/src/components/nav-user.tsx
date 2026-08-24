"use client"

import Link from "next/link"
import {
  ChevronsUpDown,
  LogOut,
  Settings,
  User,
  Shield,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { roleBadge } from "@/lib/role-badge"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

// Role badge styles
export function NavUser() {
  const { user, logout } = useAuth()
  const { isMobile } = useSidebar()
  const { t } = useTranslation()

  if (!user) return null

  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`
  const fullName = `${user.firstName} ${user.lastName}`
  const role = roleBadge(user.role)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="group rounded-xl border border-border bg-card p-3 transition-all hover:bg-muted hover:border-border data-[state=open]:bg-muted data-[state=open]:border-border"
            >
              <Avatar className="h-9 w-9 rounded-lg ring-2 ring-border">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={fullName} className="rounded-lg object-cover" />}
                <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold text-base">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-base leading-tight">
                <span className="truncate font-semibold text-foreground">{fullName}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-64 rounded-xl p-2"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 p-2">
                <Avatar className="h-11 w-11 rounded-xl ring-2 ring-border">
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={fullName} className="rounded-xl object-cover" />}
                  <AvatarFallback className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="font-semibold text-base text-foreground">{fullName}</span>
                  <span className="text-sm text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-2" />

            {/* Role Badge */}
            <div className="px-2 py-1.5">
              <div className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold",
                role.className
              )}>
                <Shield className="size-3.5" />
                {t(role.labelKey)}
              </div>
            </div>

            <DropdownMenuSeparator className="my-2" />

            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                <Link href="/profile" className="flex items-center gap-2 py-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-base">{t("nav.userMenu.profile")}</span>
                    <span className="text-sm text-muted-foreground">{t("nav.userMenu.viewYourProfile")}</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                <Link href="/settings" className="flex items-center gap-2 py-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <Settings className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-base">{t("nav.userMenu.settings")}</span>
                    <span className="text-sm text-muted-foreground">{t("nav.userMenu.managePreferences")}</span>
                  </div>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-2" />

            <DropdownMenuItem
              onClick={logout}
              className="rounded-lg cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <div className="flex items-center gap-2 py-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-red-50">
                  <LogOut className="size-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-base">{t("nav.userMenu.signOut")}</span>
                  <span className="text-sm text-red-400">{t("nav.userMenu.endYourSession")}</span>
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
