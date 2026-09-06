// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
