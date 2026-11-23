import type { Collection, Db } from "mongodb";
import type {
  AiClient,
  AiGradeBatchOptions,
  AiGradeBatchOutput,
  AiGradeBatchPriorGrade,
} from "src/lib/ai/ai-client";
import {
  RunnerCreateOutcomeKind,
  RunnerReadOutcomeKind,
} from "src/lib/ai/background-claude-runner-client";
import { buildRunnerGradingPrompt } from "src/lib/ai/runner-grading-prompt";
import { parseRunnerGradingResult } from "src/lib/ai/runner-grading-result";
import {
  type RunnerClientProvider,
  RunnerClientResolutionKind,
  RunnerSettingsError,
} from "src/lib/ai/runner-settings";
import {
  type AiGradeJob,
  type AiGradeJobService,
  AiGradeJobStatus,
  AiGradeJobTrigger,
} from "src/lib/ai-grade-job-service";
import {
  AI_GRADER_ID,
  AI_MODEL_NAME,
  type AiGradeSuggestion,
  type AiGradeSuggestionDocument,
  type CollectOutcome,
  CollectOutcomeKind,
  RUNNER_GRADER_ID,
  RUNNER_MODEL_NAME,
  type StartRoundOutcome,
  StartRoundOutcomeKind,
  type StartRoundRequest,
} from "src/lib/ai-grade-types";
import type { AnswerService } from "src/lib/answer-service";
import {
  type ApplySuggestionOverrides,
  applySuggestion as applySuggestionImpl,
  type VerifiedSuggestionTarget,
} from "src/lib/apply-suggestion";
import type { GradeDocument, GradeService } from "src/lib/grade-service";
import type { QuestionService } from "src/lib/question-service";
import type { TestService } from "src/lib/test-service";
import { normalizeText } from "src/lib/text-normalization";

/** Internal candidate row for the generate/regenerate skip-filter. */
interface Candidate {
  questionId: string;
  questionContent: string;
  studentAnswer: string;
  answerId: string;
}

/**
 * AiGradeService — manages the `ai_grade` collection (Shape B).
 *
 * Strictly admin-side: suggestions never leak to students until a teacher
 * clicks Apply (Step 6), which promotes the chosen row into the real `grade`
 * collection via `GradeService`. This service contains NO defensive
 * try/catch — the action layer is the only error boundary.
 */
export class AiGradeService {
  private readonly suggestions: Collection<AiGradeSuggestionDocument>;
  private readonly grades: Collection<GradeDocument>;

  /**
   * @param db - The database.
   * @param aiClient - The model client that drafts the suggestions.
   * @param questionService - The same school's questions.
   * @param answerService - The same school's answers.
   * @param gradeService - The same school's grades, where Apply writes.
   * @param testService - The same school's tests, where every write looks up its test.
   * @param runnerClientProvider - Resolves the runner client when a round runs, never at construction.
   * @param jobService - The same school's grading jobs.
   */
  constructor(
    db: Db,
    private readonly aiClient: AiClient,
    private readonly questionService: QuestionService,
    private readonly answerService: AnswerService,
    private readonly gradeService: GradeService,
    private readonly testService: TestService,
    private readonly runnerClientProvider: RunnerClientProvider,
    private readonly jobService: AiGradeJobService,
  ) {
    this.suggestions = db.collection<AiGradeSuggestionDocument>("ai_grade");
    this.grades = db.collection<GradeDocument>("grade");
  }

  /**
   * Returns `true` if any AI suggestion exists for `(testId, studentId)`.
   * Bounded by `{ limit: 1 }` so it short-circuits on the first match.
   */
  async hasAnySuggestionsForStudent(
    testId: string,
    studentId: string,
  ): Promise<boolean> {
    const count = await this.suggestions.countDocuments(
      { testId, studentId },
      { limit: 1 },
    );
    return count > 0;
  }

  /**
   * Drafts AI suggestions for a student's ungraded free-text answers.
   * @param testId - The test.
   * @param studentId - The student whose answers are graded.
   * @param byAdminId - The admin triggering the generate.
   * @throws "Test not found" when the test isn't this school's.
   */
  async generateForStudent(
    testId: string,
    studentId: string,
    byAdminId: string,
  ): Promise<AiGradeSuggestion[]> {
    await this.testService.requireTest(testId);
    const candidates = await this.buildCandidates(testId, studentId);
    if (candidates.length === 0) return [];

    return this.gradeWithGemini(testId, studentId, byAdminId, candidates);
  }

  /**
   * Regenerates AI suggestions. Appends NEW rows per still-in-scope free-text
   * question. History is append-only. Caller (action) validates `reason`.
   * @param testId - The test.
   * @param studentId - The student whose answers are re-graded.
   * @param byAdminId - The admin triggering the regenerate.
   * @param reason - Why the teacher is regenerating (forwarded to the AI client).
   * @param includeGraded - Also regenerate questions the teacher already
   *   graded; their grade changes only on Apply.
   * @throws "Test not found" when the test isn't this school's.
   */
  async regenerateForStudent(
    testId: string,
    studentId: string,
    byAdminId: string,
    reason: string,
    includeGraded = false,
  ): Promise<AiGradeSuggestion[]> {
    await this.testService.requireTest(testId);
    const candidates = await this.buildCandidates(
      testId,
      studentId,
      includeGraded,
    );
    if (candidates.length === 0) return [];

    return this.gradeWithGemini(testId, studentId, byAdminId, candidates, {
      reason,
      priorGrades: await this.priorGradesFor(testId, studentId, candidates),
    });
  }

  /**
   * Regenerates the AI suggestion for a SINGLE free-text question, leaving every
   * other question's suggestions untouched. Appends a new row (history is
   * append-only) and forwards the question's prior grade as context. Runs even
   * when the teacher already graded the question; their grade changes only on
   * Apply. A non-free-text or blank answer yields no suggestion. Caller
   * (action) validates `reason`.
   * @param testId - The test.
   * @param studentId - The student whose answer is being re-graded.
   * @param questionId - The single question to regenerate.
   * @param byAdminId - The admin triggering the regenerate.
   * @param reason - Why the teacher is regenerating (forwarded to the AI client).
   * @throws "Test not found" when the test isn't this school's.
   */
  async regenerateForQuestion(
    testId: string,
    studentId: string,
    questionId: string,
    byAdminId: string,
    reason: string,
  ): Promise<AiGradeSuggestion[]> {
    await this.testService.requireTest(testId);
    // The teacher picked this question, so their own grade never blocks it.
    const candidates = await this.buildCandidates(testId, studentId, true);
    const scoped = candidates.filter((c) => c.questionId === questionId);
    if (scoped.length === 0) return [];

    return this.gradeWithGemini(testId, studentId, byAdminId, scoped, {
      reason,
      priorGrades: await this.priorGradesFor(testId, studentId, scoped),
    });
  }

  /**
   * Starts one grading round for a teacher's click. With a ready runner the
   * round becomes a pending job and the suggestions arrive later; with no
   * runner configured Gemini grades on the spot.
   * @param request - Which trigger, whose submission, and the teacher's input.
   * @returns AlreadyPending, without starting anything, when a job is still running for the submission.
   * @throws "Test not found" when the test isn't this school's.
   * @throws RunnerSettingsError when a runner setting is unusable.
   */
  async startRound(request: StartRoundRequest): Promise<StartRoundOutcome> {
    await this.testService.requireTest(request.testId);

    // One job per submission: a second round would never be collected.
    if (
      await this.jobService.hasPendingForStudent(
        request.testId,
        request.studentId,
      )
    ) {
      return { kind: StartRoundOutcomeKind.AlreadyPending };
    }

    const candidates = await this.candidatesFor(request);
    if (candidates.length === 0) {
      return { kind: StartRoundOutcomeKind.NothingToGrade };
    }

    // Auto-grade has no earlier round to explain, so it carries no regenerate context.
    const opts: AiGradeBatchOptions | undefined =
      request.trigger === AiGradeJobTrigger.AutoGrade
        ? undefined
        : {
            reason: request.reason ?? "",
            priorGrades: await this.priorGradesFor(
              request.testId,
              request.studentId,
              candidates,
            ),
          };

    const runner = this.runnerClientProvider();
    switch (runner.kind) {
      case RunnerClientResolutionKind.Disabled:
        return {
          kind: StartRoundOutcomeKind.Completed,
          suggestions: await this.gradeWithGemini(
            request.testId,
            request.studentId,
            request.byAdminId,
            candidates,
            opts,
          ),
        };
      case RunnerClientResolutionKind.Invalid:
        throw new RunnerSettingsError(runner.variable);
      case RunnerClientResolutionKind.Ready: {
        const created = await runner.client.createJob(
          buildRunnerGradingPrompt(
            candidates.map((c) => ({
              questionId: c.questionId,
              questionContent: c.questionContent,
              studentAnswer: c.studentAnswer,
            })),
            opts,
          ),
        );
        if (created.kind !== RunnerCreateOutcomeKind.Created) {
          throw new Error(`Runner create ${created.kind}: ${created.cause}`);
        }
        const job = await this.jobService.create({
          courseId: request.courseId,
          testId: request.testId,
          studentId: request.studentId,
          questionId: request.questionId ?? null,
          trigger: request.trigger,
          runnerJobId: created.jobId,
          candidates: candidates.map((c) => ({
            questionId: c.questionId,
            answerId: c.answerId,
          })),
          reason: request.reason,
          includeGraded: request.includeGraded,
          byAdminId: request.byAdminId,
        });
        return { kind: StartRoundOutcomeKind.Queued, job };
      }
    }
  }

  /**
   * Checks the submission's pending runner job and ends it when the runner is done.
   * Every runner failure is a typed outcome, so a page render never throws on one.
   * @param testId - The test.
   * @param studentId - The student.
   */
  async collectRunnerResult(
    testId: string,
    studentId: string,
  ): Promise<CollectOutcome> {
    const job = await this.jobService.getLatestForStudent(testId, studentId);
    if (job?.status !== AiGradeJobStatus.Pending) {
      return { kind: CollectOutcomeKind.NoPendingJob };
    }
    const runner = this.runnerClientProvider();
    if (runner.kind !== RunnerClientResolutionKind.Ready) {
      return { kind: CollectOutcomeKind.NoPendingJob };
    }

    const status = await runner.client.readStatus(job.runnerJobId);
    if (status.kind !== RunnerReadOutcomeKind.Found) {
      return { kind: CollectOutcomeKind.StillWaiting, runnerStatus: null };
    }
    if (status.body.status !== "succeeded") {
      return {
        kind: CollectOutcomeKind.StillWaiting,
        runnerStatus: status.body.status,
      };
    }

    const full = await runner.client.readJob(job.runnerJobId);
    if (full.kind !== RunnerReadOutcomeKind.Found || !full.body.result) {
      return { kind: CollectOutcomeKind.StillWaiting, runnerStatus: null };
    }
    const parsed = parseRunnerGradingResult(full.body.result.text);
    if (!("grades" in parsed)) {
      return { kind: CollectOutcomeKind.StillWaiting, runnerStatus: null };
    }

    // Claim before inserting: of two racing checks only one gets the job and saves the rows.
    const claimed = await this.jobService.claimFinal(job.runnerJobId, {
      status: AiGradeJobStatus.Succeeded,
      errorKind: null,
      errorMessage: null,
    });
    if (!claimed) return { kind: CollectOutcomeKind.ClaimedElsewhere };

    const saved = await this.completeRunnerJob(claimed, parsed.grades);
    return { kind: CollectOutcomeKind.Saved, count: saved.length };
  }

  /**
   * Saves a finished runner job's grades as suggestion rows labelled as graded by Claude.
   * @param job - The claimed job, which carries the snapshot the grades answer.
   * @param grades - The grades parsed from the runner's result.
   */
  private async completeRunnerJob(
    job: AiGradeJob,
    grades: AiGradeBatchOutput[],
  ): Promise<AiGradeSuggestion[]> {
    return this.persistSuggestions(
      job.testId,
      job.studentId,
      job.byAdminId,
      job.candidates,
      grades,
      job.reason,
      { model: RUNNER_MODEL_NAME, gradedBy: RUNNER_GRADER_ID },
    );
  }

  /**
   * The answers one trigger puts in scope.
   * @param request - The round being started.
   */
  private async candidatesFor(
    request: StartRoundRequest,
  ): Promise<Candidate[]> {
    switch (request.trigger) {
      case AiGradeJobTrigger.AutoGrade:
        return this.buildCandidates(request.testId, request.studentId, false);
      case AiGradeJobTrigger.RegenerateAll:
        return this.buildCandidates(
          request.testId,
          request.studentId,
          request.includeGraded,
        );
      case AiGradeJobTrigger.RegenerateQuestion: {
        // The teacher picked this question, so their own grade never blocks it.
        const all = await this.buildCandidates(
          request.testId,
          request.studentId,
          true,
        );
        return all.filter((c) => c.questionId === request.questionId);
      }
    }
  }

  /**
   * The latest earlier suggestion per candidate, sent as context on a regenerate.
   * @param testId - The test.
   * @param studentId - The student.
   * @param candidates - The answers being graded.
   */
  private async priorGradesFor(
    testId: string,
    studentId: string,
    candidates: Candidate[],
  ): Promise<AiGradeBatchPriorGrade[]> {
    const priorGrades: AiGradeBatchPriorGrade[] = [];
    for (const candidate of candidates) {
      const prior = await this.getLatestSuggestion(
        testId,
        candidate.questionId,
        studentId,
      );
      if (prior) {
        priorGrades.push({
          questionId: candidate.questionId,
          score: prior.score,
          feedback: prior.feedback,
          solution: prior.solution,
        });
      }
    }
    return priorGrades;
  }

  /**
   * Grades the candidates through the Gemini client and saves the suggestions.
   * @param testId - The test.
   * @param studentId - The student.
   * @param byAdminId - The admin who triggered the round.
   * @param candidates - The answers to grade.
   * @param opts - Regenerate context; absent on a first pass.
   */
  private async gradeWithGemini(
    testId: string,
    studentId: string,
    byAdminId: string,
    candidates: Candidate[],
    opts?: AiGradeBatchOptions,
  ): Promise<AiGradeSuggestion[]> {
    const items = candidates.map((c) => ({
      questionId: c.questionId,
      questionContent: c.questionContent,
      studentAnswer: c.studentAnswer,
    }));
    // The client records any round given options as a regenerate, so a first pass passes none.
    const aiResults =
      opts === undefined
        ? await this.aiClient.gradeFreeTextBatch(items)
        : await this.aiClient.gradeFreeTextBatch(items, opts);

    return this.persistSuggestions(
      testId,
      studentId,
      byAdminId,
      candidates,
      aiResults,
      opts?.reason ?? null,
    );
  }

  /**
   * Shared filter: free_text ∩ non-blank-answer, and no existing teacher grade
   * unless `includeGraded` is set.
   * @param testId - The test.
   * @param studentId - The student whose answers are filtered.
   * @param includeGraded - Keep questions the teacher already graded.
   */
  private async buildCandidates(
    testId: string,
    studentId: string,
    includeGraded = false,
  ): Promise<Candidate[]> {
    const questions = await this.questionService.listQuestions(testId);
    const answers = await this.answerService.getLatestAnswers(
      testId,
      studentId,
    );
    const existingGrades = await this.gradeService.getGrades(testId, studentId);
    const gradedQuestionIds = new Set(existingGrades.map((g) => g.questionId));

    const candidates: Candidate[] = [];
    for (const question of questions) {
      if (question.type !== "free_text") continue;
      if (!includeGraded && gradedQuestionIds.has(question.id)) continue;

      const studentAnswer = answers.find((a) => a.questionId === question.id);
      if (!studentAnswer || studentAnswer.answer.type !== "free_text") continue;

      const text = studentAnswer.answer.text;
      if (text.trim() === "") continue;

      candidates.push({
        questionId: question.id,
        questionContent: question.content,
        studentAnswer: text,
        answerId: studentAnswer.id,
      });
    }
    return candidates;
  }

  /**
   * Promotes an AI suggestion into the real `grade` collection. Delegates to
   * `apply-suggestion.ts`. See that module for apply order + refusal policy.
   * @param verified - The test and student the caller already checked.
   * @throws "Test not found" when the test isn't this school's.
   */
  async applySuggestion(
    suggestionId: string,
    byAdminId: string,
    verified: VerifiedSuggestionTarget,
    overrides?: ApplySuggestionOverrides,
  ): Promise<AiGradeSuggestion> {
    // Before any write: Apply marks the suggestion before writing the grade.
    await this.testService.requireTest(verified.testId);
    return applySuggestionImpl(
      {
        suggestions: this.suggestions,
        grades: this.grades,
        gradeService: this.gradeService,
      },
      suggestionId,
      byAdminId,
      verified,
      overrides,
    );
  }

  /**
   * Returns ALL suggestions for a `(testId, studentId)` pair as a map keyed
   * by `questionId`. Each entry holds the full history for that question
   * sorted newest-first (`generatedAt` desc). Used by the grading page to
   * render the AI suggestion panel per free-text question.
   */
  async getSuggestionsForStudent(
    testId: string,
    studentId: string,
  ): Promise<Map<string, AiGradeSuggestion[]>> {
    const docs = await this.suggestions
      .find({ testId, studentId })
      .sort({ generatedAt: -1 })
      .toArray();

    const grouped = new Map<string, AiGradeSuggestion[]>();
    for (const doc of docs) {
      const list = grouped.get(doc.questionId) ?? [];
      list.push(this.toSuggestion(doc));
      grouped.set(doc.questionId, list);
    }
    return grouped;
  }

  /**
   * Returns the most-recent suggestion document for the given
   * `(testId, questionId, studentId)` triple, or `null` if none exists.
   * Sorted by `generatedAt` desc and limited to 1 so it costs one index hit.
   */
  async getLatestSuggestion(
    testId: string,
    questionId: string,
    studentId: string,
  ): Promise<AiGradeSuggestionDocument | null> {
    return this.suggestions
      .find({ testId, questionId, studentId })
      .sort({ generatedAt: -1 })
      .limit(1)
      .next();
  }

  /**
   * Builds the new suggestion rows for a batch (initial or regenerate),
   * inserts them, and returns the client-facing shape.
   */
  private async persistSuggestions(
    testId: string,
    studentId: string,
    byAdminId: string,
    candidates: { questionId: string; answerId: string }[],
    aiResults: AiGradeBatchOutput[],
    regenerateReason: string | null,
    label: { model: string; gradedBy: string } = {
      model: AI_MODEL_NAME,
      gradedBy: AI_GRADER_ID,
    },
  ): Promise<AiGradeSuggestion[]> {
    const resultByQuestionId = new Map(aiResults.map((r) => [r.questionId, r]));

    const now = new Date();
    const docs: AiGradeSuggestionDocument[] = [];
    for (const candidate of candidates) {
      const result = resultByQuestionId.get(candidate.questionId);
      if (!result) {
        throw new Error(
          `AI client did not return a result for question ${candidate.questionId}`,
        );
      }

      docs.push({
        id: crypto.randomUUID(),
        testId,
        questionId: candidate.questionId,
        studentId,
        score: result.score,
        feedback: result.feedback,
        solution:
          result.solution === undefined
            ? undefined
            : normalizeText(result.solution),
        gradedAgainstAnswerId: candidate.answerId,
        model: label.model,
        gradedBy: label.gradedBy,
        generatedByAdminId: byAdminId,
        generatedAt: now,
        regenerateReason,
        appliedAt: null,
        appliedBy: null,
      });
    }

    await this.suggestions.insertMany(docs);

    return docs.map((doc) => this.toSuggestion(doc));
  }

  private toSuggestion(doc: AiGradeSuggestionDocument): AiGradeSuggestion {
    return {
      id: doc.id,
      testId: doc.testId,
      questionId: doc.questionId,
      studentId: doc.studentId,
      score: doc.score,
      feedback: doc.feedback,
      solution: doc.solution,
      gradedAgainstAnswerId: doc.gradedAgainstAnswerId,
      model: doc.model,
      generatedAt: doc.generatedAt,
      regenerateReason: doc.regenerateReason,
      appliedAt: doc.appliedAt,
      appliedBy: doc.appliedBy,
    };
  }
}
