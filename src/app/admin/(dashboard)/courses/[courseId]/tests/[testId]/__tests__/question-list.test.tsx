// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  type FreeTextQuestion,
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

/** Builds a minimal free_text question, media-free, for the read-visibility tests. */
function freeTextQuestion(
  overrides: Partial<FreeTextQuestion> = {},
): FreeTextQuestion {
  return {
    id: "q-1",
    testId: "test-1",
    title: "Describe photosynthesis",
    content: "Describe the process.",
    order: 1,
    createdAt: new Date(0),
    weight: 1,
    media: [],
    type: "free_text",
    ...overrides,
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
      render(<QuestionList questions={[question]} courseId="course-1" />);

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

      render(<QuestionList questions={[question]} courseId="course-1" />);

      expect(screen.getByText(/needs an? answer key/i)).toBeInTheDocument();
    });

    it("does not show the flag once a correct option is marked", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ]);

      render(<QuestionList questions={[question]} courseId="course-1" />);

      expect(
        screen.queryByText(/needs an? answer key/i),
      ).not.toBeInTheDocument();
    });
  });
});

/**
 * Feature: A teacher can see what a question already holds (Step 19)
 * As a teacher who already wrote a question
 * I want its stored model answer, explanation and answer-reveal setting visible on its card
 * So that I know what I'm changing before I open the edit panel
 */
describe("Feature: Question read-visibility", () => {
  describe("Scenario: a free_text question already carries a model answer, explanation and reveal override", () => {
    it("shows the model answer, explanation and current answer-reveal setting", () => {
      const question = freeTextQuestion({
        referenceAnswer: "Plants convert light into chemical energy.",
        explanation: "Focus on the role of chlorophyll.",
        answerRevealMode: "plain",
      });

      render(<QuestionList questions={[question]} courseId="course-1" />);

      // Scoped to the read-only <p> summary — the same value also legitimately
      // appears as the editable field's defaultValue in the panel below it.
      expect(
        screen.getByText(/plants convert light into chemical energy/i, {
          selector: "p",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/focus on the role of chlorophyll/i, {
          selector: "p",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Plain")).toBeInTheDocument();
    });
  });

  describe("Scenario: a multiple-choice question already has options and a grading strategy", () => {
    it("shows the question's type, options with the correct one marked, and its grading strategy", () => {
      const question = singleSelectQuestion([
        { text: "4", isCorrect: false },
        { text: "7", isCorrect: true },
      ]);

      render(<QuestionList questions={[question]} courseId="course-1" />);

      expect(screen.getByText(/single/i)).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText(/7.*correct/i)).toBeInTheDocument();
      expect(screen.getByText(/all.or.nothing/i)).toBeInTheDocument();
    });
  });
});
