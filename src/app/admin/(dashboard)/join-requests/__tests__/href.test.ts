import { describe, expect, it } from "vitest";
import { joinRequestsHref } from "../href";
import { JoinRequestFilter } from "../join-request-page.type";

/**
 * Feature: Join Request Queue URLs
 * As the queue page
 * I want a single factory to build every filter/page URL
 * So that the default tab and page are always omitted the same way, and
 * every other combination is shareable
 */
describe("Feature: Join Request Queue URLs", () => {
  it("returns the bare path when no filter or page is given", () => {
    expect(joinRequestsHref()).toBe("/admin/join-requests");
  });

  it("omits the filter param for the default Waiting tab", () => {
    expect(joinRequestsHref({ filter: JoinRequestFilter.Waiting })).toBe(
      "/admin/join-requests",
    );
  });

  it("includes the filter param for a non-default tab", () => {
    expect(joinRequestsHref({ filter: JoinRequestFilter.Approved })).toBe(
      "/admin/join-requests?filter=approved",
    );
  });

  it("omits the page param for page 1", () => {
    expect(joinRequestsHref({ page: 1 })).toBe("/admin/join-requests");
  });

  it("includes the page param for any page after 1", () => {
    expect(joinRequestsHref({ page: 3 })).toBe("/admin/join-requests?page=3");
  });

  it("combines a non-default filter with a non-default page", () => {
    expect(
      joinRequestsHref({ filter: JoinRequestFilter.Rejected, page: 2 }),
    ).toBe("/admin/join-requests?filter=rejected&page=2");
  });
});
