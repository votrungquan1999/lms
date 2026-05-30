import { describe, expect, it } from "vitest";
import { aiGradeBatchSchema } from "../grading-schema";

describe("aiGradeBatchSchema", () => {
  it("rejects a model grade whose solution is present but empty", () => {
    // Given: a model output where solution is present but an empty string.
    // The contract keeps the .min(1) gate even though solution is optional, so
    // a perfect score must OMIT the key entirely rather than emit "".
    const payload = {
      grades: [
        {
          questionId: "q1",
          score: 100,
          feedback: "Fully correct",
          solution: "",
        },
      ],
    };

    // When: validated against the output contract the SDK applies to the model.
    const parsed = aiGradeBatchSchema.safeParse(payload);

    // Then: it is rejected, with a too-small issue on the solution path.
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const solutionIssue = parsed.error.issues.find((issue) =>
      issue.path.includes("solution"),
    );
    expect(solutionIssue?.code).toBe("too_small");
  });
});
