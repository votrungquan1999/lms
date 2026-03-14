import { Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  getEnrollmentService,
  getStudentService,
} from "src/lib/services-singleton";
import { CreateStudentDialog } from "./create-student-dialog";

export const metadata = {
  title: "Students — LMS Admin",
  description: "Manage student accounts",
};

export default async function StudentsPage() {
  const studentService = await getStudentService();
  const enrollmentService = await getEnrollmentService();

  const students = await studentService.listStudents();

  // Get enrolled course count per student
  const studentsWithCourses = await Promise.all(
    students.map(async (student) => {
      const enrollments = await enrollmentService.listEnrollmentsByStudent(
        student.id,
      );
      return {
        ...student,
        courseCount: enrollments.length,
      };
    }),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length} student{students.length !== 1 ? "s" : ""}{" "}
            registered
          </p>
        </div>
        <CreateStudentDialog />
      </header>

      {studentsWithCourses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {studentsWithCourses.map((student) => (
            <Card key={student.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{student.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  @{student.username}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  <span>
                    {student.courseCount} course
                    {student.courseCount !== 1 ? "s" : ""} enrolled
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Users className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No students yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first student account to get started.
            </p>
          </div>
          <CreateStudentDialog />
        </div>
      )}
    </div>
  );
}
