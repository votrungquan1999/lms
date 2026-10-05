import type { Collection, Db, UpdateFilter } from "mongodb";
import type { CourseService } from "./course-service";

/**
 * How a student sees their free-text answer once it's revealed: lined up
 * side-by-side against the correct answer ("diff"), or the correct answer
 * written out plainly ("plain").
 */
export type AnswerRevealMode = "diff" | "plain";

/**
 * Test document stored in the `test` collection.
 */
export interface TestDocument {
  id: string;
  courseId: string;
  title: string;
  description: string;
  showCorrectAnswerAfterSubmit: boolean;
  showGradeAfterSubmit: boolean;
  answerRevealMode: AnswerRevealMode;
  /** Exam time limit in minutes; null means untimed. */
  timeLimitMinutes: number | null;
  /** When true, this is a formative practice test: no grades, reveal-on-answer. */
  isPractice: boolean;
  correctAnswersReleasedAt: Date | null;
  gradesReleasedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  /** Owning school. Absent or `null` on records not yet assigned — no school can see those. */
  schoolId: string | null;
}

/**
 * Client-facing test interface.
 */
export interface Test {
  id: string;
  courseId: string;
  title: string;
  description: string;
  showCorrectAnswerAfterSubmit: boolean;
  showGradeAfterSubmit: boolean;
  /** Exam time limit in minutes; null means untimed. */
  timeLimitMinutes: number | null;
  /** When true, this is a formative practice test: no grades, reveal-on-answer. */
  isPractice: boolean;
  answerRevealMode: AnswerRevealMode;
  correctAnswersReleasedAt: Date | null;
  gradesReleasedAt: Date | null;
  createdAt: Date;
}

/**
 * Input for creating a new test.
 */
export interface CreateTestInput {
  title: string;
  description: string;
  createdBy: string;
  showCorrectAnswerAfterSubmit?: boolean;
  showGradeAfterSubmit?: boolean;
  /** Defaults to false. When true, forbids a non-null timeLimitMinutes (R10). */
  isPractice?: boolean;
  /** Exam time limit in minutes; null/omitted means untimed. Mutually exclusive with isPractice (R10). */
  timeLimitMinutes?: number | null;
  /** Defaults to "plain" (D7) — new tests default to the correct answer written out plainly. */
  answerRevealMode?: AnswerRevealMode;
}

/**
 * Input for overwriting a test's visibility flags via the admin settings panel.
 */
export interface UpdateTestSettingsInput {
  showGradeAfterSubmit: boolean;
  showCorrectAnswerAfterSubmit: boolean;
  timeLimitMinutes: number | null;
  isPractice: boolean;
  answerRevealMode: AnswerRevealMode;
  updatedBy: string;
}

/**
 * TestService — manages one school's tests in the `test` collection.
 */
export class TestService {
  private readonly tests: Collection<TestDocument>;

  /**
   * @param db - The database.
   * @param schoolId - The school every query is bound to.
   * @param courseService - The same school's courses, where a new test's course is looked up.
   */
  constructor(
    db: Db,
    private readonly schoolId: string,
    private readonly courseService: CourseService,
  ) {
    // Fail closed: a missing school would query `{ schoolId: null }`, which
    // matches exactly the tests no school owns yet.
    if (!schoolId) {
      throw new Error("A school is required to build a test service");
    }
    this.tests = db.collection<TestDocument>("test");
  }

  /**
   * Creates a test under one of this school's courses.
   * @param courseId - The course the test belongs to.
   * @param input - The test's title, description and settings.
   * @throws "Course not found" when the course isn't this school's.
   */
  async createTest(courseId: string, input: CreateTestInput): Promise<Test> {
    if (input.isPractice && input.timeLimitMinutes != null) {
      throw new Error("A practice test cannot have a time limit.");
    }
    // Found through this school's courses, so the school stamped below is the course's own.
    if (!(await this.courseService.getCourse(courseId))) {
      throw new Error("Course not found");
    }

    const doc: TestDocument = {
      id: crypto.randomUUID(),
      courseId,
      title: input.title,
      description: input.description,
      showCorrectAnswerAfterSubmit: input.showCorrectAnswerAfterSubmit ?? true,
      showGradeAfterSubmit: input.showGradeAfterSubmit ?? true,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      isPractice: input.isPractice ?? false,
      // New tests default to "plain" (D7) — opposite of toTest's read-time
      // default below, which protects tests that predate this field.
      answerRevealMode: input.answerRevealMode ?? "plain",
      correctAnswersReleasedAt: null,
      gradesReleasedAt: null,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      schoolId: this.schoolId,
    };

    await this.tests.insertOne(doc);

    return this.toTest(doc);
  }

  async getTest(testId: string): Promise<Test | null> {
    const doc = await this.tests.findOne({
      id: testId,
      deletedAt: null,
      schoolId: this.schoolId,
    });
    return doc ? this.toTest(doc) : null;
  }

  /**
   * Returns the school's live test for a write that hangs off it.
   * @param testId - The test a child write names.
   * @throws "Test not found" when the test is missing, deleted, or another school's.
   */
  async requireTest(testId: string): Promise<Test> {
    const test = await this.getTest(testId);
    if (!test) {
      throw new Error("Test not found");
    }
    return test;
  }

  async listTests(courseId: string): Promise<Test[]> {
    const docs = await this.tests
      .find({ courseId, deletedAt: null, schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => this.toTest(doc));
  }

  /**
   * Returns every non-deleted test across the school's courses, sorted by
   * `createdAt` desc. Used by the grading hub and admin dashboard for
   * cross-course aggregation.
   */
  async listAllTests(): Promise<Test[]> {
    const docs = await this.tests
      .find({ deletedAt: null, schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => this.toTest(doc));
  }

  private toTest(doc: TestDocument): Test {
    return {
      id: doc.id,
      courseId: doc.courseId,
      title: doc.title,
      description: doc.description,
      showCorrectAnswerAfterSubmit: doc.showCorrectAnswerAfterSubmit,
      showGradeAfterSubmit: doc.showGradeAfterSubmit,
      timeLimitMinutes: doc.timeLimitMinutes ?? null,
      isPractice: doc.isPractice ?? false,
      // Missing means the row predates this field: keep the side-by-side comparison its students already saw (D7/D9).
      answerRevealMode: doc.answerRevealMode ?? "diff",
      correctAnswersReleasedAt: doc.correctAnswersReleasedAt,
      gradesReleasedAt: doc.gradesReleasedAt,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Overwrites a test's visibility flags and stamps audit fields.
   * Does NOT touch `gradesReleasedAt` or `correctAnswersReleasedAt` — those are
   * owned by the dedicated release mutators (`releaseGrades`, `releaseCorrectAnswers`).
   * @throws "Test not found" when the test is missing or another school's.
   */
  async updateTestSettings(
    testId: string,
    input: UpdateTestSettingsInput,
  ): Promise<void> {
    if (input.isPractice && input.timeLimitMinutes != null) {
      throw new Error("A practice test cannot have a time limit.");
    }

    await this.updateOwnTest(testId, {
      $set: {
        showGradeAfterSubmit: input.showGradeAfterSubmit,
        showCorrectAnswerAfterSubmit: input.showCorrectAnswerAfterSubmit,
        timeLimitMinutes: input.timeLimitMinutes,
        isPractice: input.isPractice,
        answerRevealMode: input.answerRevealMode,
        updatedAt: new Date(),
        updatedBy: input.updatedBy,
      },
    });
  }

  /**
   * Releases a test's grades to every student.
   * @param testId - The test to release.
   * @param updatedBy - The admin releasing.
   * @throws "Test not found" when the test is missing or another school's.
   */
  async releaseGrades(testId: string, updatedBy: string): Promise<void> {
    await this.updateOwnTest(testId, {
      $set: {
        gradesReleasedAt: new Date(),
        updatedBy,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Releases a test's correct answers to every student.
   * @param testId - The test to release.
   * @param updatedBy - The admin releasing.
   * @throws "Test not found" when the test is missing or another school's.
   */
  async releaseCorrectAnswers(
    testId: string,
    updatedBy: string,
  ): Promise<void> {
    await this.updateOwnTest(testId, {
      $set: {
        correctAnswersReleasedAt: new Date(),
        updatedBy,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Soft-deletes a test so it no longer appears in lists or lookups.
   * @param testId - The test to delete.
   * @param deletedBy - The admin deleting.
   * @throws "Test not found" when the test is missing or another school's.
   */
  async deleteTest(testId: string, deletedBy: string): Promise<void> {
    await this.updateOwnTest(testId, {
      $set: {
        deletedAt: new Date(),
        deletedBy,
        updatedAt: new Date(),
        updatedBy: deletedBy,
      },
    });
  }

  /**
   * Applies `update` to one of this school's tests.
   * @param testId - The test to change.
   * @param update - The Mongo update to apply.
   * @throws "Test not found" when the test is missing or another school's.
   */
  private async updateOwnTest(
    testId: string,
    update: UpdateFilter<TestDocument>,
  ): Promise<void> {
    const result = await this.tests.updateOne(
      { id: testId, schoolId: this.schoolId },
      update,
    );
    if (result.matchedCount === 0) {
      throw new Error("Test not found");
    }
  }
}
