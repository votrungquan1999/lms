/**
 * Builds the public join-link path for a course invite token. `/join/*` is
 * outside `proxy.ts`'s matcher and needs no auth.
 * @param inviteToken - The course's invite token.
 */
export function buildJoinInviteHref(inviteToken: string): string {
  return `/join/${encodeURIComponent(inviteToken)}`;
}
