import type { Db } from "mongodb";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import {
  addTestSchool,
  getTestServices,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Feature: records not yet assigned to a school are hidden from every school
 * As the LMS system
 * I want a course, test, student, question pool or join request with no
 * school yet to be absent from every school's list, not just other
 * schools' lists
 * So that an interrupted backfill or an un-migrated row never surfaces
 * anywhere until it's stamped with a school
 */
describe("Feature: records not yet assigned to a school are hidden from every school", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("excludes an unassigned course, test, student, question pool and join request from a real school's own lists", async () => {
    // Given a real school with one own record per collection
    const school = await addTestSchool("School With Records");
    const services = getTestServices(school.id);
    const ownCourse = await services.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-1",
    });
    await services.testService.createTest(ownCourse.id, {
      title: "Own Test",
      description: "",
      createdBy: "admin-1",
    });
    const ownStudent = await services.studentService.createStudentDocument({
      authUserId: "own-auth-user",
      username: "own-student",
      name: "Own Student",
      createdBy: "admin-1",
    });
    await services.questionPoolService.createPool({
      name: "Own Pool",
      description: "",
      createdBy: "admin-1",
    });
    await services.courseJoinRequestService.createRequest({
      courseId: ownCourse.id,
      studentId: ownStudent.id,
    });

    // And one unassigned row per collection — a raw insert, since every
    // bound service always stamps its own school on create.
    const unassignedCourseId = crypto.randomUUID();
    await db.collection("course").insertOne({
      id: unassignedCourseId,
      title: "Unassigned Course",
      description: "",
      createdAt: new Date(),
      createdBy: "backfill",
      updatedAt: null,
      updatedBy: null,
      materials: [],
      inviteToken: null,
      schoolId: null,
    });
    await db.collection("test").insertOne({
      id: crypto.randomUUID(),
      courseId: unassignedCourseId,
      title: "Unassigned Test",
      description: "",
      showCorrectAnswerAfterSubmit: true,
      showGradeAfterSubmit: true,
      answerRevealMode: "plain",
      timeLimitMinutes: null,
      isPractice: false,
      correctAnswersReleasedAt: null,
      gradesReleasedAt: null,
      createdAt: new Date(),
      createdBy: "backfill",
      updatedAt: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      schoolId: null,
    });
    const unassignedStudentId = crypto.randomUUID();
    await db.collection("student").insertOne({
      id: unassignedStudentId,
      authUserId: "unassigned-auth-user",
      username: "unassigned-student",
      name: "Unassigned Student",
      createdAt: new Date(),
      createdBy: "backfill",
      updatedAt: null,
      updatedBy: null,
      schoolId: null,
    });
    await db.collection("question_pool").insertOne({
      id: crypto.randomUUID(),
      name: "Unassigned Pool",
      description: "",
      createdAt: new Date(),
      createdBy: "backfill",
      updatedAt: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      schoolId: null,
    });
    await db.collection("course_join_request").insertOne({
      id: crypto.randomUUID(),
      courseId: unassignedCourseId,
      studentId: unassignedStudentId,
      status: JoinRequestStatus.Pending,
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      schoolId: null,
    });

    // Then the school's own lists show only the own records — the
    // unassigned rows never appear
    const courseTitles = (await services.courseService.listCourses()).map(
      (course) => course.title,
    );
    expect(courseTitles).toEqual(["Own Course"]);

    const testTitles = (await services.testService.listAllTests()).map(
      (test) => test.title,
    );
    expect(testTitles).toEqual(["Own Test"]);

    const studentNames = (await services.studentService.listStudents()).map(
      (student) => student.name,
    );
    expect(studentNames).toEqual(["Own Student"]);

    const poolNames = (await services.questionPoolService.listPools()).map(
      (pool) => pool.name,
    );
    expect(poolNames).toEqual(["Own Pool"]);

    const pendingRequests =
      await services.courseJoinRequestService.listByStatus(
        JoinRequestStatus.Pending,
        { skip: 0, limit: 50 },
      );
    expect(pendingRequests.items.map((request) => request.studentId)).toEqual([
      ownStudent.id,
    ]);
    expect(pendingRequests.total).toBe(1);

    // And the default school's lists are unaffected too — nobody guessed a
    // school for the unassigned rows
    const defaultServices = getTestServices();
    expect(await defaultServices.courseService.listCourses()).toHaveLength(0);
    expect(await defaultServices.testService.listAllTests()).toHaveLength(0);
    expect(await defaultServices.studentService.listStudents()).toHaveLength(0);
    expect(await defaultServices.questionPoolService.listPools()).toHaveLength(
      0,
    );
    const defaultPending =
      await defaultServices.courseJoinRequestService.listByStatus(
        JoinRequestStatus.Pending,
        { skip: 0, limit: 50 },
      );
    expect(defaultPending.total).toBe(0);
  });
});
