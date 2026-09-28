import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import {
  createTestAction,
  disableInviteLinkAction,
  getInviteLinkAction,
  regenerateInviteLinkAction,
  setEnrollmentsAction,
} from "../courses/[courseId]/actions";
import {
  addCourseMaterialAction,
  removeCourseMaterialAction,
  requestMaterialUploadSlotsAction,
} from "../courses/[courseId]/material-actions";
import { MaterialContentType } from "../courses/[courseId]/material-upload.schema";
import {
  addQuestionAction,
  deleteQuestionAction,
  deleteTestAction,
  importQuestionsAction,
  updateQuestionAction,
} from "../courses/[courseId]/tests/[testId]/actions";
import { composeFromPoolsAction } from "../courses/[courseId]/tests/[testId]/compose-from-pools-actions";
import { importAiQuestionsAction } from "../courses/[courseId]/tests/[testId]/import-ai/actions";
import { setTestSettingsAction } from "../courses/[courseId]/tests/[testId]/settings-actions";

interface School {
  id: string;
  name: string;
}

/**
 * Signs in as the admin of a new, NON-default school, so an entry point that
 * forgets to scope its lookup shows the foreign data seeded in the default
 * school and the row fails.
 */
async function signInAsOtherSchoolAdmin(): Promise<School> {
  const school = await addTestSchool("School B");
  requireAdminSession.mockResolvedValue({
    userId: "admin-b",
    role: "admin",
    school,
  });
  return school;
}

/** Creates a course in the DEFAULT school — a foreign record for these rows. */
async function createForeignCourse(): Promise<string> {
  const course = await getTestServices().courseService.createCourse({
    title: "Foreign Course",
    description: "",
    createdBy: "default-school-admin",
  });
  return course.id;
}

/** Creates a course + test in the DEFAULT school. */
async function createForeignTest(): Promise<{
  courseId: string;
  testId: string;
}> {
  const courseId = await createForeignCourse();
  const test = await getTestServices().testService.createTest(courseId, {
    title: "Foreign Test",
    description: "",
    createdBy: "default-school-admin",
  });
  return { courseId, testId: test.id };
}

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: a school admin can never change another school's course by id
 * As a school admin working in one school
 * I want the invite-link, material and enrolment actions to refuse another
 * school's course id
 * So that another school's course can never be changed through mine
 */
describe("Feature: a school admin can never change another school's course by id", () => {
  it("getInviteLinkAction refuses a foreign course and mints no token", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();
    const formData = new FormData();
    formData.set("courseId", courseId);

    const result = await getInviteLinkAction(null, formData);

    expect(result.success).toBe(false);
    const foreign = await getTestServices().courseService.getCourse(courseId);
    expect(foreign?.inviteToken).toBeNull();
  });

  it("regenerateInviteLinkAction refuses a foreign course and leaves its token untouched", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();
    const oldToken =
      await getTestServices().courseService.getOrCreateInviteToken(courseId);
    const formData = new FormData();
    formData.set("courseId", courseId);

    const result = await regenerateInviteLinkAction(null, formData);

    expect(result.success).toBe(false);
    const foreign = await getTestServices().courseService.getCourse(courseId);
    expect(foreign?.inviteToken).toBe(oldToken);
  });

  it("disableInviteLinkAction refuses a foreign course and leaves its token active", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();
    const token =
      await getTestServices().courseService.getOrCreateInviteToken(courseId);
    const formData = new FormData();
    formData.set("courseId", courseId);

    const result = await disableInviteLinkAction(null, formData);

    expect(result.success).toBe(false);
    const foreign = await getTestServices().courseService.getCourse(courseId);
    expect(foreign?.inviteToken).toBe(token);
  });

  it("addCourseMaterialAction refuses a foreign course and adds nothing", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();

    const result = await addCourseMaterialAction(courseId, {
      key: `materials/courses/${courseId}/a.pdf`,
      contentType: MaterialContentType.PDF,
      fileName: "a.pdf",
      size: 100,
    });

    expect(result.success).toBe(false);
    const foreign = await getTestServices().courseService.getCourse(courseId);
    expect(foreign?.materials).toHaveLength(0);
  });

  it("removeCourseMaterialAction refuses a foreign course and removes nothing", async () => {
    const courseId = await createForeignCourse();
    const key = `materials/courses/${courseId}/a.pdf`;
    await getTestServices().courseService.addCourseMaterial(courseId, {
      key,
      contentType: "application/pdf",
      fileName: "a.pdf",
      size: 100,
    });
    await signInAsOtherSchoolAdmin();

    const result = await removeCourseMaterialAction(courseId, key);

    expect(result.success).toBe(false);
    const foreign = await getTestServices().courseService.getCourse(courseId);
    expect(foreign?.materials).toHaveLength(1);
  });

  it("requestMaterialUploadSlotsAction refuses a foreign course and mints no slots", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();

    const result = await requestMaterialUploadSlotsAction(courseId, [
      { fileName: "a.pdf", contentType: "application/pdf", size: 100 },
    ]);

    expect(result.success).toBe(false);
    expect(result.slots).toBeUndefined();
  });

  it("createTestAction refuses a foreign course and creates no test anywhere", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();
    const formData = new FormData();
    formData.set("courseId", courseId);
    formData.set("title", "Quiz");
    formData.set("description", "");

    const result = await createTestAction(null, formData);

    expect(result.success).toBe(false);
    expect(await getTestServices(school.id).testService.listAllTests()).toEqual(
      [],
    );
    expect(await getTestServices().testService.listTests(courseId)).toEqual([]);
  });

  it("setEnrollmentsAction refuses a foreign course and enrolls nobody", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();
    const student =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-foreign-student",
        username: "foreign.student",
        name: "Foreign Student",
        createdBy: "default-school-admin",
      });
    const formData = new FormData();
    formData.set("courseId", courseId);
    formData.append("studentIds", student.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().enrollmentService.listEnrollmentsByCourse(
        courseId,
      ),
    ).toEqual([]);
  });

  it("setEnrollmentsAction on a foreign course leaves its already-enrolled students untouched, even when trying to remove them", async () => {
    await signInAsOtherSchoolAdmin();
    const courseId = await createForeignCourse();
    const student =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-foreign-enrolled",
        username: "foreign.enrolled",
        name: "Foreign Enrolled Student",
        createdBy: "default-school-admin",
      });
    await getTestServices().enrollmentService.enrollStudent(
      courseId,
      student.id,
      "default-school-admin",
    );
    // desired is empty and observed names the enrolled student — a legitimate
    // dialog would use this shape to unenroll them; the foreign course check
    // must refuse before that ever runs.
    const formData = new FormData();
    formData.set("courseId", courseId);
    formData.append("observedStudentIds", student.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().enrollmentService.listEnrollmentsByCourse(
        courseId,
      ),
    ).toEqual([student.id]);
  });

  it("setEnrollmentsAction still enrolls a student in the admin's own course", async () => {
    requireAdminSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      school: TEST_SCHOOL,
    });
    const course = await getTestServices().courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-1",
    });
    const student =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-own-student",
        username: "own.student",
        name: "Own Student",
        createdBy: "admin-1",
      });
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("studentIds", student.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      await getTestServices().enrollmentService.listEnrollmentsByCourse(
        course.id,
      ),
    ).toEqual([student.id]);
  });

  it("createTestAction still creates a test in the admin's own course", async () => {
    const course = await getTestServices().courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-1",
    });
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.set("title", "Quiz");
    formData.set("description", "");
    requireAdminSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      school: TEST_SCHOOL,
    });

    const result = await createTestAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      (await getTestServices().testService.listTests(course.id)).map(
        (t) => t.title,
      ),
    ).toEqual(["Quiz"]);
  });
});

/**
 * Feature: a school admin can never change another school's test or its
 * questions
 * As a school admin working in one school
 * I want a test id that belongs to another school (or another course) to be
 * refused by every test- and question-level write
 * So that another school's test data can never be changed through mine
 */
describe("Feature: a school admin can never change another school's test or its questions", () => {
  it("setTestSettingsAction refuses a foreign test and leaves its settings unchanged", async () => {
    await signInAsOtherSchoolAdmin();
    const { courseId, testId } = await createForeignTest();
    const before = await getTestServices().testService.getTest(testId);
    const formData = new FormData();
    formData.set("testId", testId);
    formData.set("courseId", courseId);
    formData.set("showGradeAfterSubmit", "false");
    formData.set("showCorrectAnswerAfterSubmit", "false");
    formData.set("isPractice", "false");
    formData.set("answerRevealMode", "diff");

    const result = await setTestSettingsAction(null, formData);

    expect(result.success).toBe(false);
    const after = await getTestServices().testService.getTest(testId);
    expect(after?.showGradeAfterSubmit).toBe(before?.showGradeAfterSubmit);
  });

  it("deleteTestAction refuses a foreign test and leaves it un-deleted", async () => {
    await signInAsOtherSchoolAdmin();
    const { courseId, testId } = await createForeignTest();
    const formData = new FormData();
    formData.set("testId", testId);
    formData.set("courseId", courseId);

    const result = await deleteTestAction(null, formData);

    expect(result.success).toBe(false);
    expect(await getTestServices().testService.getTest(testId)).not.toBeNull();
  });

  it("addQuestionAction refuses a foreign test and adds no question", async () => {
    await signInAsOtherSchoolAdmin();
    const { courseId, testId } = await createForeignTest();
    const formData = new FormData();
    formData.set("type", "free_text");
    formData.set("testId", testId);
    formData.set("courseId", courseId);
    formData.set("title", "Q1");
    formData.set("content", "content");

    const result = await addQuestionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toEqual([]);
  });

  it("updateQuestionAction refuses a foreign test and leaves the question unchanged", async () => {
    const { courseId, testId } = await createForeignTest();
    const question = await getTestServices().questionService.addQuestion(
      testId,
      { type: "free_text", title: "Original", content: "c", createdBy: "x" },
    );
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("questionId", question.id);
    formData.set("testId", testId);
    formData.set("courseId", courseId);
    formData.set("title", "Hacked");

    const result = await updateQuestionAction(null, formData);

    expect(result.success).toBe(false);
    const reloaded =
      await getTestServices().questionService.listQuestions(testId);
    expect(reloaded[0].title).toBe("Original");
  });

  it("deleteQuestionAction refuses a foreign test and leaves the question in place", async () => {
    const { courseId, testId } = await createForeignTest();
    const question = await getTestServices().questionService.addQuestion(
      testId,
      { type: "free_text", title: "Q1", content: "c", createdBy: "x" },
    );
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("questionId", question.id);
    formData.set("testId", testId);
    formData.set("courseId", courseId);

    const result = await deleteQuestionAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toHaveLength(1);
  });

  it("importQuestionsAction refuses a foreign test and imports nothing", async () => {
    await signInAsOtherSchoolAdmin();
    const { courseId, testId } = await createForeignTest();
    const formData = new FormData();
    formData.set("testId", testId);
    formData.set("courseId", courseId);
    formData.set(
      "file",
      new File(
        [JSON.stringify([{ title: "Q1", content: "c" }])],
        "questions.json",
        { type: "application/json" },
      ),
    );

    const result = await importQuestionsAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toEqual([]);
  });

  it("composeFromPoolsAction refuses a foreign test and adds no question", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    // A real, drawable own-school pool — so refusal can only come from the
    // foreign-test check, never a "pool has no questions" false green.
    const pool = await own.questionPoolService.createPool({
      name: "Own Pool",
      description: "",
      createdBy: "admin-b",
    });
    await own.poolQuestionService.addPoolQuestion(pool.id, {
      type: "free_text",
      title: "Pool Q1",
      content: "c",
      createdBy: "admin-b",
    });
    const { courseId, testId } = await createForeignTest();
    const formData = new FormData();
    formData.set("testId", testId);
    formData.set("courseId", courseId);
    formData.set("selections", JSON.stringify([{ poolId: pool.id, count: 1 }]));

    const result = await composeFromPoolsAction(null, formData);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toEqual([]);
  });

  it("importAiQuestionsAction (append) refuses a foreign test and writes nothing", async () => {
    await signInAsOtherSchoolAdmin();
    const { courseId, testId } = await createForeignTest();

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      [{ title: "Q1", content: "c", type: "free_text" }],
      "append",
    );

    expect(result.success).toBe(false);
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toEqual([]);
  });

  it("importAiQuestionsAction (replace) refuses a foreign test before deleting any question", async () => {
    await signInAsOtherSchoolAdmin();
    const { courseId, testId } = await createForeignTest();
    await getTestServices().questionService.addQuestion(testId, {
      type: "free_text",
      title: "Existing",
      content: "c",
      createdBy: "x",
    });

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      [{ title: "New", content: "c", type: "free_text" }],
      "replace",
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Test not found");
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toHaveLength(1);
  });

  it("refuses a test id that belongs to a different course in the SAME school", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const courseA = await own.courseService.createCourse({
      title: "Course A",
      description: "",
      createdBy: "admin-b",
    });
    const courseB = await own.courseService.createCourse({
      title: "Course B",
      description: "",
      createdBy: "admin-b",
    });
    const test = await own.testService.createTest(courseA.id, {
      title: "Test",
      description: "",
      createdBy: "admin-b",
    });
    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", courseB.id);

    const result = await deleteTestAction(null, formData);

    expect(result.success).toBe(false);
    expect(await own.testService.getTest(test.id)).not.toBeNull();
  });

  it.each([
    [
      "updateQuestionAction",
      (formData: FormData) => {
        formData.set("title", "Hacked");
        return updateQuestionAction(null, formData);
      },
    ],
    [
      "deleteQuestionAction",
      (formData: FormData) => deleteQuestionAction(null, formData),
    ],
  ])(
    "%s refuses a question id that belongs to a different test in the SAME school",
    async (_name, act) => {
      const school = await signInAsOtherSchoolAdmin();
      const own = getTestServices(school.id);
      const course = await own.courseService.createCourse({
        title: "Course",
        description: "",
        createdBy: "admin-b",
      });
      const testA = await own.testService.createTest(course.id, {
        title: "Test A",
        description: "",
        createdBy: "admin-b",
      });
      const testB = await own.testService.createTest(course.id, {
        title: "Test B",
        description: "",
        createdBy: "admin-b",
      });
      const questionOnA = await own.questionService.addQuestion(testA.id, {
        type: "free_text",
        title: "On A",
        content: "c",
        createdBy: "admin-b",
      });
      const formData = new FormData();
      formData.set("questionId", questionOnA.id);
      formData.set("testId", testB.id);
      formData.set("courseId", course.id);

      const result = await act(formData);

      expect(result).toEqual({ success: false, message: "Question not found" });
      const onA = await own.questionService.listQuestions(testA.id);
      expect(onA.map((question) => question.title)).toEqual(["On A"]);
    },
  );
});
