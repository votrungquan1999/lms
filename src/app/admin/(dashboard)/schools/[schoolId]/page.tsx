import { notFound } from "next/navigation";
import { Card, CardDescription, CardTitle } from "src/components/ui/card";
import {
  getPageGuard,
  getSchoolService,
  getUserRoleService,
} from "src/lib/services-singleton";
import { AddSchoolAdminForm } from "./add-school-admin-form";
import { SchoolAdminRow } from "./school-admin-row";

/**
 * School detail — the owner's view of one school's admins, plus the form
 * to add another. Gated by the same Tier-2 guard as the console.
 */
export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const guard = await getPageGuard();
  await guard.requireRoleManagerLogin();

  const schoolService = await getSchoolService();
  const school = await schoolService.getSchool(schoolId);
  if (!school) {
    notFound();
  }

  const userRoleService = await getUserRoleService();
  const memberIds = await schoolService.listMembershipsForSchool(schoolId);
  const memberIdSet = new Set(memberIds);
  // Roster comes from the memberships themselves, not the capped picker
  // list below — an admin outside the first 100 accounts must still show.
  const [admins, { users, totalCount, limit }] = await Promise.all([
    userRoleService.findUsersByIds(memberIds),
    userRoleService.listUsers(),
  ]);
  const candidates = users.filter((user) => !memberIdSet.has(user.id));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{school.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{school.slug}</p>
        {totalCount > limit && (
          <p className="mt-1 text-sm text-muted-foreground">
            Showing first {limit} of {totalCount} accounts.
          </p>
        )}
      </header>

      <AddSchoolAdminForm schoolId={school.id} candidates={candidates} />

      <div className="flex flex-col gap-3">
        {admins.map((admin) => (
          <Card key={admin.id} data-testid={`school-admin-row-${admin.id}`}>
            <SchoolAdminRow schoolId={school.id} userId={admin.id}>
              <div className="min-w-0 wrap-anywhere">
                <CardTitle className="text-base">{admin.name}</CardTitle>
                <CardDescription>{admin.email}</CardDescription>
              </div>
            </SchoolAdminRow>
          </Card>
        ))}
      </div>
    </div>
  );
}
