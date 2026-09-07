// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Db } from "mongodb";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  type TestServices,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JoinRequestsPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

/**
 * Seeds `count` resolvable Pending requests for one course, each a distinct
 * student, with strictly increasing `requestedAt` so page order is
 * unambiguous — the fixture the pagination-boundary tests below share.
 */
async function seedPendingRequests(
  services: TestServices,
  db: Db,
  courseId: string,
  count: number,
): Promise<string[]> {
  const testIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const suffix = `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${suffix}`,
      username: `seed-${suffix}`,
      name: `Seed ${i}`,
      createdBy: "self-signup",
    });
    const id = crypto.randomUUID();
    testIds.push(`join-request-row-${id}`);
    await db.collection("course_join_request").insertOne({
      id,
      courseId,
      studentId: student.id,
      status: JoinRequestStatus.Pending,
      requestedAt: new Date(2024, 5, i + 1),
      resolvedAt: null,
      resolvedBy: null,
    });
  }
  return testIds;
}

/**
 * Feature: Admin Join Request Queue
 * As an admin
 * I want to see every waiting join request, with who is asking and which
 * course they want
 * So that I can review who is trying to join before anyone touches the
 * approve/reject actions
 */
describe("Feature: Admin Join Request Queue", () => {
  let db: Db;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows every waiting request with the requester's name and the course they want, hiding rows whose student or course can't be resolved", async () => {
    const services = getTestServices();

    const algebra = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const biology = await services.courseService.createCourse({
      title: "Biology",
      description: "",
      createdBy: "admin",
    });

    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-alice",
      username: "alice",
      name: "Alice Smith",
      createdBy: "self-signup",
    });
    const bob = await services.studentService.createStudentDocument({
      authUserId: "auth-bob",
      username: "bob",
      name: "Bob Jones",
      createdBy: "self-signup",
    });

    await services.courseJoinRequestService.createRequest({
      courseId: algebra.id,
      studentId: alice.id,
    });
    await services.courseJoinRequestService.createRequest({
      courseId: biology.id,
      studentId: bob.id,
    });

    // D55: a row whose student can't be resolved must vanish, not render a
    // placeholder. No code path in this app produces one, so it's inserted
    // directly.
    await db.collection("course_join_request").insertOne({
      id: crypto.randomUUID(),
      courseId: algebra.id,
      studentId: "ghost-student",
      status: JoinRequestStatus.Pending,
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    });

    // D55's other half: a real student, but a course that can't be
    // resolved, must vanish too — not just the student-side case above.
    await db.collection("course_join_request").insertOne({
      id: crypto.randomUUID(),
      courseId: "ghost-course",
      studentId: alice.id,
      status: JoinRequestStatus.Pending,
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    });

    // Already resolved — must not appear in the waiting queue (R4).
    await db.collection("course_join_request").insertOne({
      id: crypto.randomUUID(),
      courseId: algebra.id,
      studentId: bob.id,
      status: JoinRequestStatus.Approved,
      requestedAt: new Date(),
      resolvedAt: new Date(),
      resolvedBy: "admin-1",
    });

    const ui = await JoinRequestsPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText(/Algebra/)).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText(/Biology/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/^join-request-row-/)).toHaveLength(2);
  });

  it("gives each waiting row an Approve action (Step 30)", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-alice",
      username: "alice",
      name: "Alice Smith",
      createdBy: "self-signup",
    });
    await services.courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: alice.id,
    });

    const ui = await JoinRequestsPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("gives each waiting row a Reject action (Step 31)", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-alice",
      username: "alice",
      name: "Alice Smith",
      createdBy: "self-signup",
    });
    await services.courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: alice.id,
    });

    const ui = await JoinRequestsPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("switches the queue between waiting, approved and rejected via the filter search param, with a distinct empty state for each", async () => {
    const services = getTestServices();

    const algebra = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const bob = await services.studentService.createStudentDocument({
      authUserId: "auth-bob",
      username: "bob",
      name: "Bob Jones",
      createdBy: "self-signup",
    });

    // Only an Approved row exists — no code path to approve one yet
    // (Steps 30-33), so it's inserted directly. Pending and Rejected are
    // both empty by omission.
    await db.collection("course_join_request").insertOne({
      id: crypto.randomUUID(),
      courseId: algebra.id,
      studentId: bob.id,
      status: JoinRequestStatus.Approved,
      requestedAt: new Date(),
      resolvedAt: new Date(),
      resolvedBy: "admin-1",
    });

    // Default (Waiting) is empty — the GOOD empty state.
    const waitingUi = await JoinRequestsPage({
      searchParams: Promise.resolve({}),
    });
    const { unmount: unmountWaiting } = render(waitingUi);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    unmountWaiting();

    // Switching to Approved shows Bob's row.
    const approvedUi = await JoinRequestsPage({
      searchParams: Promise.resolve({ filter: "approved" }),
    });
    const { unmount: unmountApproved } = render(approvedUi);
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    unmountApproved();

    // Rejected is empty too, but it's NOT the default filter — the NEUTRAL
    // empty state, distinct from "All caught up".
    const rejectedUi = await JoinRequestsPage({
      searchParams: Promise.resolve({ filter: "rejected" }),
    });
    render(rejectedUi);
    expect(screen.getByText(/No requests match/i)).toBeInTheDocument();
    expect(screen.queryByText(/All caught up/i)).not.toBeInTheDocument();
  });

  it("pages a long waiting queue oldest-first with a real total, and sorts a history tab newest-first", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });

    // 12 Pending rows > one page (PAGE_SIZE=10). Inserted directly with
    // staggered timestamps — createRequest always stamps "now", which can't
    // guarantee millisecond separation in a tight loop, and deterministic
    // order is exactly what this test proves.
    const pendingIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const student = await services.studentService.createStudentDocument({
        authUserId: `auth-p${i}`,
        username: `p${i}`,
        name: `Pending ${i}`,
        createdBy: "self-signup",
      });
      const id = crypto.randomUUID();
      pendingIds.push(id);
      await db.collection("course_join_request").insertOne({
        id,
        courseId: course.id,
        studentId: student.id,
        status: JoinRequestStatus.Pending,
        requestedAt: new Date(2024, 0, i + 1),
        resolvedAt: null,
        resolvedBy: null,
      });
    }

    // Page 1 (default, no `page` param): the oldest 10, ascending.
    const page1Ui = await JoinRequestsPage({
      searchParams: Promise.resolve({}),
    });
    const { unmount: unmountPage1 } = render(page1Ui);
    const page1Ids = screen
      .getAllByTestId(/^join-request-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(page1Ids).toEqual(
      pendingIds.slice(0, 10).map((id) => `join-request-row-${id}`),
    );
    expect(screen.getByTestId("pagination-info").textContent).toMatch(
      /page 1 of 2/i,
    );
    unmountPage1();

    // Page 2, reached via the shareable `?page=2` — the remaining 2, still
    // ascending, not a re-cap of page 1 (D56: full paging, not truncation).
    const page2Ui = await JoinRequestsPage({
      searchParams: Promise.resolve({ page: "2" }),
    });
    const { unmount: unmountPage2 } = render(page2Ui);
    const page2Ids = screen
      .getAllByTestId(/^join-request-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(page2Ids).toEqual(
      pendingIds.slice(10, 12).map((id) => `join-request-row-${id}`),
    );
    unmountPage2();

    // History tabs sort newest-first (D56) — the opposite of Waiting.
    const approvedIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const student = await services.studentService.createStudentDocument({
        authUserId: `auth-a${i}`,
        username: `a${i}`,
        name: `Approved ${i}`,
        createdBy: "self-signup",
      });
      const id = crypto.randomUUID();
      approvedIds.push(id);
      await db.collection("course_join_request").insertOne({
        id,
        courseId: course.id,
        studentId: student.id,
        status: JoinRequestStatus.Approved,
        requestedAt: new Date(2024, 1, i + 1),
        resolvedAt: new Date(),
        resolvedBy: "admin-1",
      });
    }

    const approvedUi = await JoinRequestsPage({
      searchParams: Promise.resolve({ filter: "approved" }),
    });
    render(approvedUi);
    const approvedRenderedIds = screen
      .getAllByTestId(/^join-request-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(approvedRenderedIds).toEqual(
      [...approvedIds].reverse().map((id) => `join-request-row-${id}`),
    );
  });

  it("keeps every row exactly once across pages when several requests share the exact same timestamp", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });

    // All 12 rows share one instant — a real tie, unlike the staggered
    // timestamps above. requestedAt alone can't order these; only a
    // secondary key (_id) keeps the split stable across two separate
    // page renders (each is its own query).
    const tiedTimestamp = new Date(2024, 0, 1);
    const pendingTestIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const student = await services.studentService.createStudentDocument({
        authUserId: `auth-tie${i}`,
        username: `tie${i}`,
        name: `Tie ${i}`,
        createdBy: "self-signup",
      });
      const id = crypto.randomUUID();
      pendingTestIds.push(`join-request-row-${id}`);
      await db.collection("course_join_request").insertOne({
        id,
        courseId: course.id,
        studentId: student.id,
        status: JoinRequestStatus.Pending,
        requestedAt: tiedTimestamp,
        resolvedAt: null,
        resolvedBy: null,
      });
    }

    const page1Ui = await JoinRequestsPage({
      searchParams: Promise.resolve({}),
    });
    const { unmount: unmountPage1 } = render(page1Ui);
    const page1Ids = screen
      .getAllByTestId(/^join-request-row-/)
      .map((el) => el.getAttribute("data-testid"));
    unmountPage1();

    const page2Ui = await JoinRequestsPage({
      searchParams: Promise.resolve({ page: "2" }),
    });
    const { unmount: unmountPage2 } = render(page2Ui);
    const page2Ids = screen
      .getAllByTestId(/^join-request-row-/)
      .map((el) => el.getAttribute("data-testid"));
    unmountPage2();

    // No row repeats across the two pages, and none is dropped.
    expect(page1Ids).toHaveLength(10);
    expect(page2Ids).toHaveLength(2);
    expect(new Set([...page1Ids, ...page2Ids])).toEqual(
      new Set(pendingTestIds),
    );
  });

  it("keeps the pager's total in agreement with the rows actually rendered when some requests are unresolvable (D69)", async () => {
    const services = getTestServices();
    const algebra = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });

    // 3 requests the admin can actually see...
    for (let i = 0; i < 3; i++) {
      const student = await services.studentService.createStudentDocument({
        authUserId: `auth-v${i}`,
        username: `v${i}`,
        name: `Visible ${i}`,
        createdBy: "self-signup",
      });
      await services.courseJoinRequestService.createRequest({
        courseId: algebra.id,
        studentId: student.id,
      });
    }

    // ...plus 2 raw rows the join can never resolve (D55: dropped, not
    // rendered). The pager must count 3, never the raw 5.
    for (let i = 0; i < 2; i++) {
      await db.collection("course_join_request").insertOne({
        id: crypto.randomUUID(),
        courseId: algebra.id,
        studentId: `ghost-student-${i}`,
        status: JoinRequestStatus.Pending,
        requestedAt: new Date(),
        resolvedAt: null,
        resolvedBy: null,
      });
    }

    const ui = await JoinRequestsPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getAllByTestId(/^join-request-row-/)).toHaveLength(3);
    expect(screen.getByTestId("pagination-info").textContent).toBe(
      "Page 1 of 1 (3 total)",
    );
  });

  it("clamps a page number beyond the real range down to the last valid page", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const testIds = await seedPendingRequests(services, db, course.id, 12);

    const ui = await JoinRequestsPage({
      searchParams: Promise.resolve({ page: "999" }),
    });
    render(ui);

    expect(screen.getByTestId("pagination-info").textContent).toBe(
      "Page 2 of 2 (12 total)",
    );
    expect(
      screen
        .getAllByTestId(/^join-request-row-/)
        .map((el) => el.getAttribute("data-testid")),
    ).toEqual(testIds.slice(10, 12));
  });

  it("clamps an astronomically large ?page= instead of erroring", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    await seedPendingRequests(services, db, course.id, 12);

    const ui = await JoinRequestsPage({
      searchParams: Promise.resolve({ page: "99999999999999999999999999" }),
    });
    render(ui);

    expect(screen.getByTestId("pagination-info").textContent).toBe(
      "Page 2 of 2 (12 total)",
    );
  });

  it("treats an out-of-range or non-numeric ?page= the same as page 1", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    await seedPendingRequests(services, db, course.id, 12);

    for (const invalid of ["0", "-1", "abc"]) {
      const ui = await JoinRequestsPage({
        searchParams: Promise.resolve({ page: invalid }),
      });
      const { unmount } = render(ui);
      expect(screen.getByTestId("pagination-info").textContent).toBe(
        "Page 1 of 2 (12 total)",
      );
      unmount();
    }
  });

  it("falls back to the Waiting tab for an unrecognized ?filter= value", async () => {
    const services = getTestServices();
    const algebra = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-alice",
      username: "alice",
      name: "Alice Smith",
      createdBy: "self-signup",
    });
    await services.courseJoinRequestService.createRequest({
      courseId: algebra.id,
      studentId: alice.id,
    });
    // Only exists to prove a fallback to Waiting excludes it, not Approved.
    const bob = await services.studentService.createStudentDocument({
      authUserId: "auth-bob",
      username: "bob",
      name: "Bob Jones",
      createdBy: "self-signup",
    });
    await db.collection("course_join_request").insertOne({
      id: crypto.randomUUID(),
      courseId: algebra.id,
      studentId: bob.id,
      status: JoinRequestStatus.Approved,
      requestedAt: new Date(),
      resolvedAt: new Date(),
      resolvedBy: "admin-1",
    });

    const ui = await JoinRequestsPage({
      searchParams: Promise.resolve({ filter: "bogus" }),
    });
    render(ui);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  it("links Previous/Next to the adjacent page, disabling each at its end of the range", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    await seedPendingRequests(services, db, course.id, 12);

    const page1Ui = await JoinRequestsPage({
      searchParams: Promise.resolve({}),
    });
    const { unmount: unmountPage1 } = render(page1Ui);
    expect(
      screen.queryByRole("link", { name: "Previous" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Previous").tagName).not.toBe("A");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/join-requests?page=2",
    );
    unmountPage1();

    const page2Ui = await JoinRequestsPage({
      searchParams: Promise.resolve({ page: "2" }),
    });
    render(page2Ui);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/admin/join-requests",
    );
    expect(
      screen.queryByRole("link", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Next").tagName).not.toBe("A");
  });
});
