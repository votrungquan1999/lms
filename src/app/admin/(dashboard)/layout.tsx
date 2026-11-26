import { SidebarInset } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { getAuthService } from "src/lib/auth-singleton";
import {
  getSchoolSidebarCounts,
  type SchoolSidebarCounts,
} from "src/lib/school-sidebar-counts";
import { getPageGuard, getSchoolService } from "src/lib/services-singleton";
import { AdminMobileBar } from "./admin-mobile-bar";
import { AdminSidebar } from "./admin-sidebar";
import { AdminSidebarProvider } from "./admin-sidebar-provider";
import { LeaveGuardProvider } from "./leave-guard.state";
import { SidebarCountsProvider } from "./sidebar-counts.state";

export default async function AdminDashboardLayout({
  children,
  breadcrumb,
}: Readonly<{
  children: React.ReactNode;
  breadcrumb: React.ReactNode;
}>) {
  const guard = await getPageGuard();
  const adminSession = await guard.requireAdminLogin();

  // Owner-only sidebar entry (D27) — cosmetic; the page's own guard is the
  // real boundary, so a Tier-1 admin who isn't an owner sees no link rather
  // than a link that always refuses them.
  const authService = await getAuthService();
  const isOwner = await authService.isAdminEmail(adminSession.email);

  // Shares the session lookup's per-render read, so no second query. A
  // school-less admin (owner console, no-school page) still gets a working
  // layout, just with no school in the sidebar.
  const schoolService = await getSchoolService();
  const schools = await schoolService.listSchoolsForRequest(
    adminSession.userId,
  );

  // Badges are decoration: a failed count costs the badges, never the page
  let sidebarCounts: SchoolSidebarCounts | null = null;
  // A school-less admin has no school to count for, so the sidebar gets no badges
  if (adminSession.school) {
    try {
      sidebarCounts = await getSchoolSidebarCounts(adminSession.school.id);
    } catch (error) {
      console.error("sidebar badge counts failed:", error);
    }
  }

  return (
    <LeaveGuardProvider>
      <TooltipProvider>
        <AdminSidebarProvider>
          <SidebarCountsProvider
            counts={sidebarCounts}
            hasSchool={adminSession.school !== null}
          >
            <AdminSidebar
              email={adminSession.email}
              isOwner={isOwner}
              school={adminSession.school}
              schools={schools}
            />
          </SidebarCountsProvider>
          <SidebarInset>
            <AdminMobileBar />
            <div className="min-w-0 px-6 pt-4 empty:hidden">{breadcrumb}</div>
            {children}
          </SidebarInset>
        </AdminSidebarProvider>
      </TooltipProvider>
    </LeaveGuardProvider>
  );
}
