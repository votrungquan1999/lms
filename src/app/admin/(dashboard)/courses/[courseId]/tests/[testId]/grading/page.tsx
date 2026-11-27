import { notFound } from "next/navigation";
import { GradingSort } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { GradingPageShell } from "src/app/admin/(dashboard)/grading/page-body/grading-page-shell";
import { GradingReleaseActions } from "src/app/admin/(dashboard)/grading/page-body/grading-release-actions";
import { GradingMode } from "src/lib/grading-mode";
import { getPageGuard, getTestService } from "src/lib/services-singleton";

export const metadata = {
  title: "Grade Test — LMS Admin",
  description: "Grade student submissions",
};

export default async function GradingPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; testId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId, testId } = await params;
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
  if (!test || test.courseId !== courseId) {
    notFound();
  }

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
          basePath: `/admin/courses/${courseId}/tests/${testId}/grading`,
          selection: { mode, studentId, questionId, sort, needsOnly },
          barActions: <GradingReleaseActions test={test} courseId={courseId} />,
        })
      }
    </div>
  );
}
