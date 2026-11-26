import { describe, expect, it, vi } from "vitest";

const { requireAdminSession, getCounts, countVisiblePending } = vi.hoisted(
  () => ({
    requireAdminSession: vi.fn(),
    getCounts: vi.fn(),
    countVisiblePending: vi.fn(),
  }),
);

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));
vi.mock("src/lib/services-singleton", () => ({
  getGradingCountService: vi.fn(async () => ({ getCounts })),
  getCourseJoinRequestService: vi.fn(async () => ({ countVisiblePending })),
}));

import { GET } from "../route";

describe("sidebar counts route", () => {
  it("rejects a request without an admin session", async () => {
    // Given no admin session
    requireAdminSession.mockRejectedValueOnce(
      new Error("Unauthorized: admin access required"),
    );

    // When the counts are requested
    const res = await GET();

    // Then it answers 401 and reads no counts
    expect(res.status).toBe(401);
    expect(getCounts).not.toHaveBeenCalled();
  });

  it("rejects an admin who belongs to no school yet", async () => {
    // Given the session guard refuses a school-less admin
    requireAdminSession.mockRejectedValueOnce(
      new Error("Unauthorized: not part of any school yet"),
    );

    // When the counts are requested
    const res = await GET();

    // Then it answers 401
    expect(res.status).toBe(401);
  });

  it("returns both badge numbers uncached", async () => {
    // Given a school admin, 4 waiting submissions and 2 actionable join requests
    requireAdminSession.mockResolvedValueOnce({ school: { id: "school-1" } });
    getCounts.mockResolvedValueOnce({ waiting: 4 });
    countVisiblePending.mockResolvedValueOnce(2);

    // When the counts are requested
    const res = await GET();

    // Then the body carries the number and the response is not cacheable
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ toGrade: 4, joinRequests: 2 });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
