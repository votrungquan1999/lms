// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { AnnotationEntry } from "src/lib/annotation-service";
import type { Grade } from "src/lib/grade-service";
import type { ImageAnswerQuestion } from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it } from "vitest";
import { GradedQuestion } from "../graded-question";

const question: ImageAnswerQuestion = {
  id: "q-1",
  testId: "test-1",
  title: "Solve",
  content: "Upload your work",
  order: 1,
  createdAt: new Date("2026-01-01"),
  weight: 1,
  media: [],
  type: "image_answer",
};

const grade: Grade = {
  id: "g-1",
  testId: "test-1",
  questionId: "q-1",
  studentId: "student-1",
  score: 80,
  feedback: "Good work",
  solution: null,
  gradedAt: new Date("2026-01-02"),
};

const annotations: AnnotationEntry[] = [
  {
    mediaKey: "answers/student-1/p1.png",
    strokes: [
      {
        color: "#ff0000",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.4 },
        ],
      },
    ],
  },
];

describe("GradedQuestion — image answer with annotations", () => {
  it("shows the student's photo with the grader's annotation strokes over it", () => {
    // Given a revealed grade carrying annotations for the student's photo
    const { container } = render(
      <GradedQuestion
        question={question}
        studentAnswer={{
          type: "image",
          mediaKeys: ["answers/student-1/p1.png"],
        }}
        grade={grade}
        annotations={annotations}
        isMC={false}
        options={[]}
        correctAnswersVisible={false}
        testStatus={TestStatus.Graded}
        answerImages={[
          {
            key: "answers/student-1/p1.png",
            url: "https://files.example/p1.png",
          },
        ]}
      />,
    );

    // Then the photo renders and the grader's stroke is drawn over it
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://files.example/p1.png",
    );
    expect(container.querySelector("polyline")).not.toBeNull();
  });
});
