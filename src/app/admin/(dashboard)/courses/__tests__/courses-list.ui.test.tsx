// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourseRowView } from "../courses-list.ui";

describe("CourseRowView", () => {
  it("writes the phone counts line in the singular for one student and one test", () => {
    // Given a course with one student and one test
    render(
      <CourseRowView
        href="/admin/courses/c1"
        title="Bio"
        meta="Nothing submitted yet"
        students={1}
        tests={1}
        waiting={0}
      />,
    );

    // Then the line shown below 768 px uses singular words
    expect(screen.getByText("1 student · 1 test")).toBeTruthy();
  });
});
