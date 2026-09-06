// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Db } from "mongodb";
import type { ReactElement } from "react";
import { StudentSession } from "src/lib/session";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JoinPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// This page now also resolves the caller's identity (Step 22) and, since
// Step 25, their classified session before rendering. Both default to null
// (no valid session) so these pre-existing scenarios — none of which are
// about Google or an existing student — keep seeing the plain signed-out
// invite card, unaffected by the new calls.
const mockResolveUnclassifiedIdentity = vi.fn();
const mockGetSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    resolveUnclassifiedIdentity: mockResolveUnclassifiedIdentity,
    getSession: mockGetSession,
  })),
}));

beforeEach(() => {
  mockResolveUnclassifiedIdentity.mockResolvedValue(null);
  mockGetSession.mockResolvedValue(null);
});

/**
 * Feature: someone opening a valid join link sees which course they are
 * being invited to
 * As a prospective student
 * I want to see the course name behind an invite link
 * So that I know what I'm being asked to join before doing anything else
 */
describe("Feature: someone opening a valid join link sees which course they are being invited to", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the name of the course the token invites them to", async () => {
    // Given a course with a live join link
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    // When a prospective student opens the link
    const ui = await JoinPage({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    // Then they see which course it invites them to
    expect(screen.getByText("Intro to Algorithms")).toBeInTheDocument();
  });
});

/**
 * Feature: someone opening a broken or switched-off join link is told the
 * invitation is no longer valid, and learns nothing about the course
 * As a prospective student
 * I want the identical message whether the link never existed, was
 * revoked, or points at a since-deleted course
 * So that the page can never be used to find out which courses exist (D43)
 */
describe("Feature: someone opening a broken or switched-off join link is told the invitation is no longer valid", () => {
  let db: Db;
  let neverValidUi: ReactElement;
  let revokedUi: ReactElement;
  let deletedUi: ReactElement;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;
    const services = getTestServices();

    // A token nobody ever minted
    neverValidUi = await JoinPage({
      params: Promise.resolve({ token: "never-issued-token" }),
      searchParams: Promise.resolve({}),
    });

    // A course whose link was revoked (D43: revoked reads as never-had-a-link)
    const revokedCourse = await services.courseService.createCourse({
      title: "Revoked Course",
      description: "",
      createdBy: "admin-1",
    });
    const revokedToken = await services.courseService.getOrCreateInviteToken(
      revokedCourse.id,
    );
    await services.courseService.disableInviteToken(revokedCourse.id);
    revokedUi = await JoinPage({
      params: Promise.resolve({ token: revokedToken }),
      searchParams: Promise.resolve({}),
    });

    // A course that had a live link and no longer exists — no delete-course
    // feature exists anywhere in this app, so the deletion is simulated
    // directly against the collection.
    const deletedCourse = await services.courseService.createCourse({
      title: "Deleted Course",
      description: "",
      createdBy: "admin-1",
    });
    const deletedToken = await services.courseService.getOrCreateInviteToken(
      deletedCourse.id,
    );
    await db.collection("course").deleteOne({ id: deletedCourse.id });
    deletedUi = await JoinPage({
      params: Promise.resolve({ token: deletedToken }),
      searchParams: Promise.resolve({}),
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it.each([
    ["a token that never existed", () => neverValidUi],
    ["a revoked link", () => revokedUi],
    ["a deleted course", () => deletedUi],
  ] as const)(
    "shows the invalid-invitation message for %s",
    (_label, getUi) => {
      const { unmount } = render(getUi());
      expect(
        screen.getByText("Invitation no longer valid"),
      ).toBeInTheDocument();
      unmount();
    },
  );

  it("renders byte-identical markup regardless of why the link is invalid (D43)", () => {
    const html = [neverValidUi, revokedUi, deletedUi].map((ui) => {
      const { container, unmount } = render(ui);
      const innerHtml = container.innerHTML;
      unmount();
      return innerHtml;
    });

    expect(html[1]).toBe(html[0]);
    expect(html[2]).toBe(html[0]);
  });
});

/**
 * Feature: opening an invite link never provisions a Google identity on its
 * own — only completing the Google round trip does
 * As a prospective student
 * I want opening the link itself (tab restore, back/forward, a URL handler)
 * to be side-effect-free
 * So that a cookied caller who merely opens the link is never silently
 * given a student document (M1)
 */
describe("Feature: opening an invite link never provisions a Google identity on its own", () => {
  let db: Db;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("never resolves or provisions an identity when the URL carries no Google consent marker", async () => {
    // Given a course with a live join link, and an identity that WOULD
    // resolve if the page ever asked for one
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    mockResolveUnclassifiedIdentity.mockResolvedValue({
      authUserId: "some-auth-id",
      email: "curious@gmail.com",
      name: "Curious Visitor",
    });

    // When the link is opened with no ?google=1 marker — a tab restore,
    // back/forward navigation, or a plain URL open all look like this
    const ui = await JoinPage({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    // Then the page never even asks for an identity, let alone provisions one
    expect(mockResolveUnclassifiedIdentity).not.toHaveBeenCalled();
    expect(await services.studentService.listStudents()).toHaveLength(0);
    expect(
      await db.collection("course_join_request").countDocuments({
        courseId: course.id,
      }),
    ).toBe(0);
  });
});

/**
 * Feature: the invite page is the sole trigger that provisions a Google
 * identity into a student
 * As a prospective student who just completed a Google sign-in from this
 * page
 * I want my identity provisioned for the SAME course the link named
 * So that my request to join lands in front of the right admins
 */
describe("Feature: the invite page is the sole trigger that provisions a Google identity into a student", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("provisions a student and a pending join request against the course's own id when the Google marker is present", async () => {
    // Given a course with a live join link, and a caller who just completed
    // a Google round trip back to this same page
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    mockResolveUnclassifiedIdentity.mockResolvedValue({
      authUserId: "fresh-google-auth-id",
      email: "fresh.google@gmail.com",
      name: "Fresh Google Signup",
    });

    // When the page renders with the consent marker the button set
    const ui = await JoinPage({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({ google: "1" }),
    });
    render(ui);

    // Then a student is created from the identity
    const student =
      await services.studentService.findByUsername("fresh.google");
    expect(student).not.toBeNull();
    expect(student?.name).toBe("Fresh Google Signup");

    // And a pending request is filed against the course's OWN id — never
    // the token or the invite token, which would be invisible to admins
    const pending = await services.courseJoinRequestService.getPendingRequest(
      course.id,
      student?.id ?? "",
    );
    expect(pending).not.toBeNull();
  });
});

/**
 * Feature: a student who already has an account is offered the request-to-
 * join path, not the registration form, when opening a valid invite link
 * As an existing, signed-in student
 * I want the invite page to recognize my account
 * So that I am never shown a signup form for a username I already hold
 */
describe("Feature: a signed-in student opening a valid invite link is offered to request-to-join, not to register again", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("renders the request-to-join form instead of the self-signup form for a signed-in student", async () => {
    // Given a course with a live join link, and a caller holding a recorded
    // STUDENT session
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    mockGetSession.mockResolvedValue(
      new StudentSession({
        userId: "auth-user-1",
        username: "returning-student",
        studentId: "student-1",
      }),
    );

    // When the signed-in student opens the invite link
    const ui = await JoinPage({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    // Then they see the request-to-join path, not the registration form
    expect(
      screen.getByRole("button", { name: "Request to Join" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  });
});
