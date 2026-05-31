import { describe, expect, it } from "vitest";
import { getScoreTone, ScoreTone } from "../score-tone";

describe("getScoreTone", () => {
  it("maps a score to success (>=80), warning (50-79), or destructive (<50) by band", () => {
    expect(getScoreTone(100)).toBe(ScoreTone.Success);
    expect(getScoreTone(80)).toBe(ScoreTone.Success);
    expect(getScoreTone(79)).toBe(ScoreTone.Warning);
    expect(getScoreTone(50)).toBe(ScoreTone.Warning);
    expect(getScoreTone(49)).toBe(ScoreTone.Destructive);
    expect(getScoreTone(0)).toBe(ScoreTone.Destructive);
  });
});
