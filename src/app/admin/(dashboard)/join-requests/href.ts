import { JoinRequestFilter } from "./join-request-page.type";

interface JoinRequestsHrefInput {
  filter?: JoinRequestFilter;
  page?: number;
}

/**
 * Builds a join-requests queue URL, omitting a param when it's the default
 * (Waiting tab, page 1) — per server-components-rules.md rule 3. Page state
 * lives entirely in the URL so a link to any page is shareable (D56).
 */
export function joinRequestsHref(input: JoinRequestsHrefInput = {}): string {
  const basePath = "/admin/join-requests";
  const filter = input.filter ?? JoinRequestFilter.Waiting;
  const page = input.page ?? 1;

  const params = new URLSearchParams();
  if (filter !== JoinRequestFilter.Waiting) {
    params.set("filter", filter);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const qs = params.toString();
  return qs.length > 0 ? `${basePath}?${qs}` : basePath;
}
