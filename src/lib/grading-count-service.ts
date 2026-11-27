import type { Db } from "mongodb";
import type { AnswerDocument } from "src/lib/answer-service";
import type { CourseDocument } from "src/lib/course-service";
import { isPastEnforcementDeadline } from "src/lib/enforcement-deadline";
import type { EnrollmentDocument } from "src/lib/enrollment-service";
import type { GradeDocument } from "src/lib/grade-service";
import { needsGrade } from "src/lib/needs-grade";
import type { QuestionDocument, QuestionType } from "src/lib/question-service";
import type { RedoRequestDocument } from "src/lib/redo-request-service";
import type { StudentDocument } from "src/lib/student-service";
import type { TestDocument } from "src/lib/test-service";
import type { TestStartDocument } from "src/lib/test-start-service";
import { TestStatus } from "src/lib/test-status-service";
import type { TestSubmissionDocument } from "src/lib/test-submission-service";

/** One enrolled (test, student) pair, with the status `TestStatusService.getStatus` would give it, except that an open redo puts her back to In progress. */
export interface PairGradingResult {
  testId: string;
  studentId: string;
  status: TestStatus;
  /** Live answers that still need a grade; 0 unless the status is Submitted. */
  answersLeft: number;
  submittedAt: Date | null;
  /** The student is Graded but cannot see the grade yet. */
  gradedHidden: boolean;
  /** The hand-in was inferred from an expired timed attempt that is not written yet. */
  assumedHandIn: boolean;
  /** The student has an open redo request on this test. */
  redoRequested: boolean;
}

/** Grading counts for one test of the school. */
export interface TestGradingCounts {
  testId: string;
  title: string;
  courseId: string;
  createdAt: Date;
  isPractice: boolean;
  questionCount: number;
  typeCounts: Record<QuestionType, number>;
  /** Enrolled students per status. */
  statusCounts: Record<TestStatus, number>;
  /** Enrolled students who handed in (Submitted + Graded). */
  submitted: number;
  /** Submitted students on a non-practice test. */
  waiting: number;
  /** Answers that still need a grade, summed over the waiting students. */
  answersLeft: number;
  /** Graded students. */
  fullyGraded: number;
  oldestWaitingAt: Date | null;
  oldestWaitingStudentId: string | null;
  oldestWaitingStudentName: string | null;
  /** Graded students who cannot see their grade yet. */
  gradedHidden: number;
  /** Graded students who can see their grade. */
  releasedTo: number;
  /** A graded test where nothing waits and a student cannot see the grade; never a practice test. */
  readyToRelease: boolean;
}

/** Grading counts for one course of the school. */
export interface CourseGradingCounts {
  courseId: string;
  title: string;
  /** Students enrolled now, of this school. */
  students: number;
  /** Live tests, practice included. */
  tests: number;
  waiting: number;
  testsWaiting: number;
  testsReadyToRelease: number;
  oldestWaitingAt: Date | null;
}

/** Grading counts for the whole school. */
export interface SchoolGradingCounts {
  waiting: number;
  testsReadyToRelease: number;
  courses: CourseGradingCounts[];
  tests: TestGradingCounts[];
  pairs: PairGradingResult[];
}

/** The fields of a test the counts read. */
type TestRow = Pick<
  TestDocument,
  | "id"
  | "title"
  | "courseId"
  | "createdAt"
  | "isPractice"
  | "timeLimitMinutes"
  | "showGradeAfterSubmit"
  | "gradesReleasedAt"
>;

/** An expired timed attempt `getStatus` has not handed in yet. */
interface AssumedHandIn {
  testId: string;
  studentId: string;
  submittedAt: Date;
}

const QUESTION_TYPES: QuestionType[] = [
  "free_text",
  "single_select",
  "multi_select",
  "image_answer",
];

/** Joins ids into one map key. */
function pairKey(testId: string, studentId: string): string {
  return `${testId}|${studentId}`;
}

/** A status tally with every status at zero. */
function emptyStatusCounts(): Record<TestStatus, number> {
  return {
    [TestStatus.NotStarted]: 0,
    [TestStatus.InProgress]: 0,
    [TestStatus.Submitted]: 0,
    [TestStatus.Graded]: 0,
  };
}

/** A question-type tally with every type at zero. */
function emptyTypeCounts(): Record<QuestionType, number> {
  return Object.fromEntries(QUESTION_TYPES.map((t) => [t, 0])) as Record<
    QuestionType,
    number
  >;
}

/**
 * Read-only grading counts for one school. Reproduces what each student's
 * status would be without calling `TestStatusService`, which writes hand-ins
 * for expired timed attempts as a side effect.
 */
export class GradingCountService {
  constructor(
    private readonly db: Db,
    private readonly schoolId: string,
  ) {}

  /**
   * Counts every enrolled (test, student) pair of the school in two parallel
   * read rounds, plus a third only when an expired timed attempt needs its
   * auto-grade inferred.
   * @param now - The clock used to decide which timed attempts have expired.
   * @param only - Counts just this test and its course instead of the whole school.
   */
  async getCounts(
    now: Date = new Date(),
    only?: { testId: string; courseId: string },
  ): Promise<SchoolGradingCounts> {
    const { db } = this;
    const schoolId = this.schoolId;

    // Round 1: the school's live tests, courses and students
    const [tests, courses, students] = await Promise.all([
      db
        .collection<TestDocument>("test")
        .find({ schoolId, deletedAt: null, ...(only && { id: only.testId }) })
        .project<TestRow>({
          _id: 0,
          id: 1,
          title: 1,
          courseId: 1,
          createdAt: 1,
          isPractice: 1,
          timeLimitMinutes: 1,
          showGradeAfterSubmit: 1,
          gradesReleasedAt: 1,
        })
        .toArray(),
      db
        .collection<CourseDocument>("course")
        .find({ schoolId, ...(only && { id: only.courseId }) })
        .project<Pick<CourseDocument, "id" | "title">>({
          _id: 0,
          id: 1,
          title: 1,
        })
        .toArray(),
      db
        .collection<StudentDocument>("student")
        .find({ schoolIds: schoolId })
        .project<Pick<StudentDocument, "id" | "name">>({
          _id: 0,
          id: 1,
          name: 1,
        })
        .toArray(),
    ]);
    const courseIds = courses.map((c) => c.id);
    const courseIdSet = new Set(courseIds);
    // A test whose course is not this school's course list is not shown anywhere
    const liveTests = tests.filter((t) => courseIdSet.has(t.courseId));
    const testIds = liveTests.map((t) => t.id);
    const studentName = new Map(students.map((s) => [s.id, s.name]));

    // Round 2: everything keyed by (test, student), one query per collection
    const byTestId = { testId: { $in: testIds } };
    const [
      enrollments,
      questions,
      submissions,
      answered,
      grades,
      starts,
      redos,
    ] = await Promise.all([
      db
        .collection<EnrollmentDocument>("enrollment")
        .find({ courseId: { $in: courseIds } })
        .project<Pick<EnrollmentDocument, "courseId" | "studentId">>({
          _id: 0,
          courseId: 1,
          studentId: 1,
        })
        .toArray(),
      db
        .collection<QuestionDocument>("question")
        .find({ ...byTestId, deletedAt: null })
        .project<Pick<QuestionDocument, "id" | "testId" | "type">>({
          _id: 0,
          id: 1,
          testId: 1,
          type: 1,
        })
        .toArray(),
      db
        .collection<TestSubmissionDocument>("test_submission")
        .find({ ...byTestId, deletedAt: null })
        .project<
          Pick<
            TestSubmissionDocument,
            "testId" | "studentId" | "submittedAt" | "releasedAt"
          >
        >({ _id: 0, testId: 1, studentId: 1, submittedAt: 1, releasedAt: 1 })
        .toArray(),
      // Any answer row means "answered"; only the distinct triples and their latest save time travel
      db
        .collection<AnswerDocument>("answer")
        .aggregate<{
          _id: { t: string; s: string; q: string };
          latestAt: Date;
        }>([
          { $match: byTestId },
          {
            $group: {
              _id: { t: "$testId", s: "$studentId", q: "$questionId" },
              latestAt: { $max: "$submittedAt" },
            },
          },
        ])
        .toArray(),
      db
        .collection<GradeDocument>("grade")
        .find(byTestId)
        .project<
          Pick<
            GradeDocument,
            | "testId"
            | "studentId"
            | "questionId"
            | "gradedAt"
            | "updatedAt"
            | "gradedAnswerAt"
          >
        >({
          _id: 0,
          testId: 1,
          studentId: 1,
          questionId: 1,
          gradedAt: 1,
          updatedAt: 1,
          gradedAnswerAt: 1,
        })
        .toArray(),
      db
        .collection<TestStartDocument>("test_start")
        .find({ ...byTestId, deletedAt: null })
        .project<Pick<TestStartDocument, "testId" | "studentId" | "startedAt">>(
          { _id: 0, testId: 1, studentId: 1, startedAt: 1 },
        )
        .toArray(),
      db
        .collection<RedoRequestDocument>("redo_request")
        .find({ ...byTestId, resolvedAt: null })
        .project<Pick<RedoRequestDocument, "testId" | "studentId">>({
          _id: 0,
          testId: 1,
          studentId: 1,
        })
        .toArray(),
    ]);

    // Only students of this school count as enrolled
    const enrolledByCourse = new Map<string, string[]>();
    for (const e of enrollments) {
      if (!studentName.has(e.studentId)) continue;
      const list = enrolledByCourse.get(e.courseId) ?? [];
      list.push(e.studentId);
      enrolledByCourse.set(e.courseId, list);
    }
    const liveByTest = new Map<string, Map<string, QuestionType>>();
    for (const q of questions) {
      const live = liveByTest.get(q.testId) ?? new Map<string, QuestionType>();
      live.set(q.id, q.type);
      liveByTest.set(q.testId, live);
    }
    const submissionByPair = new Map(
      submissions.map((s) => [pairKey(s.testId, s.studentId), s]),
    );
    const answeredByPair = new Map<string, Map<string, Date>>();
    for (const a of answered) {
      const key = pairKey(a._id.t, a._id.s);
      const byQuestion = answeredByPair.get(key) ?? new Map<string, Date>();
      byQuestion.set(a._id.q, a.latestAt);
      answeredByPair.set(key, byQuestion);
    }
    const gradedByPair = new Map<
      string,
      Map<string, (typeof grades)[number]>
    >();
    for (const g of grades) {
      const key = pairKey(g.testId, g.studentId);
      const byQuestion = gradedByPair.get(key) ?? new Map();
      byQuestion.set(g.questionId, g);
      gradedByPair.set(key, byQuestion);
    }
    const startByPair = new Map(
      starts.map((s) => [pairKey(s.testId, s.studentId), s]),
    );
    const redoPairs = new Set(redos.map((r) => pairKey(r.testId, r.studentId)));

    // Expired timed attempts that the next status read would hand in
    const assumed: AssumedHandIn[] = [];
    for (const t of liveTests) {
      if (t.timeLimitMinutes === null) continue;
      for (const studentId of enrolledByCourse.get(t.courseId) ?? []) {
        const key = pairKey(t.id, studentId);
        const start = startByPair.get(key);
        if (!start) continue;
        if (
          !isPastEnforcementDeadline(start.startedAt, t.timeLimitMinutes, now)
        )
          continue;
        // An existing hand-in stands unless an open redo replaces it
        if (submissionByPair.has(key) && !redoPairs.has(key)) continue;
        assumed.push({
          testId: t.id,
          studentId,
          submittedAt: new Date(
            start.startedAt.getTime() + t.timeLimitMinutes * 60_000,
          ),
        });
      }
    }
    const assumedByPair = new Map(
      assumed.map((a) => [pairKey(a.testId, a.studentId), a]),
    );
    const autoGradedByPair = await this.inferAutoGrades(
      assumed.filter((a) => !tests.find((t) => t.id === a.testId)?.isPractice),
      liveByTest,
    );

    // Each enrolled pair's status, rolled up per test
    const pairs: PairGradingResult[] = [];
    const testCounts: TestGradingCounts[] = [];
    for (const t of liveTests) {
      const enrolled = enrolledByCourse.get(t.courseId) ?? [];
      const live = liveByTest.get(t.id);
      const typeCounts = emptyTypeCounts();
      for (const type of live?.values() ?? []) typeCounts[type]++;
      const counts: TestGradingCounts = {
        testId: t.id,
        title: t.title,
        courseId: t.courseId,
        createdAt: t.createdAt,
        isPractice: Boolean(t.isPractice),
        questionCount: live?.size ?? 0,
        typeCounts,
        statusCounts: emptyStatusCounts(),
        submitted: 0,
        waiting: 0,
        answersLeft: 0,
        fullyGraded: 0,
        oldestWaitingAt: null,
        oldestWaitingStudentId: null,
        oldestWaitingStudentName: null,
        gradedHidden: 0,
        releasedTo: 0,
        readyToRelease: false,
      };
      for (const studentId of enrolled) {
        const key = pairKey(t.id, studentId);
        const inferred = assumedByPair.get(key);
        const stored = submissionByPair.get(key);
        const submittedAt =
          inferred?.submittedAt ?? stored?.submittedAt ?? null;
        // A replaced hand-in starts unreleased
        const releasedAt = inferred ? null : (stored?.releasedAt ?? null);

        let status: TestStatus;
        let answersLeft = 0;
        const answeredAt = answeredByPair.get(key);
        const answeredLive = [...(answeredAt?.keys() ?? [])].filter((q) =>
          live?.has(q),
        );
        if (!live || live.size === 0) {
          status = TestStatus.NotStarted;
        } else if (submittedAt) {
          if (answeredLive.length === 0) {
            // A blank hand-in is Graded, except on a practice test, which never gets grades
            status = t.isPractice ? TestStatus.Submitted : TestStatus.Graded;
          } else {
            const graded = gradedByPair.get(key);
            const auto = autoGradedByPair.get(key);
            answersLeft = answeredLive.filter(
              (q) =>
                !auto?.has(q) &&
                needsGrade({
                  answered: true,
                  latestAnswerAt: answeredAt?.get(q) ?? null,
                  grade: graded?.get(q) ?? null,
                  // An expired attempt hands in over its redo, so the redo is closed.
                  redoOpen: redoPairs.has(key) && !inferred,
                }),
            ).length;
            status = answersLeft > 0 ? TestStatus.Submitted : TestStatus.Graded;
          }
        } else {
          status =
            answeredLive.length > 0 || startByPair.has(key)
              ? TestStatus.InProgress
              : TestStatus.NotStarted;
        }

        // Her old hand-in is on hold while a redo is open: she counts as not handed in.
        if (redoPairs.has(key) && !inferred && submittedAt) {
          if (status === TestStatus.Submitted || status === TestStatus.Graded) {
            status = TestStatus.InProgress;
            answersLeft = 0;
          }
        }

        const gradedHidden =
          status === TestStatus.Graded &&
          !t.showGradeAfterSubmit &&
          !t.gradesReleasedAt &&
          !releasedAt;
        pairs.push({
          testId: t.id,
          studentId,
          status,
          answersLeft: status === TestStatus.Submitted ? answersLeft : 0,
          submittedAt,
          gradedHidden,
          assumedHandIn: Boolean(inferred),
          redoRequested: redoPairs.has(key),
        });

        counts.statusCounts[status]++;
        if (status === TestStatus.Submitted || status === TestStatus.Graded) {
          counts.submitted++;
        }
        if (status === TestStatus.Graded) {
          counts.fullyGraded++;
          if (gradedHidden) counts.gradedHidden++;
          else counts.releasedTo++;
        }
        if (status === TestStatus.Submitted && !t.isPractice && submittedAt) {
          counts.waiting++;
          counts.answersLeft += answersLeft;
          // Equal hand-in times go to the lower student id so the pick is stable
          const older =
            !counts.oldestWaitingAt ||
            submittedAt < counts.oldestWaitingAt ||
            (submittedAt.getTime() === counts.oldestWaitingAt.getTime() &&
              studentId < (counts.oldestWaitingStudentId ?? ""));
          if (older) {
            counts.oldestWaitingAt = submittedAt;
            counts.oldestWaitingStudentId = studentId;
            counts.oldestWaitingStudentName =
              studentName.get(studentId) ?? null;
          }
        }
      }
      // Practice tests show answers as students go, so there is never a release to make
      counts.readyToRelease =
        !t.isPractice && counts.waiting === 0 && counts.gradedHidden > 0;
      testCounts.push(counts);
    }

    // Roll the tests up into courses (every course, zeros included) and the school
    const courseCounts = new Map<string, CourseGradingCounts>(
      courses.map((c) => [
        c.id,
        {
          courseId: c.id,
          title: c.title,
          students: enrolledByCourse.get(c.id)?.length ?? 0,
          tests: 0,
          waiting: 0,
          testsWaiting: 0,
          testsReadyToRelease: 0,
          oldestWaitingAt: null,
        },
      ]),
    );
    let waiting = 0;
    let testsReadyToRelease = 0;
    for (const t of testCounts) {
      const course = courseCounts.get(t.courseId);
      if (!course) continue;
      course.tests++;
      course.waiting += t.waiting;
      if (t.waiting > 0) course.testsWaiting++;
      if (t.readyToRelease) course.testsReadyToRelease++;
      if (
        t.oldestWaitingAt &&
        (!course.oldestWaitingAt || t.oldestWaitingAt < course.oldestWaitingAt)
      ) {
        course.oldestWaitingAt = t.oldestWaitingAt;
      }
      waiting += t.waiting;
      if (t.readyToRelease) testsReadyToRelease++;
    }

    return {
      waiting,
      testsReadyToRelease,
      courses: [...courseCounts.values()],
      tests: testCounts,
      pairs,
    };
  }

  /**
   * The choice questions the hand-in of an expired attempt would auto-grade,
   * judged from each question's latest answer. Reads only when such attempts exist.
   * @returns Question ids per `testId|studentId` that gain a grade at hand-in.
   */
  private async inferAutoGrades(
    attempts: AssumedHandIn[],
    liveByTest: Map<string, Map<string, QuestionType>>,
  ): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    if (attempts.length === 0) return result;
    const latest = await this.db
      .collection<AnswerDocument>("answer")
      .aggregate<{ _id: { t: string; s: string; q: string }; type: string }>([
        {
          $match: {
            $or: attempts.map((a) => ({
              testId: a.testId,
              studentId: a.studentId,
            })),
          },
        },
        { $sort: { submittedAt: -1 } },
        {
          $group: {
            _id: { t: "$testId", s: "$studentId", q: "$questionId" },
            type: { $first: "$answer.type" },
          },
        },
      ])
      .toArray();
    for (const a of latest) {
      const questionType = liveByTest.get(a._id.t)?.get(a._id.q);
      const isChoice =
        questionType === "single_select" || questionType === "multi_select";
      if (!isChoice || a.type !== "mc") continue;
      const key = pairKey(a._id.t, a._id.s);
      const set = result.get(key) ?? new Set<string>();
      set.add(a._id.q);
      result.set(key, set);
    }
    return result;
  }
}
