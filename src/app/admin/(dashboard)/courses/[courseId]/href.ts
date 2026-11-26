/**
 * Builds the public join-link path for a course invite token. `/join/*` is
 * outside `proxy.ts`'s matcher and needs no auth.
 * @param inviteToken - The course's invite token.
 */
export function buildJoinInviteHref(inviteToken: string): string {
  return `/join/${encodeURIComponent(inviteToken)}`;
}

/**
 * Builds the admin course detail page path, which opens on the Tests tab.
 * @param courseId - The course to link back to.
 */
export function buildCourseDetailHref(courseId: string): string {
  return `/admin/courses/${courseId}`;
}

/**
 * Builds the course's Students tab path, where the roster lives and students
 * are added.
 * @param courseId - The course whose students to open.
 */
export function buildCourseStudentsHref(courseId: string): string {
  return `/admin/courses/${courseId}/students`;
}
