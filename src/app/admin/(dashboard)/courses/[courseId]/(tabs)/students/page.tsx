import Link from "next/link";
import { notFound } from "next/navigation";
import { Separator } from "src/components/ui/separator";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import { formatVietnamDate } from "src/lib/format-date";
import {
  getCourseJoinRequestService,
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getStudentService,
} from "src/lib/services-singleton";
import { ManageEnrollmentsDialog } from "../../enroll-student-form";
import { ShareInviteLink } from "../../share-invite-link";
import { JoinRequestsCard } from "../join-requests-card";
import {
  type StudentRowData,
  StudentsListProvider,
} from "../students-list.state";
import { StudentsList } from "../students-list.ui";

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
  const enrollments =
    await enrollmentService.listEnrollmentsWithDates(courseId);
  const enrolledStudentIds = enrollments.map((e) => e.studentId);

  const joinRequestService = await getCourseJoinRequestService(
    session.school.id,
  );
  const pendingRequests = await joinRequestService.listVisibleByStatus(
    JoinRequestStatus.Pending,
    { courseId },
  );

  // Sorted by name with the id as tie-break so equal names never reorder between loads.
  const joinedById = new Map(
    enrollments.map((e) => [e.studentId, e.enrolledAt]),
  );
  const rows: StudentRowData[] = students
    .filter((s) => joinedById.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      username: s.username,
      joined: formatVietnamDate(joinedById.get(s.id) as Date),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  return (
    <div className="w-full max-w-5xl space-y-6">
      <JoinRequestsCard requests={pendingRequests} now={new Date()} />

      <ShareInviteLink courseId={courseId} inviteToken={course.inviteToken} />

      <Separator />

      <section aria-label="Students" className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="whitespace-nowrap text-[17px] font-semibold">
            Students{" "}
            <span className="font-medium text-muted-foreground">
              ({rows.length})
            </span>
          </h2>
          <span className="text-[13px] text-muted-foreground">
            New students go on the{" "}
            <Link href="/admin/students" className="text-primary underline">
              Students page
            </Link>{" "}
            first
          </span>
          <div className="md:ml-auto">
            <ManageEnrollmentsDialog
              courseId={courseId}
              students={students}
              enrolledStudentIds={enrolledStudentIds}
            />
          </div>
        </div>
        <StudentsListProvider rows={rows}>
          <StudentsList courseId={courseId} />
        </StudentsListProvider>
        <p className="text-[13px] text-muted-foreground">
          Removing a student takes them out of this course only; their account
          stays on the Students page.
        </p>
      </section>
    </div>
  );
}
