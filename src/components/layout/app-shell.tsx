"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Calendar,
  Users,
  LayoutDashboard,
  Menu,
  Settings,
  UserPlus,
  CreditCard,
  LogOut,
  Mic,
  Stethoscope,
  ShieldAlert,
  ScrollText,
  ClipboardList,
  FileArchive,
  FileAudio,
  ChevronRight,
  AlertTriangle,
  Database,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { GlobalCallButton } from "@/components/layout/global-call-button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User, Organization } from "@/types/database";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type UserWithOrg = User & {
  organizations: Organization;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  visibleTo?: (role: string) => boolean;
};

const isAdminRole = (role: string) =>
  role === "admin" || role === "compliance_admin";
const isClinicalRole = (role: string) =>
  role !== "ops_staff" && role !== "billing_staff";
const isBillingCapable = (role: string) =>
  isAdminRole(role) || role === "billing_staff";

const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: CalendarDays, visibleTo: isClinicalRole },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/residents", label: "Residents", icon: Users },
  { href: "/voice-sessions", label: "Calls", icon: Mic, visibleTo: isClinicalRole },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle, visibleTo: isAdminRole },
];

const secondaryNav: NavItem[] = [
  { href: "/diligence", label: "Diligence", icon: FileAudio },
  { href: "/team", label: "Team", icon: UserPlus, visibleTo: isAdminRole },
  { href: "/clinicians", label: "Clinicians", icon: Stethoscope, visibleTo: isAdminRole },
  { href: "/assignments", label: "Assignments", icon: ClipboardList, visibleTo: isAdminRole },
  { href: "/sensitive-access", label: "Sensitive Access", icon: ShieldAlert, visibleTo: isAdminRole },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText, visibleTo: isAdminRole },
  { href: "/data-requests", label: "Data Requests", icon: FileArchive, visibleTo: isAdminRole },
  { href: "/settings", label: "Settings", icon: Settings, visibleTo: isAdminRole },
  { href: "/billing", label: "Billing", icon: CreditCard, visibleTo: isBillingCapable },
  { href: "/admin/schema", label: "Schema", icon: Database, visibleTo: isAdminRole },
];

export function AppShell({
  user,
  children,
}: {
  user: UserWithOrg;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const role = user.role;
  const isAdmin = isAdminRole(role);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const initials = user.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "U";

  return (
    <div className="flex h-full">
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-sidebar">
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Logo href="/" size="sm" />
        </div>

        {/* Primary nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {primaryNav.map((item) => {
              if (item.visibleTo && !item.visibleTo(role)) return null;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Secondary / admin nav */}
          {secondaryNav.some((item) => !item.visibleTo || item.visibleTo(role)) && (
            <div className="mt-6">
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Management
              </p>
              <div className="space-y-1">
                {secondaryNav.map((item) => {
                  if (item.visibleTo && !item.visibleTo(role)) return null;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="border-t px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent/60 transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium leading-none text-sidebar-foreground">
                  {user.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground mt-0.5">
                  {formatRole(role)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push("/settings")}
                className="cursor-pointer"
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop top bar */}
        <header className="hidden md:flex h-14 items-center justify-end border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <ThemeToggle />
        </header>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
          <Logo href="/" size="sm" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Sheet>
              <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{user.full_name}</SheetTitle>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">{formatRole(role)}</p>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1">
                  {secondaryNav.map((item) => {
                    if (item.visibleTo && !item.visibleTo(role)) return null;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>

        {/* Global voice call FAB */}
        <GlobalCallButton user={user} />

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
          <div className="flex h-16 items-center justify-around">
            {primaryNav.map((item) => {
              if (item.visibleTo && !item.visibleTo(role)) return null;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                    active ? "text-primary font-medium" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function formatRole(role: string): string {
  switch (role) {
    case "admin": return "Admin";
    case "compliance_admin": return "Compliance admin";
    case "caregiver": return "Caregiver";
    case "nurse_reviewer": return "Nurse reviewer";
    case "ops_staff": return "Operations";
    case "billing_staff": return "Billing";
    default: return role;
  }
}
