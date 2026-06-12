// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MediaContentType, type Question } from "src/lib/question-service";
import { describe, expect, it } from "vitest";
import { QuestionList } from "../question-list";

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
});
