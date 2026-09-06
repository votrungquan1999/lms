import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { getPageGuard, getUserRoleService } from "src/lib/services-singleton";
import { Role } from "src/lib/session";
import { RoleActionButtons } from "./role-action-buttons";
import type { UserRoleRow } from "./user-roles-page.type";

export const metadata = {
  title: "User Roles — LMS Admin",
  description: "See who can sign in and manage administrator access",
};

/**
 * Role management — an owner's view of everyone who can sign in and what
 * access each of them currently has (D22). Gated by its own Tier-2 guard,
 * not just the layout's Tier-1 admin guard (D24).
 */
export default async function UserRolesPage() {
  const guard = await getPageGuard();
  await guard.requireRoleManagerLogin();

  const userRoleService = await getUserRoleService();
  const { users, totalCount, limit } = await userRoleService.listUsers();

  const rows: UserRoleRow[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">User Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who can sign in, and their current access.
        </p>
        {totalCount > limit && (
          <p className="mt-1 text-sm text-muted-foreground">
            Showing first {limit} of {totalCount} accounts.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <Card key={row.id} data-testid={`user-role-row-${row.id}`}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{row.name}</CardTitle>
                <CardDescription>{row.email}</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={row.role === Role.Admin ? "default" : "secondary"}
                >
                  {row.role === Role.Admin ? "Admin" : "Student"}
                </Badge>
                {row.role === Role.Student && (
                  <RoleActionButtons userId={row.id} />
                )}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
