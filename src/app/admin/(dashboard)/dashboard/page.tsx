import { BookOpen, ClipboardCheck, HelpCircle, Users } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "src/components/ui/tooltip";
import {
  getCourseService,
  getEnrollmentService,
  getQuestionService,
  getStudentService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { GradingTooltipTrigger } from "./grading-tooltip-trigger";

export const metadata = {
  title: "Admin Dashboard — LMS",
  description: "Manage student accounts and course content",
};

export default async function AdminDashboardPage() {
  const studentService = await getStudentService();
  const courseService = await getCourseService();
  const testService = await getTestService();
  const enrollmentService = await getEnrollmentService();
  const questionService = await getQuestionService();
  const testStatusService = await getTestStatusService();

  const [students, courses, allTests] = await Promise.all([
    studentService.listStudents(),
    courseService.listCourses(),
    testService.listAllTests(),
  ]);

  // Memoize per-course enrollments to avoid N+M repeated calls.
  const enrollmentsByCourse = new Map<string, string[]>();
  let testsNeedingGrading = 0;
  let studentsWaiting = 0;
  for (const t of allTests) {
    let studentIds = enrollmentsByCourse.get(t.courseId);
    if (!studentIds) {
      studentIds = await enrollmentService.listEnrollmentsByCourse(t.courseId);
      enrollmentsByCourse.set(t.courseId, studentIds);
    }
    const questions = await questionService.listQuestions(t.id);
    const counts = await testStatusService.getStatusCounts(
      t.id,
      studentIds,
      questions.length,
    );
    const submitted = counts[TestStatus.Submitted];
    if (submitted > 0) {
      testsNeedingGrading += 1;
      studentsWaiting += submitted;
    }
  }

  const summaryCards = [
    {
      title: "Students",
      count: students.length,
      description: "Registered accounts",
      href: "/admin/students",
      icon: Users,
    },
    {
      title: "Courses",
      count: courses.length,
      description: "Active courses",
      href: "/admin/courses",
      icon: BookOpen,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your learning management system.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <card.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.count}</div>
                <CardDescription>{card.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}

        <Link href="/admin/grading" aria-label="Grading">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Grading</CardTitle>
              <ClipboardCheck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div
                    data-stat="tests-needing-grading"
                    className="text-2xl font-bold"
                  >
                    {testsNeedingGrading}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    Tests needing grading
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <GradingTooltipTrigger>
                          <HelpCircle className="size-3 text-muted-foreground" />
                        </GradingTooltipTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        Tests with at least one student waiting for a grade
                      </TooltipContent>
                    </Tooltip>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div
                    data-stat="students-waiting"
                    className="text-2xl font-bold"
                  >
                    {studentsWaiting}
                  </div>
                  <CardDescription className="flex items-center justify-end gap-1">
                    Students waiting
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <GradingTooltipTrigger>
                          <HelpCircle className="size-3 text-muted-foreground" />
                        </GradingTooltipTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        Total submissions awaiting grading
                      </TooltipContent>
                    </Tooltip>
                  </CardDescription>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
