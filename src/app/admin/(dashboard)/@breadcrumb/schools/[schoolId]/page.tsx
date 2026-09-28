import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "src/components/ui/breadcrumb";
import { getPageGuard, getSchoolService } from "src/lib/services-singleton";

/**
 * Breadcrumb for a school detail page — links back to the schools console
 * and shows the school's name. Guards itself: a slot renders beside the
 * page, so the page's own forbidden() would not hide the name.
 */
export default async function SchoolDetailBreadcrumb({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const guard = await getPageGuard();
  await guard.requireRoleManagerLogin();

  const schoolService = await getSchoolService();
  const school = await schoolService.getSchool(schoolId);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/admin/schools">Schools</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{school?.name ?? "School"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
