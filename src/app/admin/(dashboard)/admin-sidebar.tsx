"use client";

import {
  BookOpen,
  ClipboardCheck,
  Landmark,
  Library,
  LogOut,
  PanelLeft,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "src/components/ui/sidebar";
import { authClient } from "src/lib/auth-client";
import type { UserSchool } from "src/lib/school-service";
import { AdminSchoolHeader } from "./admin-school-header";
import { GuardedLink } from "./guarded-link";
import { useLeaveGuard } from "./leave-guard.state";
import { useSidebarCounts } from "./sidebar-counts.state";

const navItems = [
  {
    title: "To grade",
    href: "/admin/grading",
    icon: ClipboardCheck,
    badgeClass:
      "bg-warning/15 text-warning-foreground dark:bg-warning/20 dark:text-warning",
  },
  { title: "Courses", href: "/admin/courses", icon: BookOpen },
  { title: "Question bank", href: "/admin/pools", icon: Library },
  { title: "Students", href: "/admin/students", icon: Users },
  {
    title: "Join requests",
    href: "/admin/join-requests",
    icon: UserPlus,
    badgeClass: "bg-muted text-muted-foreground",
  },
];

const ownerItems = [
  { title: "User roles", href: "/admin/user-roles", icon: ShieldCheck },
  { title: "Schools", href: "/admin/schools", icon: Landmark },
];

/** Keeps a corner badge inside the 40 px rail tile. */
function railCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

/** Matches the entry's own page and everything nested under it. */
function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  email,
  isOwner = false,
  school = null,
  schools = [],
}: {
  email: string;
  isOwner?: boolean;
  school?: UserSchool | null;
  schools?: UserSchool[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { requestLeave } = useLeaveGuard();
  const { isMobile, state, toggleSidebar, setOpenMobile } = useSidebar();
  const isRail = !isMobile && state === "collapsed";
  const counts = useSidebarCounts();
  const badgeCounts: Record<string, number> = {
    "/admin/grading": counts?.toGrade ?? 0,
    "/admin/join-requests": counts?.joinRequests ?? 0,
  };

  // The layout outlives navigation, so a link to the page already open would leave the sheet over it
  function closeSheet() {
    setOpenMobile(false);
  }

  async function logout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-1">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <AdminSchoolHeader school={school} schools={schools} />
            </SidebarMenuItem>
          </SidebarMenu>
          {isMobile && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={closeSheet}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const count = badgeCounts[item.href] ?? 0;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isCurrent(pathname, item.href)}
                      aria-current={
                        isCurrent(pathname, item.href) ? "page" : undefined
                      }
                      aria-label={
                        count > 0
                          ? `${item.title}, ${count} waiting`
                          : undefined
                      }
                      className="group-data-[collapsible=icon]:size-10!"
                      tooltip={
                        count > 0
                          ? `${item.title} · ${count} waiting`
                          : item.title
                      }
                    >
                      <GuardedLink href={item.href} onClick={closeSheet}>
                        <item.icon />
                        <span className="min-w-0 flex-1 truncate">
                          {item.title}
                        </span>
                        {count > 0 && (
                          <span
                            className={`grid h-5 min-w-5 shrink-0 place-items-center overflow-visible! rounded-md px-1 text-xs font-medium tabular-nums group-data-[collapsible=icon]:hidden ${item.badgeClass}`}
                          >
                            {count}
                          </span>
                        )}
                      </GuardedLink>
                    </SidebarMenuButton>
                    {count > 0 && (
                      <span
                        aria-hidden="true"
                        data-testid="rail-badge"
                        className={`pointer-events-none absolute top-0 right-0 hidden h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums group-data-[collapsible=icon]:grid ${item.badgeClass}`}
                      >
                        {railCount(count)}
                      </span>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isOwner && (
          <SidebarGroup>
            <SidebarGroupLabel>Owner</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ownerItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isCurrent(pathname, item.href)}
                      aria-current={
                        isCurrent(pathname, item.href) ? "page" : undefined
                      }
                      aria-label={item.title}
                      className="group-data-[collapsible=icon]:size-10!"
                      tooltip={item.title}
                    >
                      <GuardedLink href={item.href} onClick={closeSheet}>
                        <item.icon />
                        <span>{item.title}</span>
                      </GuardedLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        {isRail ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-expanded={false}
                aria-label="Expand sidebar"
                className="size-10!"
                onClick={toggleSidebar}
                tooltip="Expand sidebar"
              >
                <PanelLeft />
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    aria-label={`Account: ${email}`}
                    className="size-10!"
                    tooltip={`${email} · Sign out`}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-[30px] shrink-0 place-items-center rounded-full bg-info/15 text-xs font-semibold text-info uppercase dark:bg-info/20"
                    >
                      {email.charAt(0)}
                    </span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="end"
                  className="min-w-56"
                >
                  <DropdownMenuLabel className="truncate font-normal">
                    {email}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => requestLeave(logout)}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{email}</span>
                {!isMobile && (
                  <button
                    type="button"
                    aria-expanded
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                    onClick={toggleSidebar}
                    className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
                  >
                    <PanelLeft className="size-4" />
                  </button>
                )}
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => requestLeave(logout)}
                tooltip="Sign out"
              >
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
