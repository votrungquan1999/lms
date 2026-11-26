import { cache } from "react";
import type { SchoolGradingCounts } from "src/lib/grading-count-service";
import { getGradingCountService } from "src/lib/services-singleton";

/**
 * The school's grading counts, computed once per server render so the layout
 * badge and the To grade page share one run. Keyed by school id alone: the
 * clock is read inside the count, never passed in, or no call would hit the cache.
 * @param schoolId - The verified session's school.
 * @returns The school's grading counts.
 */
export const getSchoolGradingCounts = cache(
  async (schoolId: string): Promise<SchoolGradingCounts> => {
    const countService = await getGradingCountService(schoolId);
    return countService.getCounts();
  },
);
