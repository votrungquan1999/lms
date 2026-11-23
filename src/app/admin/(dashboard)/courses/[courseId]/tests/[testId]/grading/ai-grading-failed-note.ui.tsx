/**
 * Tells the teacher the last AI grading attempt ended without suggestions and can be retried.
 */
export function AiGradingFailedNote() {
  return (
    <p className="text-sm text-destructive" data-testid="ai-grading-failed">
      The last AI grading attempt did not finish. You can try again.
    </p>
  );
}
