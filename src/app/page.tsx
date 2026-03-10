import Link from "next/link";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            Learning Management System
          </h1>
          <p className="text-lg text-muted-foreground">
            Take tests, download lesson files, and track your learning progress.
          </p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Student</CardTitle>
              <CardDescription>
                Sign in with your credentials to access courses, take tests, and
                download lesson materials.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" disabled>
                <span>Student Login (Coming Soon)</span>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Administrator</CardTitle>
              <CardDescription>
                Manage student accounts, courses, and content.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/admin/login">Admin Login</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
