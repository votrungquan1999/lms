// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { McOption } from "src/lib/question-service";
import { describe, expect, it } from "vitest";
import { McAnswerControls } from "../student-answer-controls.ui";
import type { StudentCardQuestion } from "../student-question-card.ui";

/** Two single-select questions on one page with no surrounding form, as the previews render them. */
function TwoQuestions() {
  const [first, setFirst] = useState<string[]>([]);
  const [second, setSecond] = useState<string[]>([]);
  return (
    <>
      <McAnswerControls
        questionId="q1"
        type="single_select"
        options={[
          { id: "q1-a", text: "Paris" },
          { id: "q1-b", text: "Rome" },
        ]}
        selectedIds={first}
        onChange={setFirst}
      />
      <McAnswerControls
        questionId="q2"
        type="single_select"
        options={[
          { id: "q2-a", text: "Cat" },
          { id: "q2-b", text: "Dog" },
        ]}
        selectedIds={second}
        onChange={setSecond}
      />
    </>
  );
}

describe("Feature: answer controls for several questions on one page", () => {
  it("keeps a pick on one question when another question is answered", async () => {
    const user = userEvent.setup();
    render(<TwoQuestions />);

    await user.click(screen.getByRole("radio", { name: "Paris" }));
    await user.click(screen.getByRole("radio", { name: "Dog" }));

    expect(screen.getByRole("radio", { name: "Paris" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dog" })).toBeChecked();
  });
});

describe("Feature: a student's answer controls never take the answer key", () => {
  it("refuses, at compile time, options that carry isCorrect", () => {
    const keyed: McOption[] = [{ id: "a", text: "Paris", isCorrect: true }];

    render(
      <McAnswerControls
        questionId="q1"
        type="single_select"
        // @ts-expect-error the answer key must not reach a student's browser
        options={keyed}
        selectedIds={[]}
        onChange={() => {}}
      />,
    );
    const card: Pick<StudentCardQuestion, "options"> = {
      // @ts-expect-error a student card's options carry no answer key
      options: keyed,
    };

    expect(card.options).toHaveLength(1);
  });
});
