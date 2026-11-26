import type { Db } from "mongodb";
import type { AnswerDocument } from "src/lib/answer-service";
import type { CourseDocument } from "src/lib/course-service";
import type { EnrollmentDocument } from "src/lib/enrollment-service";
import type { GradeDocument } from "src/lib/grade-service";
import { GradingCountService } from "src/lib/grading-count-service";
import type { QuestionDocument } from "src/lib/question-service";
import type { RedoRequestDocument } from "src/lib/redo-request-service";
import type { StudentDocument } from "src/lib/student-service";
import type { TestDocument } from "src/lib/test-service";
import type { TestStartDocument } from "src/lib/test-start-service";
import { TestStatusService } from "src/lib/test-status-service";
import type { TestSubmissionDocument } from "src/lib/test-submission-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const MINUTE = 60_000;
const OTHER_SCHOOL_ID = "00000000-0000-4000-8000-0000000000ff";

/** Raw inserts: they let a case fix timestamps, releases and tombstones that the services would not. */
function seeds(db: Db) {
  const id = () => crypto.randomUUID();
  return {
    async course(title: string, schoolId = TEST_SCHOOL_ID) {
      const doc: CourseDocument = {
        id: id(),
        title,
        description: "",
        createdAt: new Date(),
        createdBy: "seed",
        updatedAt: null,
        updatedBy: null,
        materials: [],
        inviteToken: null,
        schoolId,
      };
      await db.collection<CourseDocument>("course").insertOne(doc);
      return doc.id;
    },
    async student(name: string, schoolId = TEST_SCHOOL_ID) {
      const doc: StudentDocument = {
        id: id(),
        authUserId: `auth-${id()}`,
        username: `u-${id().slice(0, 8)}`,
        name,
        createdAt: new Date(),
        createdBy: "seed",
        updatedAt: null,
        updatedBy: null,
        schoolIds: [schoolId],
      };
      await db.collection<StudentDocument>("student").insertOne(doc);
      return doc.id;
    },
    async enroll(courseId: string, studentId: string) {
      const doc: EnrollmentDocument = {
        id: id(),
        courseId,
        studentId,
        enrolledAt: new Date(),
        createdBy: "seed",
        updatedAt: null,
        updatedBy: null,
      };
      await db.collection<EnrollmentDocument>("enrollment").insertOne(doc);
    },
    async test(
      courseId: string,
      overrides: Partial<TestDocument> = {},
      schoolId = TEST_SCHOOL_ID,
    ) {
      const doc: TestDocument = {
        id: id(),
        courseId,
        title: "Test",
        description: "",
        showCorrectAnswerAfterSubmit: true,
        showGradeAfterSubmit: false,
        answerRevealMode: "plain",
        timeLimitMinutes: null,
        isPractice: false,
        correctAnswersReleasedAt: null,
        gradesReleasedAt: null,
        createdAt: new Date(),
        createdBy: "seed",
        updatedAt: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        schoolId,
        ...overrides,
      };
      await db.collection<TestDocument>("test").insertOne(doc);
      return doc.id;
    },
    async question(testId: string, overrides: Partial<QuestionDocument> = {}) {
      const doc: QuestionDocument = {
        id: id(),
        testId,
        title: "Q",
        content: "Q",
        order: 1,
        createdAt: new Date(),
        createdBy: "seed",
        updatedAt: null,
        updatedBy: null,
        type: "free_text",
        options: null,
        weight: 1,
        mcGradingStrategy: null,
        explanation: null,
        referenceAnswer: null,
        answerRevealMode: null,
        media: [],
        deletedAt: null,
        deletedBy: null,
        ...overrides,
      };
      await db.collection<QuestionDocument>("question").insertOne(doc);
      return doc.id;
    },
    /** A single-select question with one correct option; returns the question and that option. */
    async mcQuestion(testId: string) {
      const correct = id();
      const questionId = await this.question(testId, {
        type: "single_select",
        options: [
          { id: correct, text: "Right", isCorrect: true },
          { id: id(), text: "Wrong", isCorrect: false },
        ],
      });
      return { questionId, correct };
    },
    async answer(
      testId: string,
      questionId: string,
      studentId: string,
      answer: AnswerDocument["answer"] = { type: "free_text", text: "x" },
    ) {
      await db.collection<AnswerDocument>("answer").insertOne({
        id: id(),
        testId,
        questionId,
        studentId,
        answer,
        submittedAt: new Date(),
      });
    },
    async handIn(
      testId: string,
      studentId: string,
      overrides: Partial<TestSubmissionDocument> = {},
    ) {
      await db.collection<TestSubmissionDocument>("test_submission").insertOne({
        id: id(),
        testId,
        studentId,
        submittedAt: new Date(Date.now() - 5 * MINUTE),
        deletedAt: null,
        releasedAt: null,
        releasedBy: null,
        ...overrides,
      });
    },
    async grade(testId: string, questionId: string, studentId: string) {
      await db.collection<GradeDocument>("grade").insertOne({
        id: id(),
        testId,
        questionId,
        studentId,
        score: 1,
        feedback: "",
        solution: null,
        gradedAt: new Date(),
        gradedBy: "seed",
        updatedAt: null,
        updatedBy: null,
      });
    },
    async start(testId: string, studentId: string, startedAt: Date) {
      await db.collection<TestStartDocument>("test_start").insertOne({
        id: id(),
        testId,
        studentId,
        startedAt,
        createdAt: startedAt,
        createdBy: studentId,
        deletedAt: null,
        deletedBy: null,
      });
    },
    async redo(testId: string, studentId: string) {
      await db.collection<RedoRequestDocument>("redo_request").insertOne({
        id: id(),
        testId,
        studentId,
        requestedBy: "seed",
        requestedAt: new Date(),
        resolvedAt: null,
      });
    },
  };
}

/** What the per-student services say about a pair, read after the counts so their writes cannot leak in. */
async function referenceFor(db: Db, testId: string, studentId: string) {
  const core = buildCoreServices(db);
  const statusService = new TestStatusService(
    core.answerService,
    core.testSubmissionService,
    core.gradeService,
    core.testStartService,
    core.testService,
    core.questionService,
  );
  const live = await core.questionService.listQuestions(testId);
  const status = await statusService.getStatus(testId, studentId, live.length);
  const active = await core.testSubmissionService.getActiveSubmission(
    testId,
    studentId,
  );
  const answers = await core.answerService.getLatestAnswers(testId, studentId);
  const graded = new Set(
    (await core.gradeService.getGrades(testId, studentId)).map(
      (g) => g.questionId,
    ),
  );
  const liveIds = new Set(live.map((q) => q.id));
  const answersLeft = answers.filter(
    (a) => liveIds.has(a.questionId) && !graded.has(a.questionId),
  ).length;
  const visible = await core.gradeVisibilityService.canRevealGrades(
    testId,
    studentId,
    status,
  );
  return {
    status,
    answersLeft: status === "submitted" ? answersLeft : 0,
    submittedAt: active?.submittedAt ?? null,
    gradedHidden: status === "graded" && !visible,
  };
}

describe("GradingCountService", () => {
  dbIt(
    "gives every enrolled pair the status, answers left, hand-in time and grade visibility the per-student services give it",
    async ({ db }) => {
      // Given a school whose tests cover each rule that decides a status
      const seed = seeds(db);
      const course = await seed.course("Course");
      const names = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];
      const s: Record<string, string> = {};
      for (const name of names) {
        s[name] = await seed.student(name);
        await seed.enroll(course, s[name]);
      }

      // Plain test, grades hidden until released: one case per rule
      const plain = await seed.test(course, { title: "Plain" });
      const q1 = await seed.question(plain);
      const q2 = await seed.question(plain, { order: 2 });
      const deletedQ = await seed.question(plain, {
        order: 3,
        deletedAt: new Date(),
      });
      // s1: answered both, graded one -> waiting, one answer left
      await seed.answer(plain, q1, s.s1);
      await seed.answer(plain, q2, s.s1);
      await seed.handIn(plain, s.s1);
      await seed.grade(plain, q1, s.s1);
      // s2: every answer graded -> Graded, hidden
      await seed.answer(plain, q1, s.s2);
      await seed.answer(plain, q2, s.s2);
      await seed.handIn(plain, s.s2);
      await seed.grade(plain, q1, s.s2);
      await seed.grade(plain, q2, s.s2);
      // s3: answered, never handed in -> In progress
      await seed.answer(plain, q1, s.s3);
      // s4: only an answer to a deleted question plus a hand-in -> blank, Graded
      await seed.answer(plain, deletedQ, s.s4);
      await seed.handIn(plain, s.s4);
      // s5: a grade on a question left blank does not settle the answered one
      await seed.answer(plain, q1, s.s5);
      await seed.handIn(plain, s.s5);
      await seed.grade(plain, q2, s.s5);
      // s6: Graded and released one by one
      await seed.answer(plain, q1, s.s6);
      await seed.handIn(plain, s.s6, { releasedAt: new Date() });
      await seed.grade(plain, q1, s.s6);
      // s7: only a soft-deleted hand-in -> back to In progress
      await seed.answer(plain, q1, s.s7);
      await seed.handIn(plain, s.s7, { deletedAt: new Date() });

      // Practice test: answered and blank hand-ins both stay Submitted
      const practice = await seed.test(course, {
        title: "Practice",
        isPractice: true,
      });
      const pq = await seed.question(practice);
      await seed.answer(practice, pq, s.s1);
      await seed.handIn(practice, s.s1);
      await seed.handIn(practice, s.s2);

      // A test with no questions is Not started for everyone
      const empty = await seed.test(course, { title: "Empty" });
      await seed.handIn(empty, s.s1);

      // Timed test whose attempts ran out without a stored hand-in
      const timed = await seed.test(course, {
        title: "Timed",
        timeLimitMinutes: 30,
      });
      const mc = await seed.mcQuestion(timed);
      const written = await seed.question(timed, { order: 2 });
      const longAgo = new Date(Date.now() - 3 * 60 * MINUTE);
      const mcAnswer = { type: "mc" as const, selectedIds: [mc.correct] };
      // s1: only the choice answered -> auto-graded, Graded
      await seed.start(timed, s.s1, longAgo);
      await seed.answer(timed, mc.questionId, s.s1, mcAnswer);
      // s2: choice plus a written answer -> waiting
      await seed.start(timed, s.s2, longAgo);
      await seed.answer(timed, mc.questionId, s.s2, mcAnswer);
      await seed.answer(timed, written, s.s2);
      // s3: redo requested after a released hand-in, attempt expired -> replaced, unreleased
      await seed.start(timed, s.s3, longAgo);
      await seed.answer(timed, mc.questionId, s.s3, mcAnswer);
      await seed.handIn(timed, s.s3, { releasedAt: new Date() });
      await seed.redo(timed, s.s3);
      // s4: still inside the time limit -> In progress
      await seed.start(timed, s.s4, new Date());

      // Timed practice test: an expired attempt is handed in but never auto-graded, so it stays Submitted
      const timedPractice = await seed.test(course, {
        title: "Timed practice",
        timeLimitMinutes: 30,
        isPractice: true,
      });
      const practiceMc = await seed.mcQuestion(timedPractice);
      await seed.start(timedPractice, s.s1, longAgo);
      await seed.answer(timedPractice, practiceMc.questionId, s.s1, {
        type: "mc",
        selectedIds: [practiceMc.correct],
      });

      // A hand-in by a student no longer enrolled is not counted
      const left = await seed.student("left");
      await seed.answer(plain, q1, left);
      await seed.handIn(plain, left);

      // When the school is counted
      const counts = await new GradingCountService(
        db,
        TEST_SCHOOL_ID,
      ).getCounts();

      // Then each pair equals what the per-student services say
      const expected = new Map<
        string,
        Awaited<ReturnType<typeof referenceFor>>
      >();
      for (const pair of counts.pairs) {
        expected.set(
          `${pair.testId}|${pair.studentId}`,
          await referenceFor(db, pair.testId, pair.studentId),
        );
      }
      expect(counts.pairs).toHaveLength(5 * names.length);
      for (const pair of counts.pairs) {
        const reference = expected.get(`${pair.testId}|${pair.studentId}`);
        expect({
          status: pair.status,
          answersLeft: pair.answersLeft,
          submittedAt: pair.submittedAt,
          gradedHidden: pair.gradedHidden,
        }).toEqual(reference);
      }
      // And the timed attempts were read, not written
      expect(counts.pairs.filter((p) => p.assumedHandIn)).toHaveLength(4);
    },
  );

  dbIt(
    "rolls waiting, oldest waiting student, release readiness and question types up per test, course and school",
    async ({ db }) => {
      // Given a course with a waiting test, a fully graded unreleased test, a partly released one and a practice test
      const seed = seeds(db);
      const course = await seed.course("Course");
      const emptyCourse = await seed.course("No tests");
      const ann = await seed.student("Ann");
      const ben = await seed.student("Ben");
      const cy = await seed.student("Cy");
      const [lowerId, higherId] = [ben, cy].sort();
      // The higher id is enrolled first, so only the tie-break can pick the lower one
      for (const student of [ann, higherId, lowerId]) {
        await seed.enroll(course, student);
      }
      const earlier = new Date(Date.now() - 3 * 24 * 60 * MINUTE);
      const later = new Date(Date.now() - 1 * 24 * 60 * MINUTE);

      // Waiting: Cy and Ben handed in at the same moment, Ann earlier but fully graded
      const waiting = await seed.test(course, { title: "Waiting" });
      const wText = await seed.question(waiting);
      const wChoice = await seed.mcQuestion(waiting);
      await seed.answer(waiting, wText, ann);
      await seed.handIn(waiting, ann, {
        submittedAt: new Date(earlier.getTime() - MINUTE),
      });
      await seed.grade(waiting, wText, ann);
      for (const student of [cy, ben]) {
        await seed.answer(waiting, wText, student);
        await seed.answer(waiting, wChoice.questionId, student, {
          type: "mc",
          selectedIds: [wChoice.correct],
        });
        await seed.handIn(waiting, student, { submittedAt: later });
      }

      // Ready to release: all three graded, none released
      const ready = await seed.test(course, { title: "Ready" });
      const rq = await seed.question(ready);
      for (const student of [ann, ben, cy]) {
        await seed.answer(ready, rq, student);
        await seed.handIn(ready, student);
        await seed.grade(ready, rq, student);
      }

      // Partly released: graded for all, released for Ann only
      const partly = await seed.test(course, { title: "Partly" });
      const pq = await seed.question(partly);
      for (const student of [ann, ben, cy]) {
        await seed.answer(partly, pq, student);
        await seed.handIn(partly, student, {
          releasedAt: student === ann ? new Date() : null,
        });
        await seed.grade(partly, pq, student);
      }

      // Waiting and graded-hidden at once: not ready to release
      const mixed = await seed.test(course, { title: "Mixed" });
      const mq = await seed.question(mixed);
      await seed.answer(mixed, mq, ann);
      await seed.handIn(mixed, ann);
      await seed.grade(mixed, mq, ann);
      await seed.answer(mixed, mq, ben);
      await seed.handIn(mixed, ben);

      // When the school is counted
      const counts = await new GradingCountService(
        db,
        TEST_SCHOOL_ID,
      ).getCounts();
      const test = (id: string) => counts.tests.find((t) => t.testId === id);

      // Then the waiting test names the lower student id among equal hand-in times
      expect(test(waiting)).toMatchObject({
        waiting: 2,
        answersLeft: 4,
        submitted: 3,
        fullyGraded: 1,
        oldestWaitingStudentId: lowerId,
        oldestWaitingStudentName: lowerId === ben ? "Ben" : "Cy",
        readyToRelease: false,
        questionCount: 2,
        typeCounts: {
          free_text: 1,
          single_select: 1,
          multi_select: 0,
          image_answer: 0,
        },
      });
      expect(test(waiting)?.oldestWaitingAt?.getTime()).toBe(later.getTime());

      // And release readiness follows nothing-waiting plus a hidden grade
      expect(test(ready)).toMatchObject({
        readyToRelease: true,
        fullyGraded: 3,
        gradedHidden: 3,
        releasedTo: 0,
      });
      expect(test(partly)).toMatchObject({
        readyToRelease: true,
        gradedHidden: 2,
        releasedTo: 1,
      });
      expect(test(mixed)).toMatchObject({
        waiting: 1,
        gradedHidden: 1,
        readyToRelease: false,
      });

      // And the course and school totals use those per-test answers
      expect(counts.courses.find((c) => c.courseId === course)).toMatchObject({
        students: 3,
        tests: 4,
        waiting: 3,
        testsWaiting: 2,
        testsReadyToRelease: 2,
      });
      expect(
        counts.courses.find((c) => c.courseId === emptyCourse),
      ).toMatchObject({
        students: 0,
        tests: 0,
        waiting: 0,
        oldestWaitingAt: null,
      });
      expect(counts.waiting).toBe(3);
      expect(counts.testsReadyToRelease).toBe(2);
    },
  );

  dbIt(
    "counts only its own school: another school's data, a cross-school enrolment and a test of an unknown course add nothing",
    async ({ db }) => {
      // Given one waiting hand-in in this school
      const seed = seeds(db);
      const course = await seed.course("Own");
      const own = await seed.student("Own student");
      await seed.enroll(course, own);
      const test = await seed.test(course, { title: "Own test" });
      const q = await seed.question(test);
      await seed.answer(test, q, own);
      await seed.handIn(test, own);

      // And a student of another school enrolled in this course by legacy data, also waiting
      const stranger = await seed.student("Stranger", OTHER_SCHOOL_ID);
      await seed.enroll(course, stranger);
      await seed.answer(test, q, stranger);
      await seed.handIn(test, stranger);

      // And a second school with its own waiting work
      const otherCourse = await seed.course("Other", OTHER_SCHOOL_ID);
      const otherStudent = await seed.student("Other student", OTHER_SCHOOL_ID);
      await seed.enroll(otherCourse, otherStudent);
      const otherTest = await seed.test(otherCourse, {}, OTHER_SCHOOL_ID);
      const otherQ = await seed.question(otherTest);
      await seed.answer(otherTest, otherQ, otherStudent);
      await seed.handIn(otherTest, otherStudent);

      // And a test of this school whose course no longer exists
      const orphan = await seed.test("gone-course");
      const orphanQ = await seed.question(orphan);
      await seed.answer(orphan, orphanQ, own);
      await seed.handIn(orphan, own);

      // When this school is counted
      const counts = await new GradingCountService(
        db,
        TEST_SCHOOL_ID,
      ).getCounts();

      // Then only the own student's hand-in on the own test waits
      expect(counts.waiting).toBe(1);
      expect(counts.courses.map((c) => c.courseId)).toEqual([course]);
      expect(counts.tests.map((t) => t.testId)).toEqual([test]);
      expect(counts.pairs).toHaveLength(1);
    },
  );
});
