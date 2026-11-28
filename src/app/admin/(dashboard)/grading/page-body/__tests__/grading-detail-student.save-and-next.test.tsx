// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import type { Question } from "src/lib/question-service";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { setTestPractice } from "src/tests/seed-unmarked-choice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailStudent } from "../grading-detail-student";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}));

/** A test with `count` written questions, and a student who answered and handed in every one. */
async function seedTest(questionCount: number, isPractice = false) {
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
    isPractice,
  });
  const questions: Question[] = [];
  for (let i = 1; i <= questionCount; i++) {
    questions.push(
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title: `Q${i}`,
        content: `Q${i}`,
        createdBy: "admin",
      }),
    );
  }
  async function enrolledStudent(name: string) {
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${name}`,
      username: name.toLowerCase(),
      name,
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    return student;
  }
  async function handedInStudent(name: string) {
    const student = await enrolledStudent(name);
    for (const question of questions) {
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: `${name} answer` },
      });
    }
    await services.testSubmissionService.submitTest(test.id, student.id);
    return student;
  }
  return {
    services,
    course,
    test,
    questions,
    enrolledStudent,
    handedInStudent,
  };
}

async function renderStudent(
  seed: Awaited<ReturnType<typeof seedTest>>,
  student: { id: string; name: string; username: string },
  questionId: string,
) {
  render(
    await GradingDetailStudent({
      screen: await (
        await import("src/lib/grading-screen-read")
      ).readGradingScreen(TEST_SCHOOL_ID, seed.test),
      test: seed.test,
      courseId: seed.course.id,
      schoolId: TEST_SCHOOL_ID,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      questionId,
      basePath: `/admin/grading/${seed.test.id}`,
      routeKind: GradingRouteKind.Hub,
    }),
  );
}

describe("Feature: the Save & next button says where it goes", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("names the next question within the student, with how many of her answers are left, and has no separate Save", async () => {
    // Given Ann handed in three written answers and none is graded
    const seed = await seedTest(3);
    const ann = await seed.handedInStudent("Ann");

    // When the teacher opens her first answer
    await renderStudent(seed, ann, seed.questions[0].id);

    // Then the pinned button names the next question and the line counts what is left
    const panel = screen.getByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next: Q2 ›" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("3 written answers left for Ann"),
    ).toBeInTheDocument();
    // And Save & next is the only grade save button
    expect(
      within(panel).queryByRole("button", { name: /^(Save|Update) Grade$/ }),
    ).toBeNull();
  });

  it("on her last answer to grade it says Save & next student and how many students wait", async () => {
    // Given Ann and Bob each handed in one answer, neither graded
    const seed = await seedTest(1);
    const ann = await seed.handedInStudent("Ann");
    await seed.handedInStudent("Bob");

    // When the teacher opens Ann's only answer
    await renderStudent(seed, ann, seed.questions[0].id);

    // Then the button crosses to the next student and the line counts who waits
    const panel = screen.getByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next student" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Ann's last answer to grade · 1 more student waiting",
      ),
    ).toBeInTheDocument();
  });
});

describe("Feature: the Save & next label for the last and earlier answers", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("says nothing else needs a grade when she is the only student and has no other answer to grade", async () => {
    // Given Ann is the only student and handed in one written answer
    const seed = await seedTest(1);
    const ann = await seed.handedInStudent("Ann");

    // When the teacher opens it
    await renderStudent(seed, ann, seed.questions[0].id);

    // Then the plain button says nothing else needs a grade
    const panel = screen.getByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Nothing else in this test needs a grade"),
    ).toBeInTheDocument();
  });

  it("goes back to her earlier answer that needs a grade after her later ones are graded", async () => {
    // Given Ann handed in three answers and the teacher graded the second and third
    const seed = await seedTest(3);
    const ann = await seed.handedInStudent("Ann");
    for (const question of seed.questions.slice(1)) {
      await seed.services.gradeService.gradeQuestion({
        testId: seed.test.id,
        questionId: question.id,
        studentId: ann.id,
        score: 80,
        feedback: "",
        gradedBy: "admin",
      });
    }

    // When the teacher is on her last answer
    await renderStudent(seed, ann, seed.questions[2].id);

    // Then Save & next goes back to Q1 and counts it as the one answer left
    const panel = screen.getByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next: Q1 ›" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("1 written answer left for Ann"),
    ).toBeInTheDocument();
  });
});

describe("Feature: the Save & next label matches where Save & next goes", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("names the next student when the only other hand-in holds a choice answer with no mark", async () => {
    // Given a practice test where Ann handed in her written answer and Bob only a choice answer
    const seed = await seedTest(1, true);
    const ann = await seed.handedInStudent("Ann");
    const choice = await seed.services.questionService.addQuestion(
      seed.test.id,
      {
        type: "single_select",
        title: "Pick",
        content: "Pick",
        createdBy: "admin",
        options: [
          { text: "Yes", isCorrect: true },
          { text: "No", isCorrect: false },
        ],
      },
    );
    const bob = await seed.enrolledStudent("Bob");
    await seed.services.answerService.submitAnswer({
      testId: seed.test.id,
      questionId: choice.id,
      studentId: bob.id,
      answer: {
        type: "mc",
        selectedIds: [(choice.options as { id: string }[])[0].id],
      },
    });
    await seed.services.testSubmissionService.submitTest(seed.test.id, bob.id);
    // And the test is switched to a normal one, which leaves Bob's choice answer unmarked
    await seed.services.testService.updateTestSettings(seed.test.id, {
      showGradeAfterSubmit: false,
      showCorrectAnswerAfterSubmit: false,
      timeLimitMinutes: null,
      isPractice: false,
      answerRevealMode: seed.test.answerRevealMode,
      updatedBy: "admin",
    });
    const normalTest = await seed.services.testService.requireTest(
      seed.test.id,
    );

    // When the teacher opens Ann's only written answer
    await renderStudent(
      { ...seed, test: normalTest },
      ann,
      seed.questions[0].id,
    );

    // Then the button names the next student, because Save & next opens Bob's unmarked choice answer
    const panel = screen.getByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next student" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Ann's last answer to grade · 1 more student waiting",
      ),
    ).toBeInTheDocument();
  });

  it("counts her choice answer with no mark as an answer left, without calling it written", async () => {
    // Given a practice test where Ann handed in a written Q1 and a choice Q2
    const seed = await seedTest(1, true);
    const choice = await seed.services.questionService.addQuestion(
      seed.test.id,
      {
        type: "single_select",
        title: "Pick",
        content: "Pick",
        createdBy: "admin",
        options: [
          { text: "Yes", isCorrect: true },
          { text: "No", isCorrect: false },
        ],
      },
    );
    const ann = await seed.enrolledStudent("Ann");
    await seed.services.answerService.submitAnswer({
      testId: seed.test.id,
      questionId: seed.questions[0].id,
      studentId: ann.id,
      answer: { type: "free_text", text: "Ann answer" },
    });
    await seed.services.answerService.submitAnswer({
      testId: seed.test.id,
      questionId: choice.id,
      studentId: ann.id,
      answer: {
        type: "mc",
        selectedIds: [(choice.options as { id: string }[])[0].id],
      },
    });
    await seed.services.testSubmissionService.submitTest(seed.test.id, ann.id);
    // And the test is switched to a normal one, which leaves her choice answer unmarked
    await setTestPractice(seed.services, seed.test.id, false);
    const normalTest = await seed.services.testService.requireTest(
      seed.test.id,
    );

    // When the teacher opens her written answer
    await renderStudent(
      { ...seed, test: normalTest },
      ann,
      seed.questions[0].id,
    );

    // Then the button names Q2 and the line counts both answers, not as written ones
    const panel = screen.getByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next: Q2 ›" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("2 answers left for Ann"),
    ).toBeInTheDocument();
  });
});
