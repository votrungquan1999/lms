// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Db } from "mongodb";
import { GradingCountService } from "src/lib/grading-count-service";
import { GradingMode } from "src/lib/grading-mode";
import { TestStatus } from "src/lib/test-status-service";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinishPanel } from "../finish-panel";
import { GradingRouteKind } from "../grading-page-body.type";
import { GradingPageShell } from "../grading-page-shell";
import { ReleaseStudentStatus } from "../release-students";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

/** A one-question written test; `practice` makes it a practice test. */
async function seedTest(practice = false) {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: "admin",
    isPractice: practice,
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });

  async function student(
    name: string,
    state: "graded" | "waiting" | "still-writing",
  ) {
    const doc = await services.studentService.createStudentDocument({
      authUserId: `auth-${name}`,
      username: name.toLowerCase(),
      name,
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, doc.id, "admin");
    await services.testStartService.recordStart(test.id, doc.id, new Date());
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: doc.id,
      answer: { type: "free_text", text: `answer of ${name}` },
    });
    if (state === "still-writing") return doc;
    await services.testSubmissionService.submitTest(test.id, doc.id);
    if (state === "graded") {
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId: question.id,
        studentId: doc.id,
        score: 80,
        feedback: "",
        gradedBy: "admin",
      });
    }
    return doc;
  }

  return { course, test, question, student };
}

type Seeded = Awaited<ReturnType<typeof seedTest>>;

async function renderDoneLink(
  seed: Seeded,
  mode: GradingMode,
  studentId: string,
) {
  render(
    await GradingPageShell({
      test: seed.test,
      courseId: seed.course.id,
      schoolId: TEST_SCHOOL_ID,
      basePath: `/admin/grading/${seed.test.id}`,
      selection: {
        mode,
        studentId,
        questionId: seed.question.id,
        done: true,
      },
    }),
  );
}

let db: Db;

describe("Feature: a done link opens the finish panel only while nothing is left to grade", () => {
  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  for (const mode of [GradingMode.Student, GradingMode.Question]) {
    it(`${mode} mode: shows the grade panel while another student's hand-in waits`, async () => {
      // Given Ann graded and Bob's hand-in waiting
      const seed = await seedTest();
      const ann = await seed.student("Ann", "graded");
      await seed.student("Bob", "waiting");

      // When the teacher opens a done link on Ann
      await renderDoneLink(seed, mode, ann.id);

      // Then the grade panel shows, not the finish panel
      expect(screen.getByTestId("grade-card")).toBeInTheDocument();
      expect(screen.queryByTestId("finish-panel")).toBeNull();
    });

    it(`${mode} mode: shows the grade panel while nobody is graded`, async () => {
      // Given the only student still writing, so nothing waits and nobody is graded
      const seed = await seedTest();
      const cy = await seed.student("Cy", "still-writing");

      // When the teacher opens a done link on her
      await renderDoneLink(seed, mode, cy.id);

      // Then the grade panel shows, not the finish panel
      expect(screen.getByTestId("grade-card")).toBeInTheDocument();
      expect(screen.queryByTestId("finish-panel")).toBeNull();
    });

    it(`${mode} mode: shows neither the finish panel nor a grade panel on a practice test with every hand-in graded`, async () => {
      // Given a practice test where the teacher graded both hand-ins
      const seed = await seedTest(true);
      const ann = await seed.student("Ann", "graded");
      await seed.student("Bob", "graded");

      // When the teacher opens a done link on Ann
      await renderDoneLink(seed, mode, ann.id);

      // Then both count as graded, and the screen still shows the answer only
      const counts = await new GradingCountService(
        db,
        TEST_SCHOOL_ID,
      ).getCounts();
      expect(
        counts.pairs
          .filter((p) => p.testId === seed.test.id)
          .map((p) => p.status),
      ).toEqual([TestStatus.Graded, TestStatus.Graded]);
      expect(screen.getByText("answer of Ann")).toBeInTheDocument();
      expect(screen.queryByTestId("grade-card")).toBeNull();
      expect(screen.queryByTestId("finish-panel")).toBeNull();
    });
  }
});

describe("Feature: the finish panel names three graded students, then the rest as a count", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("lists three graded students then 'and 2 more', and the release line names three then '2 more'", async () => {
    // Given five graded students who cannot see their grades
    const names = ["Ann", "Bob", "Cy", "Di", "Eve"];
    const students = names.map((name) => ({
      id: name,
      name,
      username: name.toLowerCase(),
      status: ReleaseStudentStatus.Graded,
    }));

    // When the finish panel renders
    render(
      await FinishPanel({
        testTitle: "Quiz",
        backHref: "/admin/courses/c/tests/t",
        students,
        savedLine: "Eve's Q1 saved just now",
        testId: "t",
        courseId: "c",
        schoolId: TEST_SCHOOL_ID,
        routeKind: GradingRouteKind.Hub,
        offerCorrectAnswers: false,
        counts: {
          graded: 5,
          waiting: 0,
          stillWriting: 0,
          redoRequested: 0,
          notStarted: 0,
        },
        choiceQuestionCount: 0,
      }),
    );

    // Then the list names Ann, Bob and Cy, then counts the other two
    const panel = screen.getByTestId("finish-panel");
    expect(panel).toHaveTextContent("All 5 submitted students graded");
    const items = within(panel)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual([
      "Ann @annGraded",
      "Bob @bobGraded",
      "Cy @cyGraded",
      "and 2 more",
    ]);
    expect(panel).toHaveTextContent(
      "Grades not released yet · Ann, Bob, Cy and 2 more can't see their grades until you release them.",
    );
  });
});
