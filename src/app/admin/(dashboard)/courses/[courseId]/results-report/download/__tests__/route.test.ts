import { describe, expect, it, vi } from "vitest";

const {
  requireAdminSession,
  buildReport,
  renderResultsReportToBuffer,
  isEnrolled,
  getTest,
} = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  buildReport: vi.fn(),
  renderResultsReportToBuffer: vi.fn(),
  isEnrolled: vi.fn(),
  getTest: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

vi.mock("src/lib/services-singleton", () => ({
  getEnrollmentService: vi.fn(async () => ({ isEnrolled })),
  getStudentService: vi.fn(async () => ({})),
  getTestService: vi.fn(async () => ({ getTest })),
  getQuestionService: vi.fn(async () => ({})),
  getAnswerService: vi.fn(async () => ({})),
  getGradeService: vi.fn(async () => ({})),
  getTestStatusService: vi.fn(async () => ({})),
  getTestFeedbackService: vi.fn(async () => ({})),
}));

vi.mock("src/lib/results-report-assembler", () => ({
  ResultsReportAssembler: vi.fn(function ResultsReportAssembler() {
    return { buildReport };
  }),
}));

vi.mock("src/lib/results-report-pdf", () => ({ renderResultsReportToBuffer }));

import { GET } from "../route";

describe("results-report download route", () => {
  it("rejects a non-admin request without returning a PDF body", async () => {
    // Given the admin guard rejects (no admin session).
    requireAdminSession.mockRejectedValueOnce(
      new Error("Unauthorized: admin access required"),
    );

    // When a GET is made with otherwise-valid query params.
    const res = await GET(
      new Request(
        "http://test/admin/courses/c1/results-report/download?studentId=s1&testId=a",
      ),
      { params: Promise.resolve({ courseId: "c1" }) },
    );

    // Then the response is unauthorized and is not a PDF.
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).not.toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("returns the student's PDF attachment assembled from exactly the selected test IDs", async () => {
    // Given an admin session, an enrolled student, in-course tests, and an
    // assembler/renderer that produce a PDF.
    requireAdminSession.mockResolvedValueOnce({ userId: "admin-1" });
    isEnrolled.mockResolvedValue(true);
    getTest.mockResolvedValue({ id: "t", courseId: "c1", title: "T" });
    buildReport.mockResolvedValueOnce({
      student: { id: "s1", username: "alice", name: "Alice" },
      tests: [],
    });
    renderResultsReportToBuffer.mockResolvedValueOnce(
      Buffer.from("%PDF-1.4 fake-pdf-bytes"),
    );

    // When the admin GETs with a studentId and two selected test IDs.
    const res = await GET(
      new Request(
        "http://test/admin/courses/c1/results-report/download?studentId=s1&testId=A&testId=B",
      ),
      { params: Promise.resolve({ courseId: "c1" }) },
    );

    // Then a non-empty PDF attachment is returned for exactly those test IDs.
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(buildReport).toHaveBeenCalledWith("s1", ["A", "B"]);
  });

  it("rejects an admin request that is missing the studentId with a non-PDF 400", async () => {
    // Given an admin session but a query with no studentId (route is directly
    // reachable despite the UI hard-block).
    requireAdminSession.mockResolvedValueOnce({ userId: "admin-1" });
    buildReport.mockClear();

    // When the admin GETs without a studentId.
    const res = await GET(
      new Request(
        "http://test/admin/courses/c1/results-report/download?testId=A",
      ),
      { params: Promise.resolve({ courseId: "c1" }) },
    );

    // Then the request is rejected with 400 and no report is assembled.
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).not.toContain("application/pdf");
    expect(buildReport).not.toHaveBeenCalled();
  });

  it("rejects an admin request for a student not enrolled in the course with a non-PDF 403", async () => {
    // Given an admin session but the requested student is not enrolled here.
    requireAdminSession.mockResolvedValueOnce({ userId: "admin-1" });
    isEnrolled.mockResolvedValueOnce(false);
    buildReport.mockClear();

    // When the admin GETs for that student in this course.
    const res = await GET(
      new Request(
        "http://test/admin/courses/c1/results-report/download?studentId=s1&testId=A",
      ),
      { params: Promise.resolve({ courseId: "c1" }) },
    );

    // Then it is forbidden and no report is assembled.
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).not.toContain("application/pdf");
    expect(buildReport).not.toHaveBeenCalled();
    expect(isEnrolled).toHaveBeenCalledWith("c1", "s1");
  });

  it("rejects an admin request when a selected test does not belong to the course with a non-PDF 404", async () => {
    // Given an admin session, an enrolled student, but a test from another course.
    requireAdminSession.mockResolvedValueOnce({ userId: "admin-1" });
    isEnrolled.mockResolvedValueOnce(true);
    getTest.mockReset();
    getTest.mockResolvedValueOnce({ id: "A", courseId: "other", title: "T" });
    buildReport.mockClear();

    // When the admin GETs with that cross-course test selected.
    const res = await GET(
      new Request(
        "http://test/admin/courses/c1/results-report/download?studentId=s1&testId=A",
      ),
      { params: Promise.resolve({ courseId: "c1" }) },
    );

    // Then it is not found and no report is assembled.
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toContain("application/pdf");
    expect(buildReport).not.toHaveBeenCalled();
  });
});
