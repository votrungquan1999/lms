import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { getAuthService } from "src/lib/auth-singleton";
import { getPageGuard, getSchoolService } from "src/lib/services-singleton";
import { AdminSidebar } from "./admin-sidebar";
import { LeaveGuardProvider } from "./leave-guard.state";

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

  return (
    <LeaveGuardProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar
            email={adminSession.email}
            isOwner={isOwner}
            school={adminSession.school}
            schools={schools}
          />
          <SidebarInset>
            <header className="flex min-h-12 shrink-0 items-center gap-2 border-b px-4 py-2">
              <SidebarTrigger className="-ml-1" />
            </header>
            <div className="min-w-0 px-6 pt-4 empty:hidden">{breadcrumb}</div>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </LeaveGuardProvider>
  );
}
