import type { Collection, Db } from "mongodb";
import type {
  RunnerCheckEvent,
  RunnerCreateEvent,
  RunnerEvent,
} from "src/lib/ai/runner-event";
import { assertSchoolId } from "./assert-school-id";

/** The states an AI grading job moves through. */
export enum AiGradeJobStatus {
  Pending = "pending",
  Succeeded = "succeeded",
  Failed = "failed",
}

/** Which teacher action started a grading job. */
export enum AiGradeJobTrigger {
  AutoGrade = "auto_grade",
  RegenerateAll = "regenerate_all",
  RegenerateQuestion = "regenerate_question",
}

/** One answer the job grades: the snapshot the result is saved against. */
export interface AiGradeJobCandidate {
  questionId: string;
  answerId: string;
}

/**
 * A grading job stored in the `ai_grade_job` collection. At most one Pending
 * row exists per (testId, studentId), enforced by a partial unique index in
 * `ensureIndexes`.
 */
export interface AiGradeJobDocument {
  id: string;
  schoolId: string;
  courseId: string;
  testId: string;
  studentId: string;
  questionId: string | null;
  trigger: AiGradeJobTrigger;
  runnerJobId: string;
  candidates: AiGradeJobCandidate[];
  reason: string | null;
  includeGraded: boolean;
  byAdminId: string;
  status: AiGradeJobStatus;
  errorKind: string | null;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  /** The runner exchanges worth keeping, oldest first, at most `MAX_EVENTS`. */
  events: RunnerEvent[];
  /** The runner status the last recorded check saw; null before the first check. */
  lastSeenRunnerStatus: string | null;
}

/** Client-facing grading job. */
export interface AiGradeJob {
  id: string;
  schoolId: string;
  courseId: string;
  testId: string;
  studentId: string;
  questionId: string | null;
  trigger: AiGradeJobTrigger;
  runnerJobId: string;
  candidates: AiGradeJobCandidate[];
  reason: string | null;
  includeGraded: boolean;
  byAdminId: string;
  status: AiGradeJobStatus;
  errorKind: string | null;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  events: RunnerEvent[];
}

/** What a new pending job records; the service adds id, school, status and time. */
export interface CreateAiGradeJobInput {
  courseId: string;
  testId: string;
  studentId: string;
  questionId: string | null;
  trigger: AiGradeJobTrigger;
  runnerJobId: string;
  candidates: AiGradeJobCandidate[];
  reason: string | null;
  includeGraded: boolean;
  byAdminId: string;
  /** How the create ended; becomes the first entry of the job's history. */
  createEvent?: RunnerCreateEvent;
}

/** The most history entries a job keeps; a flapping job drops its oldest first. */
const MAX_EVENTS = 50;

/** How a job ended, written when it is claimed as final. */
export interface AiGradeJobFinalState {
  status: AiGradeJobStatus.Succeeded | AiGradeJobStatus.Failed;
  errorKind: string | null;
  errorMessage: string | null;
}

/** AiGradeJobService: one school's rows in the `ai_grade_job` collection. */
export class AiGradeJobService {
  private readonly jobs: Collection<AiGradeJobDocument>;

  /**
   * @param db - The database.
   * @param schoolId - The school whose jobs this service reads and writes.
   * @param now - Clock stamping `createdAt`; tests step it so two jobs never tie.
   */
  constructor(
    db: Db,
    private readonly schoolId: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    assertSchoolId(schoolId, "an AI grade job service");
    this.jobs = db.collection<AiGradeJobDocument>("ai_grade_job");
  }

  /**
   * Records a new pending job after the runner accepted it.
   * @param input - The snapshot the result will be saved against.
   * @throws A duplicate-key error when the submission already has a pending job.
   */
  async create(input: CreateAiGradeJobInput): Promise<AiGradeJob> {
    const { createEvent, ...snapshot } = input;
    const doc: AiGradeJobDocument = {
      id: crypto.randomUUID(),
      schoolId: this.schoolId,
      ...snapshot,
      status: AiGradeJobStatus.Pending,
      errorKind: null,
      errorMessage: null,
      createdAt: this.now(),
      finishedAt: null,
      events: createEvent ? [createEvent] : [],
      lastSeenRunnerStatus: null,
    };
    await this.jobs.insertOne(doc);
    return this.toAiGradeJob(doc);
  }

  /**
   * Whether the student has a job still running on the test.
   * @param testId - The test.
   * @param studentId - The student.
   */
  async hasPendingForStudent(
    testId: string,
    studentId: string,
  ): Promise<boolean> {
    const count = await this.jobs.countDocuments(
      {
        schoolId: this.schoolId,
        testId,
        studentId,
        status: AiGradeJobStatus.Pending,
      },
      { limit: 1 },
    );
    return count > 0;
  }

  /**
   * Returns the student's newest job on a test, or null.
   * @param testId - The test.
   * @param studentId - The student.
   */
  async getLatestForStudent(
    testId: string,
    studentId: string,
  ): Promise<AiGradeJob | null> {
    const doc = await this.jobs
      .find({ schoolId: this.schoolId, testId, studentId })
      // id ends the sort so equal timestamps never reorder.
      .sort({ createdAt: -1, id: -1 })
      .limit(1)
      .next();
    return doc ? this.toAiGradeJob(doc) : null;
  }

  /**
   * Ends a pending job, once. Only the caller whose update finds the job still
   * pending gets it back, so two renders can never both save its round.
   * @param runnerJobId - The runner's id for the job.
   * @param final - How the job ended.
   * @param endingCheck - The check that ended it; always recorded in the history.
   * @returns The ended job, or null when it was already final.
   */
  async claimFinal(
    runnerJobId: string,
    final: AiGradeJobFinalState,
    endingCheck: RunnerCheckEvent,
  ): Promise<AiGradeJob | null> {
    const doc = await this.jobs.findOneAndUpdate(
      {
        schoolId: this.schoolId,
        runnerJobId,
        status: AiGradeJobStatus.Pending,
      },
      {
        $set: {
          ...final,
          finishedAt: this.now(),
          lastSeenRunnerStatus: endingCheck.runnerStatus,
        },
        $push: { events: { $each: [endingCheck], $slice: -MAX_EVENTS } },
      },
      { returnDocument: "after" },
    );
    return doc ? this.toAiGradeJob(doc) : null;
  }

  /**
   * Adds a check to the history of a still-pending job, only when the runner
   * status it saw differs from the last one recorded. One filtered update keeps
   * the rule atomic across racing renders; a final job is never rewritten.
   * @param runnerJobId - The runner's id for the job.
   * @param event - The check; `unreachable` counts as a status.
   */
  async recordCheck(
    runnerJobId: string,
    event: RunnerCheckEvent,
  ): Promise<void> {
    await this.jobs.updateOne(
      {
        schoolId: this.schoolId,
        runnerJobId,
        status: AiGradeJobStatus.Pending,
        lastSeenRunnerStatus: { $ne: event.runnerStatus },
      },
      {
        $set: { lastSeenRunnerStatus: event.runnerStatus },
        $push: { events: { $each: [event], $slice: -MAX_EVENTS } },
      },
    );
  }

  private toAiGradeJob(doc: AiGradeJobDocument): AiGradeJob {
    return {
      id: doc.id,
      schoolId: doc.schoolId,
      courseId: doc.courseId,
      testId: doc.testId,
      studentId: doc.studentId,
      questionId: doc.questionId,
      trigger: doc.trigger,
      runnerJobId: doc.runnerJobId,
      candidates: doc.candidates,
      reason: doc.reason,
      includeGraded: doc.includeGraded,
      byAdminId: doc.byAdminId,
      status: doc.status,
      errorKind: doc.errorKind,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      finishedAt: doc.finishedAt,
      events: doc.events,
    };
  }
}
