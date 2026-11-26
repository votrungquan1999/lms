import { notFound } from "next/navigation";
import { Separator } from "src/components/ui/separator";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getStudentService,
} from "src/lib/services-singleton";
import { ManageEnrollmentsDialog } from "../../enroll-student-form";
import { ShareInviteLink } from "../../share-invite-link";

export const metadata = {
  title: "Course students — LMS Admin",
  description: "Manage course enrollments",
};

export default async function CourseStudentsPage({
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

  const studentService = await getStudentService(session.school.id);
  const students = await studentService.listStudents();

  const enrollmentService = await getEnrollmentService(session.school.id);
  const enrolledStudentIds =
    await enrollmentService.listEnrollmentsByCourse(courseId);

  return (
    <section className="w-full max-w-5xl space-y-6">
      <ShareInviteLink courseId={courseId} inviteToken={course.inviteToken} />

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Enrolled Students ({enrolledStudentIds.length})
          </h2>
          <ManageEnrollmentsDialog
            courseId={courseId}
            students={students}
            enrolledStudentIds={enrolledStudentIds}
          />
        </div>
        {enrolledStudentIds.length > 0 ? (
          <div className="space-y-2">
            {students
              .filter((s) => enrolledStudentIds.includes(s.id))
              .map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 wrap-anywhere">
                    <p className="text-sm font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      @{student.username}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No students enrolled yet.
          </p>
        )}
      </div>
    </section>
  );
}
