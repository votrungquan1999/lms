import { BookOpen, Users } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  getCourseService,
  getStudentService,
} from "src/lib/services-singleton";

export const metadata = {
  title: "Admin Dashboard — LMS",
  description: "Manage student accounts and course content",
};

export default async function AdminDashboardPage() {
  const studentService = await getStudentService();
  const courseService = await getCourseService();

  const students = await studentService.listStudents();
  const courses = await courseService.listCourses();

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
      </div>
    </div>
  );
}
