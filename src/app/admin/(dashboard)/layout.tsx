import { Separator } from "src/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
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

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AdminSidebar email={adminSession.email} />
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
