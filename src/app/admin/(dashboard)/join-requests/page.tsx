import {
  type CourseJoinRequest,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import {
  getCourseJoinRequestService,
  getCourseService,
  getStudentService,
} from "src/lib/services-singleton";
import type { JoinRequestRow as JoinRequestRowModel } from "./join-request-page.type";
import { JoinRequestRow } from "./join-request-row";

export const metadata = {
  title: "Join Requests — LMS Admin",
  description: "Requests waiting for admin approval to join a course",
};

/**
 * Joins raw join requests with the student and course each one names.
 * D55: a request whose student or course no longer resolves is dropped, not
 * rendered as a placeholder — every returned row stays actionable. R9: the
 * `studentId` on the request is already the domain student id enrollment
 * uses, so the name shown here is provably the person approval would enroll.
 */
async function toVisibleRows(
  requests: CourseJoinRequest[],
): Promise<JoinRequestRowModel[]> {
  const studentIds = [...new Set(requests.map((r) => r.studentId))];
  const courseIds = [...new Set(requests.map((r) => r.courseId))];

  const studentService = await getStudentService();
  const courseService = await getCourseService();
  const [students, courses] = await Promise.all([
    studentService.findByIds(studentIds),
    courseService.getCoursesByIds(courseIds),
  ]);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const rows: JoinRequestRowModel[] = [];
  for (const request of requests) {
    const student = studentById.get(request.studentId);
    const course = courseById.get(request.courseId);
    if (!student || !course) continue;
    rows.push({
      id: request.id,
      studentName: student.name,
      studentUsername: student.username,
      courseTitle: course.title,
      requestedAt: request.requestedAt,
    });
  }
  return rows;
}

/**
 * Admin join-request queue — lists every waiting request with who is asking
 * and which course they want (Step 27).
 */
export default async function JoinRequestsPage() {
  const joinRequestService = await getCourseJoinRequestService();
  const requests = await joinRequestService.listByStatus(
    JoinRequestStatus.Pending,
  );
  const rows = await toVisibleRows(requests);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Join Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Requests waiting for approval.
        </p>
      </header>

      <section className="space-y-3">
        {rows.length === 0 && (
          <p className="text-center text-muted-foreground">All caught up.</p>
        )}
        {rows.map((row) => (
          <JoinRequestRow key={row.id} row={row} />
        ))}
      </section>
    </div>
  );
}
