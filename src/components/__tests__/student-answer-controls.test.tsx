// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { McAnswerControls } from "../student-answer-controls.ui";

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
          { id: "q1-a", text: "Paris", isCorrect: false },
          { id: "q1-b", text: "Rome", isCorrect: false },
        ]}
        selectedIds={first}
        onChange={setFirst}
      />
      <McAnswerControls
        questionId="q2"
        type="single_select"
        options={[
          { id: "q2-a", text: "Cat", isCorrect: false },
          { id: "q2-b", text: "Dog", isCorrect: false },
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
