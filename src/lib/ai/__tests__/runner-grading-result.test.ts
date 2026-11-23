import { readFileSync } from "node:fs";
import { parseRunnerGradingResult } from "src/lib/ai/runner-grading-result";
import { describe, expect, it } from "vitest";

const BARE = JSON.stringify({
  grades: [{ questionId: "q1", score: 70, feedback: "ok" }],
});

describe("parseRunnerGradingResult", () => {
  it("reads bare JSON", () => {
    expect(parseRunnerGradingResult(BARE)).toEqual({
      grades: [{ questionId: "q1", score: 70, feedback: "ok" }],
    });
  });

  it("reads JSON inside a json code fence", () => {
    const fenced = readFileSync(
      "src/lib/ai/__tests__/fixtures/runner-result.txt",
      "utf8",
    );

    expect(parseRunnerGradingResult(fenced)).toMatchObject({
      grades: [{ questionId: "QUESTION_ID", score: 85 }],
    });
  });

  it("reads JSON inside a bare code fence", () => {
    expect(parseRunnerGradingResult(`\`\`\`\n${BARE}\n\`\`\``)).toHaveProperty(
      "grades",
    );
  });

  it("reports not_json for prose, without echoing it", () => {
    expect(parseRunnerGradingResult("Here are the grades: none")).toEqual({
      reason: "not_json",
    });
  });

  it("reports schema_mismatch when the JSON has the wrong shape", () => {
    expect(
      parseRunnerGradingResult(
        JSON.stringify({
          grades: [{ questionId: "q1", score: 101, feedback: "x" }],
        }),
      ),
    ).toEqual({ reason: "schema_mismatch" });
  });
});
