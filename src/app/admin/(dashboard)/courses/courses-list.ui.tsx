import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card } from "src/components/ui/card";
import { pluralize } from "src/lib/pluralize";

const columns =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 md:grid-cols-[minmax(0,1fr)_5rem_5rem_9rem_5rem]";

/** The page column. */
export function CoursesColumn({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>;
}

/** The heading and summary on the left, the New course control on the right. */
export function CoursesHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      {children}
    </header>
  );
}

/** The table card: a header row, then one row per course. */
export function CoursesTable({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div
        aria-hidden="true"
        className={`${columns} hidden border-b bg-muted/40 py-2 text-xs font-medium text-muted-foreground md:grid`}
      >
        <span>Course</span>
        <span>Students</span>
        <span>Tests</span>
        <span>Grading</span>
        <span />
      </div>
      {children}
    </Card>
  );
}

function WaitingBadge({ waiting }: { waiting: number }) {
  return (
    <Badge variant={waiting > 0 ? "warning" : "secondary"}>
      {waiting > 0 ? `${waiting} waiting` : "Nothing waiting"}
    </Badge>
  );
}

/**
 * One course row. The title link is stretched over the row, and the action
 * is its own link above it, so the two never nest.
 */
export function CourseRowView({
  href,
  title,
  meta,
  students,
  tests,
  waiting,
}: {
  href: string;
  title: string;
  meta: string;
  students: number;
  tests: number;
  waiting: number;
}) {
  return (
    <div
      data-testid="course-row"
      className={`${columns} relative min-h-16 border-b py-3 last:border-b-0 hover:bg-accent/40`}
    >
      <div className="min-w-0">
        <Link
          href={href}
          className="font-semibold [overflow-wrap:anywhere] after:absolute after:inset-0"
        >
          {title}
        </Link>
        <p className="truncate text-[13px] text-muted-foreground" title={meta}>
          {meta}
        </p>
        <p className="text-xs text-muted-foreground md:hidden">
          {students} {pluralize(students, "student")} · {tests}{" "}
          {pluralize(tests, "test")}
        </p>
        <span className="mt-1 inline-block md:hidden">
          <WaitingBadge waiting={waiting} />
        </span>
      </div>
      <span data-testid="course-students" className="hidden text-sm md:block">
        {students}
      </span>
      <span data-testid="course-tests" className="hidden text-sm md:block">
        {tests}
      </span>
      <span className="hidden md:block">
        <WaitingBadge waiting={waiting} />
      </span>
      <Button
        asChild
        variant={waiting > 0 ? "default" : "outline"}
        size="sm"
        className="relative z-10 justify-self-end"
      >
        <Link href={href}>{waiting > 0 ? "Grade" : "Open"}</Link>
      </Button>
    </div>
  );
}

const offers = [
  {
    title: "Add tests",
    body: (
      <>
        Write questions, import them with AI, or take them from the{" "}
        <Link href="/admin/pools" className="underline">
          question bank
        </Link>
        .
      </>
    ),
  },
  {
    title: "Bring in students",
    body: (
      <>
        Share the course invite link, or enroll accounts you made in{" "}
        <Link href="/admin/students" className="underline">
          Students
        </Link>
        .
      </>
    ),
  },
  {
    title: "Share materials",
    body: "Upload files for the class to read alongside its tests.",
  },
];

/**
 * What a school with no courses sees: one clear next step, then what a course offers.
 * @param children - The control that creates the first course.
 */
export function FirstRunPage({ children }: { children: ReactNode }) {
  return (
    <>
      <Card className="items-center gap-0 px-8 py-14 text-center">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"
        >
          <BookOpen className="size-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">No courses yet</h2>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          A course holds one class: its tests, its students and its materials.
          Create your first course to get started.
        </p>
        <div className="mt-5">{children}</div>
      </Card>
      <section className="grid gap-2.5">
        <h2 className="text-lg font-semibold">Inside a course you can</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {offers.map((offer) => (
            <Card key={offer.title} className="gap-1.5 px-5 py-4">
              <p className="font-semibold">{offer.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {offer.body}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
