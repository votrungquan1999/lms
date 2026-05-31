import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { summarizeTestStatuses } from "../dashboard-summary";

describe("Feature: summarizeTestStatuses aggregates test statuses", () => {
  it("should count to-do (not started + in progress), awaiting grade, and graded", () => {
    const statuses = [
      TestStatus.NotStarted,
      TestStatus.InProgress,
      TestStatus.InProgress,
      TestStatus.Submitted,
      TestStatus.Graded,
      TestStatus.Graded,
      TestStatus.Graded,
    ];

    expect(summarizeTestStatuses(statuses)).toEqual({
      toDo: 3,
      awaitingGrade: 1,
      graded: 3,
    });
  });
});
