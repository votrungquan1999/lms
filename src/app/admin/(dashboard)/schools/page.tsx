import Link from "next/link";
import { Card, CardDescription, CardTitle } from "src/components/ui/card";
import { getPageGuard, getSchoolService } from "src/lib/services-singleton";
import { CreateSchoolForm } from "./create-school-form";

export const metadata = {
  title: "Schools — LMS Admin",
  description: "Create schools and see every school on the platform",
};

/**
 * Schools console — the platform owner's view of every school on the
 * platform, plus the form to create a new one. Gated by its own Tier-2
 * guard, not just the layout's Tier-1 admin guard.
 */
export default async function SchoolsPage() {
  const guard = await getPageGuard();
  await guard.requireRoleManagerLogin();

  const schoolService = await getSchoolService();
  const schools = await schoolService.listSchools();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Schools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every school on the platform.
        </p>
      </header>

      <CreateSchoolForm />

      <div className="flex flex-col gap-3">
        {schools.map((school) => (
          <Link key={school.id} href={`/admin/schools/${school.id}`}>
            <Card data-testid={`school-row-${school.id}`}>
              <CardTitle className="px-6 text-base">{school.name}</CardTitle>
              <CardDescription className="px-6 pb-6">
                {school.slug}
              </CardDescription>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
