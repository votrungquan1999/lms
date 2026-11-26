"use client";

import {
  BookOpen,
  ClipboardCheck,
  Landmark,
  Library,
  LogOut,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
} from "src/components/ui/sidebar";
import { authClient } from "src/lib/auth-client";
import type { UserSchool } from "src/lib/school-service";
import { AdminSchoolHeader } from "./admin-school-header";
import { GuardedLink } from "./guarded-link";
import { useLeaveGuard } from "./leave-guard.state";
import { useSidebarCounts } from "./sidebar-counts.state";

const navItems = [
  { title: "To grade", href: "/admin/grading", icon: ClipboardCheck },
  { title: "Courses", href: "/admin/courses", icon: BookOpen },
  { title: "Question bank", href: "/admin/pools", icon: Library },
  { title: "Students", href: "/admin/students", icon: Users },
  { title: "Join requests", href: "/admin/join-requests", icon: UserPlus },
];

const ownerItems = [
  { title: "User roles", href: "/admin/user-roles", icon: ShieldCheck },
  { title: "Schools", href: "/admin/schools", icon: Landmark },
];

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
  const counts = useSidebarCounts();
  const badgeCounts: Record<string, number> = {
    "/admin/grading": counts?.toGrade ?? 0,
  };

  async function logout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <AdminSchoolHeader school={school} schools={schools} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isCurrent(pathname, item.href)}
                    aria-current={
                      isCurrent(pathname, item.href) ? "page" : undefined
                    }
                    tooltip={item.title}
                  >
                    <GuardedLink href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                      {(badgeCounts[item.href] ?? 0) > 0 && (
                        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-md bg-warning/15 px-1 text-xs font-medium text-warning-foreground tabular-nums group-data-[collapsible=icon]:hidden dark:bg-warning/20 dark:text-warning">
                          {badgeCounts[item.href]}
                          <span className="sr-only"> waiting</span>
                        </span>
                      )}
                    </GuardedLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
                      tooltip={item.title}
                    >
                      <GuardedLink href={item.href}>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-xs text-muted-foreground"
              tooltip={email}
            >
              <span className="truncate">{email}</span>
            </SidebarMenuButton>
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
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
