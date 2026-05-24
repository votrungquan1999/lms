// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingHubPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

describe("Feature: GradingHubPage default view", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should list tests needing grading sorted by ungraded count desc with course-name asc tiebreaker, showing test + course + ungraded count", async () => {
    const services = getTestServices();

    // Two courses (Alpha sorts before Beta alphabetically) for tiebreaker test
    const alpha = await services.courseService.createCourse({
      title: "Alpha",
      description: "",
      createdBy: "admin",
    });
    const beta = await services.courseService.createCourse({
      title: "Beta",
      description: "",
      createdBy: "admin",
    });

    // testHigh in Beta has 2 submitted (highest ungraded count)
    // testTie1 in Alpha has 1 submitted (tie with testTie2)
    // testTie2 in Beta has 1 submitted (tie with testTie1)
    // testNoNeed in Alpha has 0 submitted (excluded from "needs grading")
    const testHigh = await services.testService.createTest(beta.id, {
      title: "High",
      description: "",
      createdBy: "admin",
    });
    const testTie1 = await services.testService.createTest(alpha.id, {
      title: "Tie1",
      description: "",
      createdBy: "admin",
    });
    const testTie2 = await services.testService.createTest(beta.id, {
      title: "Tie2",
      description: "",
      createdBy: "admin",
    });
    const testNoNeed = await services.testService.createTest(alpha.id, {
      title: "NoNeed",
      description: "",
      createdBy: "admin",
    });

    for (const t of [testHigh, testTie1, testTie2, testNoNeed]) {
      await services.questionService.addQuestion(t.id, {
        type: "free_text",
        title: "Q",
        content: "Q",
        createdBy: "admin",
      });
    }

    // Seed students per course
    const courseStudents = new Map<string, string[]>();
    for (const course of [alpha, beta]) {
      const ids: string[] = [];
      for (const u of ["a", "b"]) {
        const s = await services.studentService.createStudentDocument({
          authUserId: `auth-${course.id}-${u}`,
          username: `${course.id}-${u}`,
          name: `${u}-${course.id}`,
          createdBy: "admin",
        });
        await services.enrollmentService.enrollStudent(
          course.id,
          s.id,
          "admin",
        );
        ids.push(s.id);
      }
      courseStudents.set(course.id, ids);
    }

    async function submit(testId: string, studentId: string) {
      const [q] = await services.questionService.listQuestions(testId);
      await services.answerService.submitAnswer({
        testId,
        questionId: q.id,
        studentId,
        answer: { type: "free_text", text: "x" },
      });
    }

    // testHigh: both Beta students submitted (2 waiting)
    const betaIds = courseStudents.get(beta.id) ?? [];
    await submit(testHigh.id, betaIds[0]);
    await submit(testHigh.id, betaIds[1]);

    // testTie1 (Alpha): one Alpha student submitted (1 waiting)
    const alphaIds = courseStudents.get(alpha.id) ?? [];
    await submit(testTie1.id, alphaIds[0]);

    // testTie2 (Beta): one Beta student submitted (1 waiting)
    await submit(testTie2.id, betaIds[0]);

    const ui = await GradingHubPage({
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const cards = screen.getAllByTestId(/^hub-test-card-/);
    const ids = cards.map((c) => c.getAttribute("data-test-id"));
    // High (2) first, then Tie1 (Alpha) before Tie2 (Beta) on course-name asc, NoNeed excluded.
    expect(ids).toEqual([testHigh.id, testTie1.id, testTie2.id]);

    const highCard = within(cards[0]);
    expect(highCard.getByText(/High/)).toBeInTheDocument();
    expect(highCard.getByText(/Beta/)).toBeInTheDocument();
    expect(highCard.getByText(/^2$/)).toBeInTheDocument();

    expect(ids).not.toContain(testNoNeed.id);
  });

  it("filter pills change the listed tests via URL search param; All caught up shows when needs-grading filter has no tests", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const testFully = await services.testService.createTest(course.id, {
      title: "Fully",
      description: "",
      createdBy: "admin",
    });
    const testPartial = await services.testService.createTest(course.id, {
      title: "Partial",
      description: "",
      createdBy: "admin",
    });
    for (const t of [testFully, testPartial]) {
      await services.questionService.addQuestion(t.id, {
        type: "free_text",
        title: "Q",
        content: "Q",
        createdBy: "admin",
      });
    }

    const [qFully] = await services.questionService.listQuestions(testFully.id);
    const [qPartial] = await services.questionService.listQuestions(
      testPartial.id,
    );

    const studentA = await services.studentService.createStudentDocument({
      authUserId: "auth-fa",
      username: "fa",
      name: "fa",
      createdBy: "admin",
    });
    const studentB = await services.studentService.createStudentDocument({
      authUserId: "auth-fb",
      username: "fb",
      name: "fb",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      studentA.id,
      "admin",
    );
    await services.enrollmentService.enrollStudent(
      course.id,
      studentB.id,
      "admin",
    );

    // testFully: both students answered, submitted + both graded → Fully graded
    for (const s of [studentA, studentB]) {
      await services.answerService.submitAnswer({
        testId: testFully.id,
        questionId: qFully.id,
        studentId: s.id,
        answer: { type: "free_text", text: "x" },
      });
      await services.testSubmissionService.submitTest(testFully.id, s.id);
      await services.gradeService.gradeQuestion({
        testId: testFully.id,
        questionId: qFully.id,
        studentId: s.id,
        score: 100,
        feedback: "",
        gradedBy: "admin",
      });
    }

    // testPartial: studentA answered + submitted + graded; studentB answered + submitted, not graded → Partial
    await services.answerService.submitAnswer({
      testId: testPartial.id,
      questionId: qPartial.id,
      studentId: studentA.id,
      answer: { type: "free_text", text: "x" },
    });
    await services.testSubmissionService.submitTest(
      testPartial.id,
      studentA.id,
    );
    await services.gradeService.gradeQuestion({
      testId: testPartial.id,
      questionId: qPartial.id,
      studentId: studentA.id,
      score: 100,
      feedback: "",
      gradedBy: "admin",
    });
    await services.answerService.submitAnswer({
      testId: testPartial.id,
      questionId: qPartial.id,
      studentId: studentB.id,
      answer: { type: "free_text", text: "y" },
    });
    await services.testSubmissionService.submitTest(
      testPartial.id,
      studentB.id,
    );

    // Default (needs-grading): testPartial appears because studentB is Submitted-but-ungraded.
    // We instead test fully-graded and partially-graded filters to cover the routing.

    const fullyUi = await GradingHubPage({
      searchParams: Promise.resolve({ filter: "fully-graded" }),
    });
    const { unmount: u1 } = render(fullyUi);
    let cards = screen.getAllByTestId(/^hub-test-card-/);
    expect(cards.map((c) => c.getAttribute("data-test-id"))).toEqual([
      testFully.id,
    ]);
    u1();

    const partialUi = await GradingHubPage({
      searchParams: Promise.resolve({ filter: "partially-graded" }),
    });
    const { unmount: u2 } = render(partialUi);
    cards = screen.getAllByTestId(/^hub-test-card-/);
    expect(cards.map((c) => c.getAttribute("data-test-id"))).toEqual([
      testPartial.id,
    ]);
    u2();

    // All caught up: no submitted-ungraded → grade studentB on testPartial too
    await services.gradeService.gradeQuestion({
      testId: testPartial.id,
      questionId: qPartial.id,
      studentId: studentB.id,
      score: 80,
      feedback: "",
      gradedBy: "admin",
    });

    const needsUi = await GradingHubPage({
      searchParams: Promise.resolve({}),
    });
    render(needsUi);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^hub-test-card-/)).toHaveLength(0);
  });
});
