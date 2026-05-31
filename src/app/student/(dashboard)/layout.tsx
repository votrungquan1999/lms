import { Separator } from "src/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
} from "src/lib/services-singleton";
import { StudentSidebar } from "./student-sidebar";

/**
 * Shell layout for all student dashboard pages. Wraps content in the collapsible
 * sidebar (branding, navigation, enrolled-course quick links, sign out) plus a
 * slim top bar with the sidebar trigger.
 */
export default async function StudentDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();

  const enrollmentService = await getEnrollmentService();
  const enrollments = await enrollmentService.listEnrollmentsByStudent(
    session.studentId,
  );

  const courseService = await getCourseService();
  const enrolledCourses = await courseService.getCoursesByIds(
    enrollments.map((e) => e.courseId),
  );
  const sidebarCourses = enrolledCourses.map((course) => ({
    id: course.id,
    title: course.title,
  }));

  return (
    <TooltipProvider>
      <SidebarProvider>
        <StudentSidebar username={session.username} courses={sidebarCourses} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" />
            <span className="text-sm font-medium">LMS</span>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
