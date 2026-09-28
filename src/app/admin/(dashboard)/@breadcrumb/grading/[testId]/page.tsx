import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "src/components/ui/breadcrumb";
import {
  getCourseService,
  getPageGuard,
  getTestService,
} from "src/lib/services-singleton";

export default async function GradingTestBreadcrumb({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { testId } = await params;

  const testService = await getTestService(session.school.id);
  const test = await testService.getTest(testId);

  const courseService = await getCourseService(session.school.id);
  const course = test ? await courseService.getCourse(test.courseId) : null;

  const currentPageText = `${test?.title ?? "Test"}${course?.title ? ` (${course.title})` : ""}`;

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink asChild>
            <Link href="/admin/grading">Grading</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="shrink-0" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block truncate" title={currentPageText}>
            {currentPageText}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
