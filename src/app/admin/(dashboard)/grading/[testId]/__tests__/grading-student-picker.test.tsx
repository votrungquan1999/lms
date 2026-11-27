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
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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
    releaseGradesAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndNextAction: vi.fn(),
  }),
);

/** Seeds one free-text question and returns helpers to add students in each state. */
async function seedTest() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
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
  async function addStudent(
    name: string,
    state:
      | "graded"
      | "waiting"
      | "writing"
      | "started-blank"
      | "redo"
      | "not-started",
    username = name.toLowerCase(),
  ) {
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${name}`,
      username,
      name,
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    if (state === "started-blank") {
      await services.testStartService.recordStart(
        test.id,
        student.id,
        new Date(),
      );
    }
    if (state !== "not-started" && state !== "started-blank") {
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: `${name} answer` },
      });
    }
    if (
      state !== "writing" &&
      state !== "started-blank" &&
      state !== "not-started"
    ) {
      await services.testSubmissionService.submitTest(test.id, student.id);
      // Hand-ins must differ in time for the oldest-first order to be decidable.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (state === "graded") {
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        score: 80,
        feedback: "ok",
        gradedBy: "admin",
      });
    }
    if (state === "redo") {
      await services.redoRequestService.requestRedo(
        test.id,
        student.id,
        "admin",
      );
    }
    return student;
  }
  return { test, addStudent };
}

describe("Feature: the student picker", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("is a dropdown in the top bar that groups students as Needs grading (oldest hand-in first), Graded, Still writing, Redo requested and Not started, with no roster beside the answer", async () => {
    // Given students in every state; Zed handed in before Amy, and Bea is graded
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Amy", "waiting");
    await addStudent("Bea", "graded");
    await addStudent("Cal", "writing");
    await addStudent("Dot", "redo");
    await addStudent("Eve", "not-started");

    // When the teacher opens the grading page and the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    expect(screen.queryAllByTestId(/^roster-cell-/)).toHaveLength(0);
    await userEvent.click(
      within(screen.getByTestId("grading-top-bar")).getByRole("button", {
        name: /student picker/i,
      }),
    );

    // Then each group has its header and its students, Needs grading oldest first
    const menu = await screen.findByRole("menu");
    const lines = [
      ...menu.querySelectorAll(
        '[data-slot="dropdown-menu-label"], [role="menuitem"]',
      ),
    ].map((el) => el.textContent?.trim());
    expect(lines).toEqual([
      expect.stringContaining("Next waiting student"),
      "Needs grading · 2",
      expect.stringContaining("Zed"),
      expect.stringContaining("Amy"),
      "Graded · 1",
      expect.stringContaining("Bea"),
      "Still writing · 1",
      expect.stringContaining("Cal"),
      "Redo requested · 1",
      expect.stringContaining("Dot"),
      "Not started · 1",
      expect.stringContaining("Eve"),
    ]);
  });

  it("links every student who has work to open for, shows how much is saved or left, and lists a not-started student without a link", async () => {
    // Given a waiting student, a still-writing student with her one answer saved, and a not-started student
    const { test, addStudent } = await seedTest();
    const zed = await addStudent("Zed", "waiting");
    await addStudent("Cal", "writing");
    await addStudent("Eve", "not-started");

    // When the teacher opens the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");

    // Then the waiting student shows what is left and links to her
    const zedItem = within(menu).getByRole("menuitem", { name: /Zed/ });
    expect(zedItem).toHaveTextContent("1 left");
    expect(zedItem).toHaveAttribute(
      "href",
      expect.stringContaining(`studentId=${zed.id}`),
    );
    // And the still-writing student shows her saved answers
    expect(
      within(menu).getByRole("menuitem", { name: /Cal/ }),
    ).toHaveTextContent("1 of 1 saved");
    // And the not-started student is listed but cannot be opened
    expect(within(menu).getByRole("menuitem", { name: /Eve/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("Feature: a still-writing student with nothing saved", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("is listed as nothing saved yet and cannot be opened", async () => {
    // Given a student who started the test and saved no answer
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Sam", "started-blank");

    // When the teacher opens the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");

    // Then her row says nothing is saved, and it is disabled with no link
    const row = within(menu).getByRole("menuitem", { name: /Sam/ });
    expect(row).toHaveTextContent("nothing saved yet");
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).not.toHaveAttribute("href");
  });
});

describe("Feature: searching the student picker", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  async function openPicker(testId: string) {
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    return screen.findByRole("menu");
  }

  it("finds a student by name ignoring case and accents, and says so when nobody matches", async () => {
    // Given three students, one named Tâm
    const { test, addStudent } = await seedTest();
    await addStudent("Tâm Nguyen", "waiting", "nguyen01");
    await addStudent("Zed", "waiting");
    await addStudent("Ann", "graded");
    const menu = await openPicker(test.id);

    // When the teacher types "TAM" in the search field
    await userEvent.type(within(menu).getByRole("searchbox"), "TAM");

    // Then only Tâm is listed, under her group
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("Tâm Nguyen");
    expect(within(menu).queryByText(/Graded/)).toBeNull();

    // When the teacher types something nobody matches
    await userEvent.clear(within(menu).getByRole("searchbox"));
    await userEvent.type(within(menu).getByRole("searchbox"), "qqq");

    // Then the picker says no student matches
    expect(within(menu).queryAllByRole("menuitem")).toHaveLength(0);
    expect(within(menu).getByText("No student matches")).toBeInTheDocument();
  });

  it("finds a name starting with a capital Đ when the teacher types a plain d", async () => {
    // Given Đạt and Bob wait
    const { test, addStudent } = await seedTest();
    await addStudent("Đạt Tran", "waiting", "tran01");
    await addStudent("Bob", "waiting");
    const menu = await openPicker(test.id);

    // When the teacher types "dat"
    await userEvent.type(within(menu).getByRole("searchbox"), "dat");

    // Then only Đạt is listed
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("Đạt Tran");
  });

  it("tells two students with the same name apart by @username and finds one by it", async () => {
    // Given two students both named Sam, with different usernames
    const { test, addStudent } = await seedTest();
    await addStudent("Sam", "waiting", "sam.a");
    const second = await addStudent("Sam", "waiting", "sam.b");
    const menu = await openPicker(test.id);

    // Then each Sam row shows her own @username before any search
    const rows = within(menu).getAllByRole("menuitem", { name: /^Sam/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("@sam.a");
    expect(rows[1]).toHaveTextContent("@sam.b");

    // When the teacher searches for @sam.b
    await userEvent.type(within(menu).getByRole("searchbox"), "@SAM.b");

    // Then only the second Sam is listed
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute(
      "href",
      expect.stringContaining(`studentId=${second.id}`),
    );
  });
});

describe("Feature: Next waiting student in the student picker", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  async function openPicker(testId: string) {
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    return screen.findByRole("menu");
  }

  it("opens the oldest waiting student other than the one shown, skipping graded students", async () => {
    // Given Zed, Yan and Xin wait, handed in in that order (Zed is the one shown), and Ann is graded
    const { test, addStudent } = await seedTest();
    await addStudent("Ann", "graded");
    await addStudent("Zed", "waiting");
    const yan = await addStudent("Yan", "waiting");
    await addStudent("Xin", "waiting");

    // When the teacher opens the picker
    const menu = await openPicker(test.id);

    // Then "Next waiting student" links to Yan, the oldest waiting student after Zed
    const next = within(menu).getByRole("menuitem", {
      name: /Next waiting student/,
    });
    expect(next).toHaveAttribute(
      "href",
      expect.stringContaining(`studentId=${yan.id}`),
    );
  });

  it("is disabled when no other student waits", async () => {
    // Given Zed is the only waiting student and is the one shown
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Ann", "graded");

    // When the teacher opens the picker
    const menu = await openPicker(test.id);

    // Then "Next waiting student" cannot be used
    expect(
      within(menu).getByRole("menuitem", { name: /Next waiting student/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Feature: ‹ › step through the students who handed in, in picker order", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  async function openAt(testId: string, studentId: string) {
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId }),
        searchParams: Promise.resolve({ studentId }),
      }),
    );
    return screen.getByTestId("grading-student-position");
  }

  it("goes through Needs grading (oldest first) then Graded, never landing on a student with an open redo", async () => {
    // Given Bea, enrolled first, is graded; Zed and Amy wait (Zed handed in first); and Dot, enrolled last, has an open redo
    const { test, addStudent } = await seedTest();
    const bea = await addStudent("Bea", "graded");
    const zed = await addStudent("Zed", "waiting");
    const amy = await addStudent("Amy", "waiting");
    await addStudent("Dot", "redo");

    // When the teacher opens Amy
    const position = await openAt(test.id, amy.id);

    // Then she is 2 of 3, ‹ opens Zed and › opens Bea
    expect(position).toHaveTextContent(/2 of 3 submitted/);
    expect(
      within(position).getByRole("link", {
        name: "Previous submitted student",
      }),
    ).toHaveAttribute("href", expect.stringContaining(`studentId=${zed.id}`));
    expect(
      within(position).getByRole("link", { name: "Next submitted student" }),
    ).toHaveAttribute("href", expect.stringContaining(`studentId=${bea.id}`));
  });

  it("stops after the last graded student instead of stepping on to a student with an open redo", async () => {
    // Given Bea is the last of the students who handed in, and Dot has an open redo
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    const bea = await addStudent("Bea", "graded");
    await addStudent("Dot", "redo");

    // When the teacher opens Bea
    const position = await openAt(test.id, bea.id);

    // Then there is no next student
    expect(position).toHaveTextContent(/2 of 2 submitted/);
    expect(
      within(position).queryByRole("link", { name: "Next submitted student" }),
    ).toBeNull();
  });

  it("from a student outside the list, › opens the first student and ‹ the last, and the place reads – of N", async () => {
    // Given Zed waits, Bea is graded, and Dot has an open redo
    const { test, addStudent } = await seedTest();
    const zed = await addStudent("Zed", "waiting");
    const bea = await addStudent("Bea", "graded");
    const dot = await addStudent("Dot", "redo");

    // When the teacher opens Dot
    const position = await openAt(test.id, dot.id);

    // Then the place has no number, › goes to Zed and ‹ to Bea
    expect(position).toHaveTextContent(/–\s*of 2 submitted/);
    expect(
      within(position).getByRole("link", { name: "Next submitted student" }),
    ).toHaveAttribute("href", expect.stringContaining(`studentId=${zed.id}`));
    expect(
      within(position).getByRole("link", {
        name: "Previous submitted student",
      }),
    ).toHaveAttribute("href", expect.stringContaining(`studentId=${bea.id}`));
  });
});

describe("Feature: opening a still-writing student from the picker", () => {
  beforeEach(async () => {
    pushMock.mockClear();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  async function pickStillWriting(testId: string, name: RegExp) {
    render(await GradingVariantPage({ params: Promise.resolve({ testId }) }));
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name }));
    return screen.findByRole("alertdialog");
  }

  it("asks first, naming the student, the test and how many answers are saved", async () => {
    // Given Zed waits and Ana Cal is still writing with her one answer saved
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Ana Cal", "writing");
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");

    // When the teacher picks her
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /Ana Cal/ }),
    );

    // Then a dialog asks before opening her
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Ana Cal is still writing. Grade anyway?",
      }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Ana Cal hasn't submitted Midterm. You'll see the 1 of 1 answers saved so far.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Grade anyway" }),
    ).toBeInTheDocument();
  });

  it("opens her only after the teacher presses Grade anyway", async () => {
    // Given the dialog asking about Ana Cal is open
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    const ana = await addStudent("Ana Cal", "writing");
    const dialog = await pickStillWriting(test.id, /Ana Cal/);
    expect(pushMock).not.toHaveBeenCalled();

    // When the teacher presses Grade anyway
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Grade anyway" }),
    );

    // Then the screen goes to her
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining(`studentId=${ana.id}`),
    );
  });

  it("stays on the open student when the teacher cancels", async () => {
    // Given the dialog asking about Ana Cal is open
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Ana Cal", "writing");
    const dialog = await pickStillWriting(test.id, /Ana Cal/);

    // When the teacher presses Cancel
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    // Then the dialog closes and the screen does not move
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("tells the teacher under the Still writing heading that opening a student asks first", async () => {
    // Given a still-writing student
    const { test, addStudent } = await seedTest();
    await addStudent("Zed", "waiting");
    await addStudent("Ana Cal", "writing");

    // When the teacher opens the picker
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");

    // Then the group carries the note
    const group = within(menu)
      .getByText("Still writing · 1")
      .closest("[role=group]");
    expect(group).toHaveTextContent("asks first");
  });
});
