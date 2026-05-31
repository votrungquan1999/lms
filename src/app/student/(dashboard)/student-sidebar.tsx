"use client";

import { BookOpen, GraduationCap, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
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

export interface StudentSidebarCourse {
  id: string;
  title: string;
}

/**
 * Student navigation sidebar. Mirrors the admin shell: branding header, a
 * primary "Navigation" group, a "My Courses" group listing enrolled courses for
 * quick access, and a footer with the signed-in username and Sign Out control.
 * @param username - The signed-in student's display name.
 * @param courses - The student's enrolled courses for the quick-nav group.
 */
export function StudentSidebar({
  username,
  courses,
}: {
  username: string;
  courses: StudentSidebarCourse[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Signs the student out and returns them to the public landing page.
   */
  async function handleLogout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/student/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCap className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">LMS</span>
                  <span className="text-xs text-muted-foreground">Student</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/student/dashboard"}
                  tooltip="Dashboard"
                >
                  <Link href="/student/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>My Courses</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {courses.map((course) => (
                <SidebarMenuItem key={course.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(
                      `/student/courses/${course.id}`,
                    )}
                    tooltip={course.title}
                  >
                    <Link href={`/student/courses/${course.id}`}>
                      <BookOpen />
                      <span className="truncate">{course.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-xs text-muted-foreground"
              tooltip={`@${username}`}
            >
              <span className="truncate">@{username}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Sign Out">
              <LogOut />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
