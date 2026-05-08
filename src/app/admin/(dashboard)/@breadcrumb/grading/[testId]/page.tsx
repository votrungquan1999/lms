import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "src/components/ui/breadcrumb";
import { getCourseService, getTestService } from "src/lib/services-singleton";

export default async function GradingTestBreadcrumb({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;

  const testService = await getTestService();
  const test = await testService.getTest(testId);

  const courseService = await getCourseService();
  const course = test ? await courseService.getCourse(test.courseId) : null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/admin/grading">Grading</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>
            {test?.title ?? "Test"}
            {course?.title ? ` (${course.title})` : ""}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
