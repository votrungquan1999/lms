import { AiGradeJobStatus } from "src/lib/ai-grade-job-service";
import {
  type AiGradeSuggestion,
  CollectOutcomeKind,
} from "src/lib/ai-grade-types";

interface AiJobStateInput {
  isPractice: boolean;
  /** The student's latest AI grading job, or null when none exists. */
  latestJob: { id: string; status: AiGradeJobStatus; createdAt: Date } | null;
  /** What collecting the job's result just did. */
  collected: { kind: CollectOutcomeKind };
  /** The student's AI suggestions by question. */
  suggestionsByQuestion: Map<string, AiGradeSuggestion[]>;
}

export interface AiJobState {
  /** When the pending job started; null when none is pending. */
  startedAt: Date | null;
  /** The latest job failed and no later suggestion superseded it. */
  failed: boolean;
  /** Changes with the job, so AI controls remount and a stale "started" message does not linger. */
  key: string;
}

/**
 * What the student's AI grading job is doing, for the notes, the refresher
 * and the locks on the AI controls. Follows the job, not the submission
 * status: a fully hand-graded submission still has a job whose result will
 * arrive. Practice tests never get an AI job.
 * @param input - The student's job, the collect outcome and her suggestions.
 * @returns The job's state.
 */
export function aiJobState(input: AiJobStateInput): AiJobState {
  const { isPractice, latestJob, collected, suggestionsByQuestion } = input;

  // A render that lost the claim saw the job end before the winner's rows were
  // readable, so it counts as in progress for one more refresh.
  const startedAt =
    !isPractice &&
    latestJob !== null &&
    (latestJob.status === AiGradeJobStatus.Pending ||
      collected.kind === CollectOutcomeKind.ClaimedElsewhere)
      ? latestJob.createdAt
      : null;

  // A later round (e.g. Gemini, which leaves no job row) supersedes the failed job.
  const hasSuggestionNewerThanJob =
    latestJob !== null &&
    [...suggestionsByQuestion.values()]
      .flat()
      .some((suggestion) => suggestion.generatedAt > latestJob.createdAt);
  const failed =
    !isPractice &&
    latestJob?.status === AiGradeJobStatus.Failed &&
    !hasSuggestionNewerThanJob;

  return {
    startedAt,
    failed,
    key: `${latestJob?.id ?? "none"}:${latestJob?.status ?? "none"}`,
  };
}
