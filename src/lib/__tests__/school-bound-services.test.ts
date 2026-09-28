import type { Db } from "mongodb";
import { CourseService } from "src/lib/course-service";
import {
  getAiGradeService,
  getAnswerService,
  getCourseService,
  getGradeService,
  getGradeVisibilityService,
  getQuestionService,
  getRedoRequestService,
  getStudentService,
  getTestService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { StudentService } from "src/lib/student-service";
import { TestService } from "src/lib/test-service";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Every real getter whose service is built on one school's tests. */
const TEST_BOUND_GETTERS = {
  getTestService,
  getAiGradeService,
  getAnswerService,
  getGradeService,
  getGradeVisibilityService,
  getQuestionService,
  getRedoRequestService,
  getTestStatusService,
  getTestSubmissionService,
};

const TEST_BOUND_GETTER_NAMES = Object.keys(
  TEST_BOUND_GETTERS,
) as (keyof typeof TEST_BOUND_GETTERS)[];

/**
 * Feature: a school's course service only ever sees that school's courses
 * As the LMS system
 * I want every course service to be built for one school
 * So that no list or lookup by several ids can reach another school's courses
 */
describe("Feature: a school's course service only ever sees that school's courses", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("returns none of another school's courses from a lookup by ids", async () => {
    const otherSchool = await addTestSchool("School B");
    const foreign = await getTestServices().courseService.createCourse({
      title: "Foreign Course",
      description: "",
      createdBy: "default-school-admin",
    });
    const own = await getTestServices(
      otherSchool.id,
    ).courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "school-b-admin",
    });

    const courses = await getTestServices(
      otherSchool.id,
    ).courseService.getCoursesByIds([foreign.id, own.id]);

    expect(courses.map((course) => course.title)).toEqual(["Own Course"]);
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])("refuses to build a course service for %s school", (_label, schoolId) => {
    expect(() => new CourseService(db, schoolId as string)).toThrow(
      "A school is required",
    );
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])("the real course getter refuses %s school", async (_label, schoolId) => {
    await expect(getCourseService(schoolId as string)).rejects.toThrow(
      "A school is required",
    );
  });
});

/**
 * Feature: a school's test service only ever lists that school's tests
 * As the LMS system
 * I want every test service to be built for one school
 * So that no list of tests can reach another school's tests
 */
describe("Feature: a school's test service only ever lists that school's tests", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lists none of another school's tests for that school's course", async () => {
    const otherSchool = await addTestSchool("School B");
    const foreignCourse = await getTestServices().courseService.createCourse({
      title: "Foreign Course",
      description: "",
      createdBy: "default-school-admin",
    });
    await getTestServices().testService.createTest(foreignCourse.id, {
      title: "Foreign Test",
      description: "",
      createdBy: "default-school-admin",
    });

    const tests = await getTestServices(otherSchool.id).testService.listTests(
      foreignCourse.id,
    );

    expect(tests).toEqual([]);
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])("refuses to build a test service for %s school", (_label, schoolId) => {
    expect(() => new TestService(db, schoolId as string)).toThrow(
      "A school is required",
    );
  });

  it.each(
    TEST_BOUND_GETTER_NAMES.flatMap((name) => [
      [name, "undefined", undefined],
      [name, "an empty string", ""],
    ]),
  )("the real %s refuses %s school", async (name, _label, schoolId) => {
    const getter = TEST_BOUND_GETTERS[name as keyof typeof TEST_BOUND_GETTERS];

    await expect(getter(schoolId as string)).rejects.toThrow(
      "A school is required",
    );
  });
});

/**
 * Feature: a student service is only ever built for one school
 * As the LMS system
 * I want a student service with no school to be refused
 * So that it can never list or create students with no school
 */
describe("Feature: a student service is only ever built for one school", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])("refuses to build a student service for %s school", (_label, schoolId) => {
    expect(() => new StudentService(db, schoolId as string)).toThrow(
      "A school is required",
    );
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])("the real student getter refuses %s school", async (_label, schoolId) => {
    await expect(getStudentService(schoolId as string)).rejects.toThrow(
      "A school is required",
    );
  });

  it("the mocked student getter refuses an undefined school instead of falling back to the default one", async () => {
    const { getStudentService: mockedGetStudentService } =
      servicesSingletonMockFactory();

    await expect(
      mockedGetStudentService(undefined as unknown as string),
    ).rejects.toThrow("A school is required");
  });
});

/**
 * Feature: the test harness routes school-bound services strictly by school
 * As a developer writing isolation tests
 * I want the mocked getters to hand out only the named school's services
 * So that a getter call missing its school fails the test instead of
 * silently reading the default school
 */
describe("Feature: the test harness routes school-bound services strictly by school", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("the mocked course getter refuses an undefined school instead of falling back to the default one", async () => {
    const { getCourseService: mockedGetCourseService } =
      servicesSingletonMockFactory();

    await expect(
      mockedGetCourseService(undefined as unknown as string),
    ).rejects.toThrow("A school is required");
  });

  it.each(TEST_BOUND_GETTER_NAMES)(
    "the mocked %s refuses an undefined school instead of falling back to the default one",
    async (name) => {
      const mockedGetter = servicesSingletonMockFactory()[name];

      await expect(
        mockedGetter(undefined as unknown as string),
      ).rejects.toThrow("A school is required");
    },
  );

  it("the mocked course getter refuses a school the test never created", async () => {
    const { getCourseService: mockedGetCourseService } =
      servicesSingletonMockFactory();

    await expect(mockedGetCourseService("no-such-school")).rejects.toThrow(
      'No test school "no-such-school"',
    );
  });

  it("the mocked course getter for another school cannot read a course seeded through the default services", async () => {
    const otherSchool = await addTestSchool("School B");
    await getTestServices().courseService.createCourse({
      title: "Default School Course",
      description: "",
      createdBy: "default-school-admin",
    });
    const { getCourseService: mockedGetCourseService } =
      servicesSingletonMockFactory();

    const courseService = await mockedGetCourseService(otherSchool.id);

    expect(await courseService.listCourses()).toEqual([]);
  });
});
