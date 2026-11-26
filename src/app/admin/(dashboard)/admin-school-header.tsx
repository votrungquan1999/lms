"use client";

import { BookOpen, ChevronsUpDown } from "lucide-react";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { SidebarMenuButton } from "src/components/ui/sidebar";
import type { UserSchool } from "src/lib/school-service";
import { GuardedLink } from "./guarded-link";
import { useLeaveGuard } from "./leave-guard.state";
import { switchSchoolAction } from "./switch-school-actions";

/** Logo tile, "LMS Admin" and the school name, shared by the link and the switcher forms of the header. */
function HeaderLabel({ schoolName }: { schoolName?: string }) {
  return (
    <>
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BookOpen className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 leading-none">
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
  const [, startTransition] = useTransition();

  if (!school || schools.length < 2) {
    return (
      <SidebarMenuButton size="lg" asChild>
        <GuardedLink href="/admin/grading">
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
    requestLeave(() => startTransition(() => switchSchoolAction(formData)));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          data-testid="school-switcher-trigger"
          tooltip={school.name}
        >
          <HeaderLabel schoolName={school.name} />
          <ChevronsUpDown className="ml-auto size-4" />
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
