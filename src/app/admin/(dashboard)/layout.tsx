import { Separator } from "src/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { getAuthService } from "src/lib/auth-singleton";
import { getPageGuard } from "src/lib/services-singleton";
import { AdminSidebar } from "./admin-sidebar";

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

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AdminSidebar email={adminSession.email} isOwner={isOwner} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" />
            {breadcrumb}
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
