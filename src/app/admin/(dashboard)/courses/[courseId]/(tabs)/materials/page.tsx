import { notFound } from "next/navigation";
import { attachCourseMaterialUrls } from "src/lib/course-material-urls";
import { getCourseService, getPageGuard } from "src/lib/services-singleton";
import { MaterialsSection } from "../../materials-section";

export const metadata = {
  title: "Course materials — LMS Admin",
  description: "Manage course materials",
};

// Materials render short-lived presigned download URLs minted per request.
export const dynamic = "force-dynamic";

export default async function CourseMaterialsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);
  if (!course) notFound();

  const materials = await attachCourseMaterialUrls(course.materials);

  return (
    <section className="w-full max-w-5xl">
      <MaterialsSection courseId={courseId} materials={materials} />
    </section>
  );
}
