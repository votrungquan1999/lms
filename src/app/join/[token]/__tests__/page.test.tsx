// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Db } from "mongodb";
import type { ReactElement } from "react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JoinPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

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
    const ui = await JoinPage({ params: Promise.resolve({ token }) });
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
