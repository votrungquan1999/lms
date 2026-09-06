// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  MediaContentType,
  type Question,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import { describe, expect, it } from "vitest";
import { QuestionList } from "../question-list";

/** Builds a minimal single_select question, media-free, for the flag tests. */
function singleSelectQuestion(
  options: { text: string; isCorrect: boolean }[],
): SingleSelectQuestion {
  return {
    id: "q-1",
    testId: "test-1",
    title: "Pick the prime number",
    content: "Choose one.",
    order: 1,
    createdAt: new Date(0),
    weight: 1,
    media: [],
    type: "single_select",
    mcGradingStrategy: "all_or_nothing",
    options: options.map((o, i) => ({ id: `opt-${i}`, ...o })),
  };
}

/**
 * Feature: Question List media preview
 * As an admin editing a test
 * I want each question's media to show in the preview list
 * So that I can confirm the attachment renders before students see it
 */

describe("Feature: Question List media preview", () => {
  describe("Scenario: A question carries an image attachment", () => {
    it("should render the image using its resolved url", () => {
      // Setup — a question whose media already has a resolved (presigned) url
      const question: Question = {
        id: "q-1",
        testId: "test-1",
        title: "Q1: Arrays",
        content: "What does this diagram show?",
        order: 1,
        createdAt: new Date(0),
        weight: 1,
        type: "free_text",
        media: [
          {
            key: "media/questions/q-1/diagram.png",
            url: "https://s3.example/signed/diagram.png",
            contentType: MediaContentType.PNG,
            order: 0,
          },
        ],
      };

      // Action
      render(<QuestionList questions={[question]} />);

      // Assert — the attachment renders as an image pointing at the resolved url
      const image = screen.getByAltText("Question media 1");
      expect(image).toHaveAttribute(
        "src",
        "https://s3.example/signed/diagram.png",
      );
    });
  });

  describe("Scenario: an imported multiple-choice question has no correct option marked (D32/D44)", () => {
    it("shows a needs-answer-key flag", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: false },
      ]);

      render(<QuestionList questions={[question]} />);

      expect(screen.getByText(/needs an? answer key/i)).toBeInTheDocument();
    });

    it("does not show the flag once a correct option is marked", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ]);

      render(<QuestionList questions={[question]} />);

      expect(
        screen.queryByText(/needs an? answer key/i),
      ).not.toBeInTheDocument();
    });
  });
});
