import Link from "next/link";
import { buildCourseDetailHref } from "src/app/admin/(dashboard)/courses/[courseId]/href";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "src/components/ui/breadcrumb";
import { getCourseService, getPageGuard } from "src/lib/services-singleton";

export default async function ResultsReportBreadcrumb({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);

  return (
    <Breadcrumb>
      {/* Left to wrap: a long course title grows the bar rather than
          squeezing "Export Results" into "…". */}
      <BreadcrumbList>
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink asChild>
            <Link href="/admin/courses">Courses</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="shrink-0" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbLink asChild className="block min-w-0 wrap-anywhere">
            <Link href={buildCourseDetailHref(courseId)}>
              {course?.title ?? "Course"}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="shrink-0" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block truncate" title="Export Results">
            Export Results
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
