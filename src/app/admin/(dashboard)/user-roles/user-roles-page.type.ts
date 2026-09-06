import type { Role } from "src/lib/session";

/** One row in the role-management list: a person and their current access. */
export interface UserRoleRow {
  id: string;
  email: string;
  name: string;
  role: Role;
}
