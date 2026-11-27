// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingVariantPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));
vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({
    setTestFeedbackAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    saveAndNextAction: vi.fn(),
  }),
);

describe("Feature: GradingVariantPage", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the test title in the heading, plus the student picker", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q",
      content: "Q",
      createdBy: "admin",
    });
    const [q] = await services.questionService.listQuestions(test.id);

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      answer: { type: "free_text", text: "x" },
    });

    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // The heading names the test
    expect(
      screen.getByRole("heading", { name: /Midterm/i }),
    ).toBeInTheDocument();

    // The top bar carries the student picker.
    expect(
      screen.getByRole("button", { name: /student picker/i }),
    ).toBeInTheDocument();
  });

  it("should focus the student identified by ?studentId= in the main pane and name her on the student picker", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });

    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-a",
      username: "alice",
      name: "Alice",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      alice.id,
      "admin",
    );
    await new Promise((r) => setTimeout(r, 5));
    const bob = await services.studentService.createStudentDocument({
      authUserId: "auth-b",
      username: "bob",
      name: "Bob",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, bob.id, "admin");

    // When: the page renders with ?studentId=<alice.id> (the older-enrolled
    // student, NOT the default newest-first focus).
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ studentId: alice.id }),
    });
    render(ui);

    // Then: the main pane shows Alice, not Bob (proves URL-driven selection
    // wins over the default first-in-enrollment-order).
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(
      within(mainPane).getByTestId(`student-card-${alice.id}`),
    ).toBeInTheDocument();
    expect(within(mainPane).queryByTestId(`student-card-${bob.id}`)).toBeNull();

    // Then: the picker names Alice.
    expect(
      screen.getByRole("button", { name: /student picker/i }),
    ).toHaveTextContent("Alice");
  });

  it("should show the focused student's full submission in the main pane — their free-text answer, the overall-feedback form, and the auto-grade-with-AI button when submitted", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Explain Big-O",
      content: "Define O(n) in your own words.",
      createdBy: "admin",
    });
    const [q] = await services.questionService.listQuestions(test.id);

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-finn",
      username: "finn",
      name: "Finn",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      answer: {
        type: "free_text",
        text: "Linear runtime in input size.",
      },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    // When: the variant page renders for Finn (the only enrolled student).
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Then: the focused student's submission is rendered inside the main pane.
    const mainPane = screen.getByTestId("grading-main-pane");
    const detail = within(mainPane).getByTestId(`student-card-${student.id}`);

    // Free-text answer text is surfaced (the grading form embeds it).
    expect(
      within(detail).getByText(/Linear runtime in input size\./),
    ).toBeInTheDocument();

    // Overall feedback form is rendered (label match, not implementation).
    expect(
      within(detail).getByText(/Overall Test Feedback/i),
    ).toBeInTheDocument();

    // The More menu appears because the student is Submitted.
    expect(
      within(detail).getByRole("button", { name: /more/i }),
    ).toBeInTheDocument();
  });

  it("should reflect the URL ?mode= value in the pivot toggle — 'By question' is active when mode=question, 'By student' is inactive", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    // When: the page renders with ?mode=question.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ mode: "question" }),
    });
    render(ui);

    // Then: both pivot triggers are present, "By question" is active, "By student" is inactive.
    const byStudent = screen.getByRole("tab", { name: /By student/i });
    const byQuestion = screen.getByRole("tab", { name: /By question/i });
    expect(byStudent.getAttribute("data-state")).toBe("inactive");
    expect(byQuestion.getAttribute("data-state")).toBe("active");
  });

  it("in question-mode, the top bar's question picker names the open question and lists every question in order, each link keeping Needs grading only", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    for (const title of ["First question", "Second question", "Third question"])
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title,
        content: title,
        createdBy: "admin",
      });
    const questions = await services.questionService.listQuestions(test.id);
    const second = questions[1];

    // When: the page renders in question-mode on the second question with the filter on
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: second?.id,
          needsOnly: "1",
        }),
      }),
    );

    // Then: the picker names the open question
    const picker = screen.getByRole("button", { name: /question picker/i });
    expect(picker).toHaveTextContent("Q2 Second question");

    // And: it lists every question in order, each linking to it with the filter kept
    await userEvent.click(picker);
    const items = within(await screen.findByRole("menu")).getAllByRole(
      "menuitem",
    );
    expect(items.map((item) => item.textContent)).toEqual([
      "Q1 First question",
      "Q2 Second question",
      "Q3 Third question",
    ]);
    questions.forEach((question, index) => {
      expect(items[index]).toHaveAttribute(
        "href",
        expect.stringContaining(`questionId=${question.id}`),
      );
      expect(items[index]).toHaveAttribute(
        "href",
        expect.stringContaining("needsOnly=1"),
      );
    });
    expect(items[1]).toHaveAttribute("aria-current", "true");
  });

  it("in question-mode, ‹ › step to the previous and next question, keeping Needs grading only, and are dimmed at either end", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    for (const title of ["First", "Second", "Third"])
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title,
        content: title,
        createdBy: "admin",
      });
    const [first, second, third] = await services.questionService.listQuestions(
      test.id,
    );

    // When: the page opens on the middle question with the filter on
    const { unmount } = render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: second?.id,
          needsOnly: "1",
        }),
      }),
    );

    // Then: ‹ and › go to the neighbours with the filter kept
    const previous = screen.getByRole("link", { name: "Previous question" });
    expect(previous).toHaveAttribute(
      "href",
      expect.stringContaining(`questionId=${first?.id}`),
    );
    expect(previous).toHaveAttribute(
      "href",
      expect.stringContaining("needsOnly=1"),
    );
    const next = screen.getByRole("link", { name: "Next question" });
    expect(next).toHaveAttribute(
      "href",
      expect.stringContaining(`questionId=${third?.id}`),
    );
    expect(next).toHaveAttribute(
      "href",
      expect.stringContaining("needsOnly=1"),
    );
    unmount();

    // When: the page opens on the first question
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: first?.id,
        }),
      }),
    );

    // Then: there is nothing before it
    expect(
      screen.queryByRole("link", { name: "Previous question" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Next question" }),
    ).toBeInTheDocument();
  });

  it("in question-mode, the main pane shows the focused question and the chosen student's answer, with a box for each student in the row", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Explain Big-O",
      content: "Define O(n).",
      createdBy: "admin",
    });
    const [q] = await services.questionService.listQuestions(test.id);

    const ada = await services.studentService.createStudentDocument({
      authUserId: "auth-ada",
      username: "ada",
      name: "Ada",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, ada.id, "admin");
    await new Promise((r) => setTimeout(r, 5));
    const ben = await services.studentService.createStudentDocument({
      authUserId: "auth-ben",
      username: "ben",
      name: "Ben",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, ben.id, "admin");

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: ada.id,
      answer: { type: "free_text", text: "Ada says linear time." },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: ben.id,
      answer: { type: "free_text", text: "Ben says proportional." },
    });

    // When: rendered in question-mode with the question selected.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({
        mode: "question",
        questionId: q.id,
        studentId: ben.id,
      }),
    });
    render(ui);

    // Then: the main pane shows the question and Ben's answer only, and the
    // row has a box for each student.
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(
      within(mainPane).getAllByText(/Explain Big-O/).length,
    ).toBeGreaterThan(0);
    expect(
      within(mainPane).getByText(/Ben says proportional\./),
    ).toBeInTheDocument();
    expect(
      within(mainPane).queryByText(/Ada says linear time\./),
    ).not.toBeInTheDocument();
    const row = within(mainPane).getByTestId("question-row");
    expect(
      within(row).getByRole("button", { name: "Ada still writing" }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Ben still writing" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("should show 'X of Y' fully-graded students in the progress fraction in student-mode", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const [q1] = await services.questionService.listQuestions(test.id);

    // Given: 3 students. A + B both submitted-and-fully-graded; C is just submitted.
    const ids = [];
    for (const u of ["a", "b", "c"]) {
      const s = await services.studentService.createStudentDocument({
        authUserId: `auth-${u}`,
        username: u,
        name: u.toUpperCase(),
        createdBy: "admin",
      });
      await services.enrollmentService.enrollStudent(course.id, s.id, "admin");
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: s.id,
        answer: { type: "free_text", text: u },
      });
      await services.testSubmissionService.submitTest(test.id, s.id);
      ids.push(s.id);
    }
    // Grade A and B fully (C stays Submitted).
    for (const id of [ids[0], ids[1]]) {
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: id as string,
        score: 90,
        feedback: "ok",
        gradedBy: "admin",
      });
    }

    // When: the variant page renders in student-mode.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Then: a progress fraction reads "2 of 3" — two fully-graded, three enrolled.
    const fraction = screen.getByTestId("grading-progress-fraction");
    expect(fraction.textContent).toMatch(/2\s*of\s*3/);
  });

  it("when I'm grading question-by-question, the progress bar counts students fully graded across the whole test, not just this question", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    for (const title of ["Q1", "Q2"])
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title,
        content: title,
        createdBy: "admin",
      });
    const [q1, q2] = await services.questionService.listQuestions(test.id);

    // Given: 3 students handed in both answers; x is graded on both questions, y only on Q1, z on neither.
    const ids = [];
    for (const u of ["x", "y", "z"]) {
      const s = await services.studentService.createStudentDocument({
        authUserId: `auth-${u}`,
        username: u,
        name: u.toUpperCase(),
        createdBy: "admin",
      });
      await services.enrollmentService.enrollStudent(course.id, s.id, "admin");
      for (const question of [q1, q2])
        await services.answerService.submitAnswer({
          testId: test.id,
          questionId: (question as { id: string }).id,
          studentId: s.id,
          answer: { type: "free_text", text: u },
        });
      await services.testSubmissionService.submitTest(test.id, s.id);
      ids.push(s.id);
    }
    const grade = (studentId: string, questionId: string) =>
      services.gradeService.gradeQuestion({
        testId: test.id,
        questionId,
        studentId,
        score: 80,
        feedback: "ok",
        gradedBy: "admin",
      });
    await grade(ids[0] as string, (q1 as { id: string }).id);
    await grade(ids[0] as string, (q2 as { id: string }).id);
    await grade(ids[1] as string, (q1 as { id: string }).id);

    // When: rendered in question-mode with Q1 focused.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({
        mode: "question",
        questionId: (q1 as { id: string }).id,
      }),
    });
    render(ui);

    // Then: only x is fully graded, out of the 3 who handed in.
    expect(screen.getByTestId("grading-progress-fraction")).toHaveTextContent(
      "1 of 3 fully graded",
    );
  });

  it("when I've already asked a student to redo, opening their card shows me the read-only note and no Request redo in More", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const [q1] = await services.questionService.listQuestions(test.id);

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-redo",
      username: "redo",
      name: "Redo",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "first try" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    // Given: the admin requested this student redo the test.
    await services.redoRequestService.requestRedo(test.id, student.id, "admin");

    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ studentId: student.id }),
    });
    render(ui);

    // Then: the card says her answers are read-only while the redo is open.
    const detail = screen.getByTestId(`student-card-${student.id}`);
    expect(
      within(detail).getByText(/read-only while the redo is open/i),
    ).toBeInTheDocument();
    // And the picker lists her under Redo requested
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    expect(await screen.findByText("Redo requested · 1")).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /more/i })).toBeNull();
  });

  it("when I'm grading a student, Save & next is the only button that saves the grade", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const [q1] = await services.questionService.listQuestions(test.id);

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-snn",
      username: "snn",
      name: "Snn",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    const detail = screen.getByTestId(`student-card-${student.id}`);
    expect(
      within(detail).queryByRole("button", { name: /save grade/i }),
    ).toBeNull();
    expect(
      within(detail).getByRole("button", { name: /save & next/i }),
    ).toBeInTheDocument();
  });

  it("when the class has no students yet, I see a friendly 'no students enrolled' message instead of a blank page", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Empty Class",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });

    // When: the variant page renders with NO enrolled students.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Then: zero roster cells, and the main pane shows the empty-class
    // placeholder text (no crash).
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(
      within(mainPane).getByText(/No students enrolled/i),
    ).toBeInTheDocument();
  });
  it("when students are enrolled but nobody has handed in, I see 'Nobody has submitted yet.' and the picker still lists them", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Quiet Class",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-writing",
      username: "writing",
      name: "Still Writing",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    // When: the page renders while the only student has not handed in
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Then: the main pane says so, and the student is still in the picker
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(
      within(mainPane).getByText("Nobody has submitted yet."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    expect(
      within(await screen.findByRole("menu")).getByText("Still Writing"),
    ).toBeInTheDocument();
  });

  it.each([
    ["By student", undefined],
    ["By question", "question"],
  ])(
    "when the test has no questions, %s says 'This test has no questions yet.'",
    async (_label, mode) => {
      const services = getTestServices();
      const course = await services.courseService.createCourse({
        title: "No Questions Class",
        description: "",
        createdBy: "admin",
      });
      const test = await services.testService.createTest(course.id, {
        title: "Empty Test",
        description: "",
        createdBy: "admin",
      });
      const student = await services.studentService.createStudentDocument({
        authUserId: "auth-nq",
        username: "nq",
        name: "No Questions Stu",
        createdBy: "admin",
      });
      await services.enrollmentService.enrollStudent(
        course.id,
        student.id,
        "admin",
      );

      // When: the page renders a test that has no questions
      const ui = await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve(mode ? { mode } : {}),
      });
      render(ui);

      // Then: the main pane says so
      expect(
        within(screen.getByTestId("grading-main-pane")).getByText(
          "This test has no questions yet.",
        ),
      ).toBeInTheDocument();
    },
  );

  it("offers Release correct answers in Release ▾ only while they are withheld", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Release Course",
      description: "",
      createdBy: "admin",
    });
    const withheld = await services.testService.createTest(course.id, {
      title: "Withheld",
      description: "",
      createdBy: "admin",
      showCorrectAnswerAfterSubmit: false,
    });

    const { unmount } = render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: withheld.id }),
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^release/i }));
    expect(
      await screen.findByRole("menuitem", { name: /release correct answers/i }),
    ).toBeInTheDocument();
    unmount();

    await services.testService.releaseCorrectAnswers(withheld.id, "admin");
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: withheld.id }),
      }),
    );
    // Nothing is left to release, so the chip stands alone.
    expect(
      screen.queryByRole("button", { name: /^release/i }),
    ).not.toBeInTheDocument();
  });

  it("offers Release grades… only while grades are withheld and shows a chip without a menu once auto-show is on", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Release Course 3",
      description: "",
      createdBy: "admin",
    });
    const withheld = await services.testService.createTest(course.id, {
      title: "Withheld Grades",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: false,
    });

    const { unmount } = render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: withheld.id }),
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^release/i }));
    expect(
      await screen.findByRole("menuitem", { name: /release grades/i }),
    ).toBeInTheDocument();
    unmount();

    const autoShow = await services.testService.createTest(course.id, {
      title: "Auto Show Grades",
      description: "",
      createdBy: "admin",
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
    });
    // A stored release date must not change what an auto-show test says.
    await services.testService.releaseGrades(autoShow.id, "admin");
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: autoShow.id }),
      }),
    );
    expect(screen.getByTestId("release-state")).toHaveTextContent(
      "Shown on submit",
    );
    expect(
      screen.queryByRole("button", { name: /^release/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps Needs grading only on in the links to the next student, to By student and By question and to each student in the picker", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra 101",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Midterm",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const students = [];
    for (const name of ["Alice", "Bob"]) {
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
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: `${name}'s answer` },
      });
      await services.testSubmissionService.submitTest(test.id, student.id);
      students.push(student);
    }

    // When: the page opens with the filter on
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ needsOnly: "1" }),
    });
    render(ui);

    // Then: every way to another student or mode carries it
    expect(
      screen.getByRole("link", { name: "Next submitted student" }),
    ).toHaveAttribute("href", expect.stringContaining("needsOnly=1"));
    for (const mode of ["By student", "By question"]) {
      expect(screen.getByRole("tab", { name: mode })).toHaveAttribute(
        "href",
        expect.stringContaining("needsOnly=1"),
      );
    }
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    for (const student of students) {
      expect(
        within(await screen.findByRole("menu")).getByRole("menuitem", {
          name: new RegExp(student.name),
        }),
      ).toHaveAttribute("href", expect.stringContaining("needsOnly=1"));
    }
  });
});
