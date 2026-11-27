"use client";

import { useActionState, useState } from "react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import type { AiGradeSuggestion } from "src/lib/ai-grade-types";
import { lineDiffCount } from "src/lib/line-diff-count";
import { pluralize } from "src/lib/pluralize";
import {
  type ApplyAiSuggestionState,
  applyAiSuggestionAction,
} from "./ai-grade-actions";
import { RegenerateQuestionDialog } from "./regenerate-question-dialog";

interface AiSuggestionPanelProps {
  testId: string;
  courseId: string;
  studentId: string;
  /** The question this panel grades — scopes the per-question regenerate. */
  questionId: string;
  /**
   * Full suggestion history for this question, newest-first
   * (`generatedAt` desc). When empty the component renders nothing.
   */
  suggestions: AiGradeSuggestion[];
  /**
   * The current latest answer's id for this question. Used to flag a row
   * as stale when `suggestion.gradedAgainstAnswerId !== latestAnswerId`.
   * Read-time only — no write-time invalidation. When `null` no row is
   * flagged stale.
   */
  latestAnswerId?: string | null;
  /** The student's current answer text, which the latest suggestion's fix is compared with. */
  studentAnswer?: string;
  /**
   * When true the history (`suggestions.slice(1)`) is expanded on first
   * render. Useful for tests; defaults to false in production usage.
   */
  defaultHistoryOpen?: boolean;
  /** True while a grading job is pending: the regenerate trigger is disabled. */
  regenerateDisabled?: boolean;
}

interface SuggestionRowProps {
  suggestion: AiGradeSuggestion;
  testId: string;
  courseId: string;
  studentId: string;
  isStale: boolean;
  /** The row is the latest suggestion, whose fix is shown on the left. */
  isLatest: boolean;
  studentAnswer?: string;
}

/**
 * AI suggestion panel — renders the latest suggestion plus a toggle to reveal
 * the rest of the history newest-first. Each row carries an inline Apply form
 * posting to `applyAiSuggestionAction`. The exclusive-applied invariant is
 * enforced server-side; this component does not gate Apply by row identity.
 *
 * Stable selectors for tests (per testing-pillars Resilience):
 *   - `data-testid="ai-suggestion-row"` on every row
 *   - `data-suggestion-id={row.id}` on every row
 *   - `data-applied={row.appliedAt ? "true" : "false"}` on every row
 *   - `data-testid="ai-suggestion-history-toggle"` on the View History button
 */
export function AiSuggestionPanel({
  testId,
  courseId,
  studentId,
  questionId,
  suggestions,
  latestAnswerId = null,
  studentAnswer,
  defaultHistoryOpen = false,
  regenerateDisabled = false,
}: AiSuggestionPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);

  if (suggestions.length === 0) return null;

  const latest = suggestions[0];
  if (!latest) return null;
  const older = suggestions.slice(1);

  /**
   * Read-time staleness: a row is stale iff its `gradedAgainstAnswerId`
   * does not match the current latest answer's id. When no latest answer
   * id is known (null), nothing is flagged stale.
   */
  const isRowStale = (row: AiGradeSuggestion): boolean =>
    latestAnswerId !== null && latestAnswerId !== row.gradedAgainstAnswerId;

  return (
    <div
      className="mt-2 rounded-md border border-border bg-card p-3 space-y-2"
      data-testid="ai-suggestion-panel"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          AI suggestion
        </p>
        <RegenerateQuestionDialog
          testId={testId}
          courseId={courseId}
          studentId={studentId}
          questionId={questionId}
          disabled={regenerateDisabled}
        />
      </div>
      <SuggestionRow
        suggestion={latest}
        testId={testId}
        courseId={courseId}
        studentId={studentId}
        isStale={isRowStale(latest)}
        isLatest
        studentAnswer={studentAnswer}
      />

      {older.length > 0 && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="ai-suggestion-history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? "Hide history" : `View history (${older.length})`}
          </Button>

          {historyOpen && (
            <ul className="space-y-2" data-testid="ai-suggestion-history">
              {older.map((row) => (
                <li key={row.id}>
                  <SuggestionRow
                    suggestion={row}
                    testId={testId}
                    courseId={courseId}
                    studentId={studentId}
                    isStale={isRowStale(row)}
                    isLatest={false}
                    studentAnswer={studentAnswer}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Single suggestion row — renders the score, feedback, model, regenerate
 * reason (if any), applied marker, and an Apply submit button posting to
 * `applyAiSuggestionAction`.
 */
function SuggestionRow({
  suggestion,
  testId,
  courseId,
  studentId,
  isStale,
  isLatest,
  studentAnswer,
}: SuggestionRowProps) {
  const [state, formAction, isPending] = useActionState<
    ApplyAiSuggestionState | null,
    FormData
  >(applyAiSuggestionAction, null);

  // An older suggestion's fix is not on the left, so its row can unfold it before the teacher uses it.
  const [fixOpen, setFixOpen] = useState(false);

  const applied = suggestion.appliedAt !== null;
  const fix =
    typeof suggestion.solution === "string" ? suggestion.solution : null;
  const fixLines = fix === null ? 0 : lineDiffCount(studentAnswer ?? "", fix);

  return (
    <div
      className="rounded-sm border border-border/60 p-2 space-y-1"
      data-testid="ai-suggestion-row"
      data-suggestion-id={suggestion.id}
      data-applied={applied ? "true" : "false"}
      data-stale={isStale ? "true" : "false"}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{suggestion.score} / 100</span>
        {applied && (
          <Badge variant="default" data-testid="ai-suggestion-applied-badge">
            Applied
          </Badge>
        )}
        {isStale && (
          <Badge variant="outline" data-testid="ai-suggestion-stale-badge">
            Stale
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {suggestion.model}
        </span>
        <span className="text-xs text-muted-foreground">
          {suggestion.generatedAt.toLocaleString()}
        </span>
      </div>

      <pre className="whitespace-pre-wrap text-sm text-foreground">
        {suggestion.feedback}
      </pre>

      {isLatest && fix !== null && (
        <p className="text-xs text-muted-foreground">
          Suggested fix: {fixLines} {pluralize(fixLines, "line")} changed ·
          shown on the left
        </p>
      )}

      {!isLatest && fix !== null && (
        <div className="space-y-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={fixOpen}
            onClick={() => setFixOpen((open) => !open)}
          >
            {fixOpen ? "Hide suggested fix" : "Show suggested fix"}
          </Button>
          {fixOpen && (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-sm">
              {fix}
            </pre>
          )}
        </div>
      )}

      {suggestion.regenerateReason !== null && (
        <p className="text-xs text-muted-foreground">
          Regen reason: {suggestion.regenerateReason}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="testId" value={testId} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="suggestionId" value={suggestion.id} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isPending}
          data-testid="ai-suggestion-apply-button"
        >
          {isPending ? "Applying…" : "Apply"}
        </Button>
        {state?.message && (
          <p
            className={`text-xs mt-1 ${
              state.success ? "text-green-600" : "text-destructive"
            }`}
          >
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
