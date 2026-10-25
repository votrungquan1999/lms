import type { Db } from "mongodb";
import {
  CourseJoinRequestService,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { PoolQuestionService } from "src/lib/pool-question-service";
import { QuestionPoolService } from "src/lib/question-pool-service";
import {
  getAiGradeService,
  getAnnotationService,
  getAnswerService,
  getCourseJoinRequestService,
  getCourseService,
  getEnrollmentService,
  getGradeService,
  getGradeVisibilityService,
  getPoolQuestionService,
  getQuestionPoolService,
  getQuestionService,
  getRedoRequestService,
  getStudentService,
  getTestFeedbackService,
  getTestService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { StudentService } from "src/lib/student-service";
import { TestService } from "src/lib/test-service";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
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
  getAnnotationService,
  getAnswerService,
  getGradeService,
  getGradeVisibilityService,
  getQuestionService,
  getRedoRequestService,
  getTestFeedbackService,
  getTestStatusService,
  getTestSubmissionService,
};

const TEST_BOUND_GETTER_NAMES = Object.keys(
  TEST_BOUND_GETTERS,
) as (keyof typeof TEST_BOUND_GETTERS)[];

/** Every real getter for a school's pools or pool questions. */
const POOL_GETTERS = { getQuestionPoolService, getPoolQuestionService };

const POOL_GETTER_NAMES = Object.keys(
  POOL_GETTERS,
) as (keyof typeof POOL_GETTERS)[];

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
    expect(
      () =>
        new TestService(
          db,
          schoolId as string,
          new CourseService(db, TEST_SCHOOL_ID),
        ),
    ).toThrow("A school is required");
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
 * Feature: an enrollment service is only ever built for one school
 * As the LMS system
 * I want an enrollment service with no school to be refused
 * So that no enrolment is read or written without a school to check it against
 */
describe("Feature: an enrollment service is only ever built for one school", () => {
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
  ])(
    "refuses to build an enrollment service for %s school",
    (_label, schoolId) => {
      expect(() => new EnrollmentService(db, schoolId as string)).toThrow(
        "A school is required",
      );
    },
  );

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])(
    "the real enrollment getter refuses %s school",
    async (_label, schoolId) => {
      await expect(getEnrollmentService(schoolId as string)).rejects.toThrow(
        "A school is required",
      );
    },
  );

  it("the mocked enrollment getter refuses an undefined school instead of falling back to the default one", async () => {
    const { getEnrollmentService: mockedGetEnrollmentService } =
      servicesSingletonMockFactory();

    await expect(
      mockedGetEnrollmentService(undefined as unknown as string),
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

/**
 * Feature: a school's pool services only ever list that school's pools and pool questions
 * As the LMS system
 * I want every pool service to be built for one school
 * So that no list of pools or pool questions can reach another school's
 */
describe("Feature: a school's pool services only ever list that school's pools and pool questions", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lists none of another school's questions for that school's pool", async () => {
    const otherSchool = await addTestSchool("School B");
    const foreignPool = await getTestServices().questionPoolService.createPool({
      name: "Foreign Pool",
      description: "",
      createdBy: "default-admin",
    });
    await getTestServices().poolQuestionService.addPoolQuestion(
      foreignPool.id,
      { title: "Foreign Question", content: "", createdBy: "default-admin" },
    );

    const questions = await getTestServices(
      otherSchool.id,
    ).poolQuestionService.listPoolQuestions(foreignPool.id);

    expect(questions).toEqual([]);
  });

  it("offers none of another school's pool questions to draw into a test", async () => {
    const otherSchool = await addTestSchool("School B");
    const foreignPool = await getTestServices().questionPoolService.createPool({
      name: "Foreign Pool",
      description: "",
      createdBy: "default-admin",
    });
    await getTestServices().poolQuestionService.addPoolQuestion(
      foreignPool.id,
      { title: "Foreign Question", content: "", createdBy: "default-admin" },
    );

    const drawable = await getTestServices(
      otherSchool.id,
    ).poolQuestionService.listSnapshotInputs(foreignPool.id);

    expect(drawable).toEqual([]);
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])(
    "refuses to build a question pool service for %s school",
    (_label, schoolId) => {
      expect(() => new QuestionPoolService(db, schoolId as string)).toThrow(
        "A school is required",
      );
    },
  );

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])(
    "refuses to build a pool question service for %s school",
    (_label, schoolId) => {
      expect(
        () =>
          new PoolQuestionService(
            db,
            schoolId as string,
            new QuestionPoolService(db, TEST_SCHOOL_ID),
          ),
      ).toThrow("A school is required");
    },
  );

  it.each(
    POOL_GETTER_NAMES.flatMap((name) => [
      [name, "undefined", undefined],
      [name, "an empty string", ""],
    ]),
  )("the real %s refuses %s school", async (name, _label, schoolId) => {
    const getter = POOL_GETTERS[name as keyof typeof POOL_GETTERS];

    await expect(getter(schoolId as string)).rejects.toThrow(
      "A school is required",
    );
  });

  it.each(POOL_GETTER_NAMES)(
    "the mocked %s refuses an undefined school instead of falling back to the default one",
    async (name) => {
      const mockedGetter = servicesSingletonMockFactory()[name];

      await expect(
        mockedGetter(undefined as unknown as string),
      ).rejects.toThrow("A school is required");
    },
  );
});

/**
 * Feature: a school's join request service only ever lists that school's requests
 * As the LMS system
 * I want every join request service to be built for one school
 * So that no queue, count or student's own list can reach another school's requests
 */
describe("Feature: a school's join request service only ever lists that school's requests", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("neither lists nor counts another school's waiting requests", async () => {
    const otherSchool = await addTestSchool("School B");
    await getTestServices().courseJoinRequestService.createRequest({
      courseId: "foreign-course",
      studentId: "foreign-student",
    });

    const queue = await getTestServices(
      otherSchool.id,
    ).courseJoinRequestService.listByStatus(JoinRequestStatus.Pending, {
      skip: 0,
      limit: 0,
    });

    expect(queue).toEqual({ items: [], total: 0 });
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])(
    "refuses to build a join request service for %s school",
    (_label, schoolId) => {
      expect(
        () => new CourseJoinRequestService(db, schoolId as string),
      ).toThrow("A school is required");
    },
  );

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
  ])(
    "the real join request getter refuses %s school",
    async (_label, schoolId) => {
      await expect(
        getCourseJoinRequestService(schoolId as string),
      ).rejects.toThrow("A school is required");
    },
  );

  it("the mocked join request getter refuses an undefined school instead of falling back to the default one", async () => {
    const { getCourseJoinRequestService: mockedGetter } =
      servicesSingletonMockFactory();

    await expect(mockedGetter(undefined as unknown as string)).rejects.toThrow(
      "A school is required",
    );
  });
});
