// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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
    gradeQuestionAction: vi.fn(),
    setTestFeedbackAction: vi.fn(),
    releaseGradesAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndJumpToNextAction: vi.fn(),
  }),
);

describe("Feature: GradingVariantPage", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the test title and course title in the header, plus a roster cell for the enrolled student", async () => {
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

    // Header shows test + course title
    expect(
      screen.getByRole("heading", { name: /Midterm/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Algebra 101/)).toBeInTheDocument();

    // Body renders the roster cell for the enrolled student.
    expect(screen.getByTestId(`roster-cell-${student.id}`)).toBeInTheDocument();
  });

  it("should render a roster of enrolled students in newest-first enrollment order and show the first student in the main pane", async () => {
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

    // Given: three students enrolled sequentially. Newest-first ordering
    // means the third-enrolled student appears first in the roster.
    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-alice",
      username: "alice",
      name: "Alice",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      alice.id,
      "admin",
    );
    // Small delay so subsequent enrollments land on distinct millisecond ticks
    // (enrolledAt: -1 sort depends on monotonic timestamps).
    await new Promise((r) => setTimeout(r, 5));

    const bob = await services.studentService.createStudentDocument({
      authUserId: "auth-bob",
      username: "bob",
      name: "Bob",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, bob.id, "admin");
    await new Promise((r) => setTimeout(r, 5));

    const carol = await services.studentService.createStudentDocument({
      authUserId: "auth-carol",
      username: "carol",
      name: "Carol",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      carol.id,
      "admin",
    );

    // When: the variant page renders.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Then: roster cells appear in newest-first enrollment order (Carol, Bob, Alice).
    const rosterCells = screen.getAllByTestId(/^roster-cell-/);
    expect(rosterCells.map((c) => c.getAttribute("data-testid"))).toEqual([
      `roster-cell-${carol.id}`,
      `roster-cell-${bob.id}`,
      `roster-cell-${alice.id}`,
    ]);

    // Then: the main pane shows the first (newest-enrolled) student.
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(
      within(mainPane).getByTestId(`student-card-${carol.id}`),
    ).toBeInTheDocument();
  });

  it("should render each roster cell with the student name, a status badge, and an 'n/m graded' count", async () => {
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
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q2",
      content: "Q2",
      createdBy: "admin",
    });
    const [q1] = await services.questionService.listQuestions(test.id);

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-z",
      username: "zara",
      name: "Zara",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    // Given: Zara answered Q1 and submitted the test (status = submitted,
    // 1 of 1 answered question is ungraded).
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    // When: the variant page renders.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Then: the roster cell contains the name, a status badge, and the
    // literal "0/1 graded" count text.
    const cell = screen.getByTestId(`roster-cell-${student.id}`);
    expect(within(cell).getByText("Zara")).toBeInTheDocument();
    const badge = cell.querySelector("[data-status]");
    expect(badge?.getAttribute("data-status")).toBe("submitted");
    expect(within(cell).getByText("0/1 graded")).toBeInTheDocument();
  });

  it("should focus the student identified by ?studentId= in the main pane and mark that roster cell aria-current", async () => {
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

    // Then: Alice's roster cell is marked aria-current; Bob's is not.
    const aliceCell = screen.getByTestId(`roster-cell-${alice.id}`);
    const bobCell = screen.getByTestId(`roster-cell-${bob.id}`);
    expect(aliceCell.closest('[aria-current="page"]')).not.toBeNull();
    expect(bobCell.closest('[aria-current="page"]')).toBeNull();
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

    // Auto-grade button appears because the student is Submitted.
    expect(
      within(detail).getByRole("button", { name: /Auto-grade with AI/i }),
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

  it("in question-mode, the roster lists questions (one cell per question) instead of students, ordered by question.order", async () => {
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
    // Add three questions in known order; listQuestions returns by order asc.
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "First question",
      content: "Q1",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Second question",
      content: "Q2",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Third question",
      content: "Q3",
      createdBy: "admin",
    });
    const questions = await services.questionService.listQuestions(test.id);

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

    // When: the page renders in question-mode.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ mode: "question" }),
    });
    render(ui);

    // Then: the roster contains one cell per question (no student cells).
    const roster = screen.getByTestId("grading-roster");
    const questionCells = within(roster).getAllByTestId(
      /^roster-question-cell-/,
    );
    expect(questionCells.map((c) => c.getAttribute("data-testid"))).toEqual(
      questions.map((q) => `roster-question-cell-${q.id}`),
    );
    // And: no student cells appear in the roster while in question-mode.
    expect(within(roster).queryAllByTestId(/^roster-cell-/)).toHaveLength(0);
  });

  it("in question-mode, the main pane shows the focused question's title and one row per student with their answer text", async () => {
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
      searchParams: Promise.resolve({ mode: "question", questionId: q.id }),
    });
    render(ui);

    // Then: main pane shows the question title and both students' answers,
    // each row scoped to its `student-card-${id}` selector.
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(within(mainPane).getByText(/Explain Big-O/)).toBeInTheDocument();

    const adaRow = within(mainPane).getByTestId(`student-card-${ada.id}`);
    expect(
      within(adaRow).getByText(/Ada says linear time\./),
    ).toBeInTheDocument();

    const benRow = within(mainPane).getByTestId(`student-card-${ben.id}`);
    expect(
      within(benRow).getByText(/Ben says proportional\./),
    ).toBeInTheDocument();
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

  it("when I'm grading question-by-question, the progress bar tells me how many students I've graded on this question", async () => {
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

    // Given: 3 students enrolled, 2 graded on q1.
    const ids = [];
    for (const u of ["x", "y", "z"]) {
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
      ids.push(s.id);
    }
    for (const id of [ids[0], ids[1]]) {
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: id as string,
        score: 80,
        feedback: "ok",
        gradedBy: "admin",
      });
    }

    // When: rendered in question-mode with q1 focused.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ mode: "question", questionId: q1.id }),
    });
    render(ui);

    // Then: progress fraction shows 2 of 3.
    const fraction = screen.getByTestId("grading-progress-fraction");
    expect(fraction.textContent).toMatch(/2\s*of\s*3/);
  });

  it("should order the roster alphabetically by name when ?sort=name, regardless of enrollment order", async () => {
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

    // Given: 3 students enrolled in non-alphabetical order (Carol → Alice → Bob).
    const carol = await services.studentService.createStudentDocument({
      authUserId: "auth-c",
      username: "carol",
      name: "Carol",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, carol.id, "admin");
    await new Promise((r) => setTimeout(r, 5));
    const alice = await services.studentService.createStudentDocument({
      authUserId: "auth-a",
      username: "alice",
      name: "Alice",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, alice.id, "admin");
    await new Promise((r) => setTimeout(r, 5));
    const bob = await services.studentService.createStudentDocument({
      authUserId: "auth-b",
      username: "bob",
      name: "Bob",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(course.id, bob.id, "admin");

    // When: the page renders with ?sort=name.
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ sort: "name" }),
    });
    render(ui);

    // Then: roster cells appear in alphabetical order (Alice, Bob, Carol).
    // Newest-first enrollment would be (Bob, Alice, Carol) — different result.
    const cells = screen.getAllByTestId(/^roster-cell-/);
    expect(cells.map((c) => c.getAttribute("data-testid"))).toEqual([
      `roster-cell-${alice.id}`,
      `roster-cell-${bob.id}`,
      `roster-cell-${carol.id}`,
    ]);
  });

  it("when I finish grading a student, their card stays in the same spot in the list (no surprise reorder)", async () => {
    // Locks in the user's stated problem: 'when i finish grading a test, it
    // jumps un expectedly.'
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

    // Given: 3 students enrolled. Capture the initial render order.
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
      await new Promise((r) => setTimeout(r, 5));
    }

    const ui1 = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    const { unmount } = render(ui1);
    const initialOrder = screen
      .getAllByTestId(/^roster-cell-/)
      .map((c) => c.getAttribute("data-testid"));
    unmount();

    // When: the admin grades the first student in the roster (which would
    // have caused the legacy body to re-sort that card to the Graded slot).
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: ids[0] as string,
      score: 90,
      feedback: "ok",
      gradedBy: "admin",
    });

    // Then: re-rendering with the SAME (default) sort produces the SAME order.
    const ui2 = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui2);
    const afterGradeOrder = screen
      .getAllByTestId(/^roster-cell-/)
      .map((c) => c.getAttribute("data-testid"));

    expect(afterGradeOrder).toEqual(initialOrder);
  });

  it("when I've already asked a student to redo, opening their card shows me a 'Redo requested' marker instead of the Request-Redo button", async () => {
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
    await services.enrollmentService.enrollStudent(course.id, student.id, "admin");
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "first try" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    // Given: the admin requested this student redo the test.
    await services.redoRequestService.requestRedo(
      test.id,
      student.id,
      "admin",
    );

    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ studentId: student.id }),
    });
    render(ui);

    // Then: the "Redo requested" marker appears in place of the request
    // button — the user can see the redo state at a glance.
    const detail = screen.getByTestId(`student-card-${student.id}`);
    expect(
      within(detail).getByText(/Redo requested/i),
    ).toBeInTheDocument();
    expect(
      within(detail).queryByRole("button", { name: /request redo/i }),
    ).toBeNull();
  });

  it("when I'm grading a student, I see a 'Save & Next' button alongside the Save Grade button on each question's form", async () => {
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
    // Both buttons are visible — "Save Grade" and "Save & Next" — so I can
    // choose whether to keep reviewing the current student or move on.
    expect(
      within(detail).getByRole("button", { name: /save grade/i }),
    ).toBeInTheDocument();
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
    expect(screen.queryAllByTestId(/^roster-cell-/)).toHaveLength(0);
    const mainPane = screen.getByTestId("grading-main-pane");
    expect(within(mainPane).getByText(/No students enrolled/i)).toBeInTheDocument();
  });
});
