import { z } from "zod";

/** The runner's 201 reply to a job create: the job's 24-hex id. */
export const runnerCreateReplySchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/),
});

/** A response body read as text and parsed to the create reply; unreadable text fails the parse instead of throwing. */
export const runnerCreateReplyTextSchema = z
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
  .pipe(runnerCreateReplySchema);
