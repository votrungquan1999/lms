import type { Db } from "mongodb";
import { CourseService } from "src/lib/course-service";
import { getCourseService } from "src/lib/services-singleton";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
