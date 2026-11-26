import { cache } from "react";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import { getCourseJoinRequestService } from "src/lib/services-singleton";

export interface SchoolSidebarCounts {
  toGrade: number;
  joinRequests: number;
}

/**
 * The numbers behind the sidebar badges, computed once per server render.
 * Keyed by school id alone so repeat calls in one render hit the cache.
 * @param schoolId - The verified session's school.
 * @returns Submissions waiting for a grade and join requests the admin can act on.
 */
export const getSchoolSidebarCounts = cache(
  async (schoolId: string): Promise<SchoolSidebarCounts> => {
    const joinRequestService = await getCourseJoinRequestService(schoolId);
    const [gradingCounts, joinRequests] = await Promise.all([
      getSchoolGradingCounts(schoolId),
      joinRequestService.countVisiblePending(),
    ]);
    return { toGrade: gradingCounts.waiting, joinRequests };
  },
);
