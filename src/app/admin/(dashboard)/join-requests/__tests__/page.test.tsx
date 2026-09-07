// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Db } from "mongodb";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JoinRequestsPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

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

    const ui = await JoinRequestsPage();
    render(ui);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText(/Algebra/)).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText(/Biology/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/^join-request-row-/)).toHaveLength(2);
  });
});
