import { z } from "zod";

/** The runner's 201 reply to a job create: the job's 24-hex id. */
export const runnerCreateReplySchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/),
});

/** A response body read as text and parsed to the create reply; unreadable text fails the parse instead of throwing. */
export const runnerCreateReplyTextSchema = jsonTextAs(runnerCreateReplySchema);

/** The statuses a runner job moves through. */
export const runnerJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

/** The reply to a status-only read. */
export const runnerJobStatusReplySchema = z.object({
  status: runnerJobStatusSchema,
});

/** The parts of a runner job the LMS reads; unknown keys are stripped. */
export const runnerJobSchema = z.object({
  id: z.string(),
  status: runnerJobStatusSchema,
  result: z
    .object({
      text: z.string(),
    })
    .nullable(),
  error: z
    .object({
      kind: z.string(),
      message: z.string(),
    })
    .nullable(),
});

/** A full runner job as the LMS reads it. */
export type RunnerJob = z.infer<typeof runnerJobSchema>;

/** A job status reply. */
export type RunnerJobStatus = z.infer<typeof runnerJobStatusSchema>;

/**
 * A response body read as text and parsed with `schema`; unreadable or
 * mismatching text fails the parse instead of throwing.
 * @param schema - The shape the body must have.
 */
export function jsonTextAs<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .transform((text, ctx) => {
      // Intentional boundary: a non-JSON body becomes a schema failure.
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "not json" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}
