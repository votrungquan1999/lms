import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const SAMPLE_ENTRIES = [
  {
    mediaKey: "answers/student-1/p1.png",
    strokes: [
      {
        color: "#ff0000",
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
      },
    ],
  },
];

describe("AnnotationService - Integration Tests", () => {
  dbIt(
    "saveAnnotations persists the strokes and getAnnotations returns them",
    async ({ db }) => {
      const { annotationService } = buildCoreServices(db);

      // Given a grader saves annotations for a student's answer photo
      await annotationService.saveAnnotations({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        gradedBy: "teacher",
        annotations: SAMPLE_ENTRIES,
      });

      // Then getAnnotations returns exactly those entries
      const entries = await annotationService.getAnnotations(
        "test-1",
        "q-1",
        "student-1",
      );
      expect(entries).toEqual(SAMPLE_ENTRIES);
    },
  );

  dbIt(
    "an annotation-only save creates no grade row (never flips the student to Graded)",
    async ({ db }) => {
      const { annotationService, gradeService } = buildCoreServices(db);

      // Given a grader who only draws annotations — never scores the question
      await annotationService.saveAnnotations({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        gradedBy: "teacher",
        annotations: SAMPLE_ENTRIES,
      });

      // Then no grade row exists for that question — so getStatus (which keys
      // "Graded" off grade-row existence) can never prematurely unlock release.
      const grade = await gradeService.getGrade("test-1", "q-1", "student-1");
      expect(grade).toBeNull();
      const grades = await gradeService.getGrades("test-1", "student-1");
      expect(grades).toHaveLength(0);
    },
  );
});
