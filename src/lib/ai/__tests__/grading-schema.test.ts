import { describe, expect, it } from "vitest";
import { aiGradeBatchSchema } from "../grading-schema";

describe("aiGradeBatchSchema", () => {
  it("rejects an item missing the solution field", () => {
    const payload = {
      grades: [
        {
          questionId: "q1",
          score: 80,
          feedback: "Good attempt",
        },
      ],
    };

    const parsed = aiGradeBatchSchema.safeParse(payload);

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const hasSolutionIssue = parsed.error.issues.some((issue) =>
      issue.path.includes("solution"),
    );
    expect(hasSolutionIssue).toBe(true);
  });
});
