"use client";

import { usePathname } from "next/navigation";
import { GuardedLink } from "../../../guarded-link";

interface CourseTab {
  label: string;
  /** Path under the course, "" for the Tests tab. */
  path: string;
}

const TABS: CourseTab[] = [
  { label: "Tests", path: "" },
  { label: "Students", path: "/students" },
  { label: "Materials", path: "/materials" },
];

/**
 * The course's tab strip. Each tab is its own URL; the current one comes from
 * the pathname because a server layout cannot see which tab page it wraps.
 * @param courseId - The course whose tabs these are.
 */
export function CourseTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const base = `/admin/courses/${courseId}`;

  return (
    <nav aria-label="Course sections" className="flex gap-6 border-b">
      {TABS.map((tab) => {
        const href = `${base}${tab.path}`;
        const current = pathname === href;
        return (
          <GuardedLink
            key={tab.label}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`-mb-px border-b-2 px-0.5 py-2.5 text-sm ${
              current
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </GuardedLink>
        );
      })}
    </nav>
  );
}
