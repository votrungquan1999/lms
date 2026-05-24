import type { Collection, Db } from "mongodb";
import type {
  AiClient,
  AiGradeBatchOutput,
  AiGradeBatchPriorGrade,
} from "src/lib/ai/ai-client";
import {
  AI_GRADER_ID,
  AI_MODEL_NAME,
  type AiGradeSuggestion,
  type AiGradeSuggestionDocument,
} from "src/lib/ai-grade-types";
import type { AnswerService } from "src/lib/answer-service";
import {
  type ApplySuggestionOverrides,
  applySuggestion as applySuggestionImpl,
} from "src/lib/apply-suggestion";
import type { GradeDocument, GradeService } from "src/lib/grade-service";
import type { QuestionService } from "src/lib/question-service";

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

  constructor(
    db: Db,
    private readonly aiClient: AiClient,
    private readonly questionService: QuestionService,
    private readonly answerService: AnswerService,
    private readonly gradeService: GradeService,
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

  async generateForStudent(
    testId: string,
    studentId: string,
    byAdminId: string,
  ): Promise<AiGradeSuggestion[]> {
    const candidates = await this.buildCandidates(testId, studentId);
    if (candidates.length === 0) return [];

    const aiResults = await this.aiClient.gradeFreeTextBatch(
      candidates.map((c) => ({
        questionId: c.questionId,
        questionContent: c.questionContent,
        studentAnswer: c.studentAnswer,
      })),
    );

    return this.persistSuggestions(
      testId,
      studentId,
      byAdminId,
      candidates,
      aiResults,
      null,
    );
  }

  /**
   * Regenerates AI suggestions. Appends NEW rows per still-in-scope free-text
   * question. History is append-only. Caller (action) validates `reason`.
   */
  async regenerateForStudent(
    testId: string,
    studentId: string,
    byAdminId: string,
    reason: string,
  ): Promise<AiGradeSuggestion[]> {
    const candidates = await this.buildCandidates(testId, studentId);
    if (candidates.length === 0) return [];

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

    const aiResults = await this.aiClient.gradeFreeTextBatch(
      candidates.map((c) => ({
        questionId: c.questionId,
        questionContent: c.questionContent,
        studentAnswer: c.studentAnswer,
      })),
      { reason, priorGrades },
    );

    return this.persistSuggestions(
      testId,
      studentId,
      byAdminId,
      candidates,
      aiResults,
      reason,
    );
  }

  /** Shared filter: free_text ∩ non-blank-answer ∩ no-existing-grade. */
  private async buildCandidates(
    testId: string,
    studentId: string,
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
      if (gradedQuestionIds.has(question.id)) continue;

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
   */
  async applySuggestion(
    suggestionId: string,
    byAdminId: string,
    overrides?: ApplySuggestionOverrides,
  ): Promise<AiGradeSuggestion> {
    return applySuggestionImpl(
      {
        suggestions: this.suggestions,
        grades: this.grades,
        gradeService: this.gradeService,
      },
      suggestionId,
      byAdminId,
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
    candidates: Candidate[],
    aiResults: AiGradeBatchOutput[],
    regenerateReason: string | null,
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
        solution: result.solution,
        gradedAgainstAnswerId: candidate.answerId,
        model: AI_MODEL_NAME,
        gradedBy: AI_GRADER_ID,
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
