import type { Collection, Db } from "mongodb";
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
    const doc: AiGradeJobDocument = {
      id: crypto.randomUUID(),
      schoolId: this.schoolId,
      ...input,
      status: AiGradeJobStatus.Pending,
      errorKind: null,
      errorMessage: null,
      createdAt: this.now(),
      finishedAt: null,
    };
    await this.jobs.insertOne(doc);
    return this.toAiGradeJob(doc);
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
    };
  }
}
