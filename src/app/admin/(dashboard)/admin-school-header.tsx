"use client";

import { BookOpen, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "src/components/ui/sidebar";
import type { UserSchool } from "src/lib/school-service";
import { GuardedLink } from "./guarded-link";
import { useLeaveGuard } from "./leave-guard.state";
import { switchSchoolAction } from "./switch-school-actions";

/** In the rail the header is a 40 px tile, with room for the switcher's corner chevron. */
const tileClass =
  "relative group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center";

/** Logo tile, "LMS Admin" and the school name, shared by the link and the switcher forms of the header. */
function HeaderLabel({ schoolName }: { schoolName?: string }) {
  return (
    <>
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BookOpen className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
        <span className="font-semibold">LMS Admin</span>
        {schoolName && (
          <span
            className="truncate text-xs text-muted-foreground"
            title={schoolName}
          >
            {schoolName}
          </span>
        )}
      </div>
    </>
  );
}

/** Top of the sidebar: the app and school name, which opens the school list when the teacher has 2+ schools. */
export function AdminSchoolHeader({
  school,
  schools,
}: {
  school: UserSchool | null;
  schools: UserSchool[];
}) {
  const { requestLeave } = useLeaveGuard();
  const { setOpenMobile } = useSidebar();
  const [, startTransition] = useTransition();

  if (!school || schools.length < 2) {
    return (
      <SidebarMenuButton
        size="lg"
        asChild
        aria-label={school ? `LMS Admin, ${school.name}` : "LMS Admin"}
        className={tileClass}
        tooltip={school?.name ?? "LMS Admin"}
      >
        <GuardedLink href="/admin/grading" onClick={() => setOpenMobile(false)}>
          <HeaderLabel schoolName={school?.name} />
        </GuardedLink>
      </SidebarMenuButton>
    );
  }

  // Built here, not in a <form>: the menu unmounts on select, which would
  // detach a form before the leave dialog's answer arrives.
  function switchTo(schoolId: string) {
    if (schoolId === school?.id) return;
    const formData = new FormData();
    formData.set("schoolId", schoolId);
    requestLeave(() => {
      // The switch lands on the page already open, so nothing else would close the phone sheet
      setOpenMobile(false);
      startTransition(() => switchSchoolAction(formData));
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          aria-label={`School: ${school.name}. Switch school`}
          className={tileClass}
          data-testid="school-switcher-trigger"
          tooltip={school.name}
        >
          <HeaderLabel schoolName={school.name} />
          <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          <span
            aria-hidden="true"
            className="absolute right-0 bottom-0 hidden size-4 place-items-center rounded-full border bg-background group-data-[collapsible=icon]:grid"
          >
            <ChevronDown className="size-2.5" />
          </span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Your schools</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={school.id} onValueChange={switchTo}>
          {schools.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id}>
              {item.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
