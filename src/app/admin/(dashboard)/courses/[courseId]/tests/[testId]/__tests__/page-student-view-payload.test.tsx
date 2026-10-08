// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { StudentCardQuestion } from "src/components/student-question-card.ui";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

const captured: StudentCardQuestion[][] = [];

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../test-questions-view", () => ({
  TestQuestionsView: ({
    studentQuestions,
  }: {
    studentQuestions: StudentCardQuestion[];
  }) => {
    // JSON round-trip = what actually crosses the server/client boundary
    captured.push(JSON.parse(JSON.stringify(studentQuestions)));
    return null;
  },
}));

/**
 * Feature: the Student view payload carries no answer key
 * As a teacher previewing a test
 * I want the browser to receive only what a student's card shows
 * So that the answer key never ships to the client behind the toggle.
 */
describe("Feature: test page Student view payload", () => {
  beforeEach(async () => {
    captured.length = 0;
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("sends only the card fields and marks every option wrong", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Essay",
      content: "Write",
      referenceAnswer: "SECRET-MODEL-ANSWER",
      explanation: "SECRET-FREE-EXPLANATION",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "single_select",
      title: "Capital",
      content: "Capital of France?",
      options: [
        { text: "Paris", isCorrect: true },
        { text: "Lyon", isCorrect: false },
      ],
      explanation: "SECRET-MC-EXPLANATION",
      createdBy: "admin",
    });

    render(
      await TestDetailPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
      }),
    );

    expect(captured).toHaveLength(1);
    const items = captured[0];
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        "content",
        "id",
        "media",
        "options",
        "order",
        "title",
        "type",
      ]);
    }
    const options = items.flatMap((item) => item.options);
    expect(options.map((option) => option.text)).toEqual(["Paris", "Lyon"]);
    expect(options.map((option) => option.isCorrect)).toEqual([false, false]);
  });
});
