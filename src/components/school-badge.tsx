import { Landmark } from "lucide-react";
import type { UserSchool } from "src/lib/school-service";

/**
 * Top-bar chip naming the school the session is acting on. Renders nothing
 * for a school-less session so owner pages never show an empty pill.
 */
export function SchoolBadge({ school }: { school: UserSchool | null }) {
  if (!school) return null;
  return (
    <div
      data-testid="school-badge"
      title={school.name}
      className="flex min-w-0 max-w-[40%] shrink items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary sm:max-w-xs"
    >
      <Landmark className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{school.name}</span>
    </div>
  );
}
