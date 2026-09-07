import { JoinRequestFilter } from "./join-request-page.type";

interface JoinRequestsHrefInput {
  filter?: JoinRequestFilter;
}

/**
 * Builds a join-requests queue URL, omitting the filter param when it's the
 * default (Waiting) — per server-components-rules.md rule 3.
 */
export function joinRequestsHref(input: JoinRequestsHrefInput = {}): string {
  const basePath = "/admin/join-requests";
  const filter = input.filter ?? JoinRequestFilter.Waiting;
  if (filter === JoinRequestFilter.Waiting) {
    return basePath;
  }
  return `${basePath}?filter=${filter}`;
}
