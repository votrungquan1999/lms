import { describe, expect, it } from "vitest";
import { isValidQuestionMediaKey } from "../courses/[courseId]/tests/[testId]/question-media.schema";

const SCHOOL_A = "school-a";
const UUID = "1a2b3c4d-0000-4000-8000-000000000099";

/**
 * Feature: a school admin can only attach question images uploaded for
 * their own school
 * As a school admin
 * I want a media key to match my own school's minted prefix exactly
 * So that another school's or a malformed key can never be attached
 */
describe("isValidQuestionMediaKey", () => {
  it(`accepts a key minted for the given school`, () => {
    expect(
      isValidQuestionMediaKey(
        `media/schools/${SCHOOL_A}/questions/${UUID}.png`,
        SCHOOL_A,
      ),
    ).toBe(true);
  });

  it.each([
    ["a legacy unscoped key", `media/questions/${UUID}.png`],
    ["another school's key", `media/schools/school-b/questions/${UUID}.png`],
    ["an answers key", `answers/${SCHOOL_A}/${UUID}.png`],
    ["a materials key", `materials/courses/course-1/${UUID}.png`],
    [
      "a path-traversal attempt out of the school's questions folder",
      `media/schools/${SCHOOL_A}/questions/../../answers/student-1/x.jpg`,
    ],
    [
      "an extra path segment before the file",
      `media/schools/${SCHOOL_A}/questions/sub/x.png`,
    ],
    [
      "a school id that only has the real one as a prefix",
      `media/schools/${SCHOOL_A}x/questions/${UUID}.png`,
    ],
    [
      "a trailing query string",
      `media/schools/${SCHOOL_A}/questions/${UUID}.png?x=1`,
    ],
    [
      "a trailing fragment",
      `media/schools/${SCHOOL_A}/questions/${UUID}.png#x`,
    ],
    [
      "an extension no upload slot is minted with",
      `media/schools/${SCHOOL_A}/questions/${UUID}.svg`,
    ],
    [
      "extra content before the media path",
      `x/media/schools/${SCHOOL_A}/questions/${UUID}.png`,
    ],
  ])("refuses %s", (_label, key) => {
    expect(isValidQuestionMediaKey(key, SCHOOL_A)).toBe(false);
  });

  it("matches the school id literally, never as a regex pattern", () => {
    expect(
      isValidQuestionMediaKey(`media/schools/aXb/questions/${UUID}.png`, "a.b"),
    ).toBe(false);
  });
});
