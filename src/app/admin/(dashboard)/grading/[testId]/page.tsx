import { notFound } from "next/navigation";
import {
  GradingMode,
  GradingSort,
} from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { GradingPageShell } from "src/app/admin/(dashboard)/grading/page-body/grading-page-shell";
import { GradingReleaseActions } from "src/app/admin/(dashboard)/grading/page-body/grading-release-actions";
import { getPageGuard, getTestService } from "src/lib/services-singleton";

export const metadata = {
  title: "Grade Test — LMS Admin",
  description: "Grade student submissions",
};

// Forced dynamic so each render mints fresh presigned media URLs.
export const dynamic = "force-dynamic";

/**
 * Variant grading page reachable from the grading hub. Renders the redesigned
 * roster + detail shell. Forwards selection state (`studentId`, etc.) from
 * the URL into the shell.
 */
export default async function GradingVariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ testId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { testId } = await params;
  const sp = (await searchParams) ?? {};
  const rawStudentId = sp.studentId;
  const studentId = typeof rawStudentId === "string" ? rawStudentId : undefined;
  const rawQuestionId = sp.questionId;
  const questionId =
    typeof rawQuestionId === "string" ? rawQuestionId : undefined;
  const mode =
    sp.mode === GradingMode.Question
      ? GradingMode.Question
      : GradingMode.Student;
  const sort =
    sp.sort === GradingSort.Name
      ? GradingSort.Name
      : sp.sort === GradingSort.Status
        ? GradingSort.Status
        : GradingSort.Enrollment;

  const needsOnly = sp.needsOnly === "1";

  const testService = await getTestService(session.school.id);
  const test = await testService.getTest(testId);
  if (!test) {
    notFound();
  }

  const courseId = test.courseId;

  return (
    <div
      className={
        mode === GradingMode.Student
          ? // Fills the screen below the phone menu bar so only the panes inside scroll.
            "flex h-[calc(100svh-3.5rem)] min-h-0 flex-col gap-4 p-6 md:h-svh"
          : "flex flex-1 flex-col gap-4 p-6"
      }
    >
      <h1 className="sr-only">Grade: {test.title}</h1>
      {
        await GradingPageShell({
          test,
          courseId,
          schoolId: session.school.id,
          basePath: `/admin/grading/${testId}`,
          selection: { mode, studentId, questionId, sort, needsOnly },
          barActions: <GradingReleaseActions test={test} courseId={courseId} />,
        })
      }
    </div>
  );
}
