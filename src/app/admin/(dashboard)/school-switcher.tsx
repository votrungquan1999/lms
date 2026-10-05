"use client";

import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { SidebarMenuButton } from "src/components/ui/sidebar";
import type { UserSchool } from "src/lib/school-service";
import { switchSchoolAction } from "./switch-school-actions";

/**
 * Sidebar header control: shows the active school's name and, via the
 * dropdown, every other school the admin belongs to. Each item is its own
 * tiny form posting straight to `switchSchoolAction`, which re-verifies
 * membership server-side before it ever sets the cookie.
 */
export function SchoolSwitcher({
  activeSchoolName,
  otherSchools,
}: {
  activeSchoolName: string;
  otherSchools: UserSchool[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="sm"
          className="text-muted-foreground"
          data-testid="school-switcher-trigger"
          tooltip={activeSchoolName}
        >
          <span className="truncate">{activeSchoolName}</span>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {otherSchools.map((school) => (
          <DropdownMenuItem key={school.id} asChild>
            <form action={switchSchoolAction} className="w-full">
              <input type="hidden" name="schoolId" value={school.id} />
              <button type="submit" className="w-full text-left">
                {school.name}
              </button>
            </form>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
