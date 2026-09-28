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

export default async function TestDetailBreadcrumb({
  params,
}: {
  params: Promise<{ courseId: string; testId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId, testId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  const currentPageText = test?.title ?? "Test";

  return (
    <Breadcrumb>
      {/* Left to wrap: a long course title grows the bar rather than
          squeezing a short current segment into "…". */}
      <BreadcrumbList>
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink asChild>
            <Link href="/admin/courses">Courses</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="shrink-0" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbLink asChild className="block min-w-0 wrap-anywhere">
            <Link href={`/admin/courses/${courseId}`}>
              {course?.title ?? "Course"}
            </Link>
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
