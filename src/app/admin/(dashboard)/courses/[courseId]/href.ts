/**
 * Builds the public join-link path for a course invite token. `/join/*` is
 * outside `proxy.ts`'s matcher and needs no auth.
 * @param inviteToken - The course's invite token.
 */
export function buildJoinInviteHref(inviteToken: string): string {
  return `/join/${encodeURIComponent(inviteToken)}`;
}

/**
 * Builds the admin course detail page path, used by empty-state links that
 * send the admin back to enroll students, add tests or view the roster.
 * @param courseId - The course to link back to.
 */
export function buildCourseDetailHref(courseId: string): string {
  return `/admin/courses/${courseId}`;
}
