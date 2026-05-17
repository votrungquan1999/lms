import { TestStatus } from "src/lib/test-status-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("GradeVisibilityService.canRevealGrades", () => {
  dbIt(
    "returns false when testStatus is not Graded, regardless of tiers",
    async ({ db }) => {
      const {
        testService,
        testSubmissionService,
        gradeVisibilityService: visibility,
      } = buildCoreServices(db);
      void testSubmissionService;

      // Course + test with EVERY tier flipped to "visible" — the only thing
      // that should still gate is the testStatus.
      const courseId = "c1";
      const test = await testService.createTest(courseId, {
        title: "T",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: true,
      });
      await testService.releaseGrades(test.id, "admin");
      await testSubmissionService.submitTest(test.id, "student-1");
      await testSubmissionService.releaseGradeToStudent(
        test.id,
        "student-1",
        "admin",
      );

      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.NotStarted,
        ),
      ).toBe(false);
      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.Submitted,
        ),
      ).toBe(false);
    },
  );

  dbIt(
    "returns false when none of the three reveal tiers is satisfied",
    async ({ db }) => {
      const {
        testService,
        testSubmissionService,
        gradeVisibilityService: visibility,
      } = buildCoreServices(db);
      void testSubmissionService;

      const test = await testService.createTest("c1", {
        title: "T",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: false,
      });
      await testSubmissionService.submitTest(test.id, "student-1");
      // No releaseGrades, no releaseGradeToStudent.

      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.Graded,
        ),
      ).toBe(false);
    },
  );

  dbIt(
    "returns true when showGradeAfterSubmit is set (no submission lookup needed)",
    async ({ db }) => {
      const {
        testService,
        testSubmissionService,
        gradeVisibilityService: visibility,
      } = buildCoreServices(db);
      void testSubmissionService;

      const test = await testService.createTest("c1", {
        title: "T",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: true,
      });
      // No submission at all — flag-only path should still open the gate.

      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.Graded,
        ),
      ).toBe(true);
    },
  );

  dbIt(
    "returns true when gradesReleasedAt is set on the test",
    async ({ db }) => {
      const {
        testService,
        testSubmissionService,
        gradeVisibilityService: visibility,
      } = buildCoreServices(db);
      void testSubmissionService;

      const test = await testService.createTest("c1", {
        title: "T",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: false,
      });
      await testService.releaseGrades(test.id, "admin");

      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.Graded,
        ),
      ).toBe(true);
    },
  );

  dbIt(
    "returns true when the active submission has releasedAt set (per-student tier)",
    async ({ db }) => {
      const {
        testService,
        testSubmissionService,
        gradeVisibilityService: visibility,
      } = buildCoreServices(db);
      void testSubmissionService;

      const test = await testService.createTest("c1", {
        title: "T",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: false,
      });
      await testSubmissionService.submitTest(test.id, "student-1");
      await testSubmissionService.releaseGradeToStudent(
        test.id,
        "student-1",
        "admin",
      );

      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.Graded,
        ),
      ).toBe(true);
    },
  );

  dbIt(
    "returns false when only a soft-deleted submission carries a stale releasedAt",
    async ({ db }) => {
      const {
        testService,
        testSubmissionService,
        gradeVisibilityService: visibility,
      } = buildCoreServices(db);
      void testSubmissionService;

      const test = await testService.createTest("c1", {
        title: "T",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: false,
      });

      // Soft-deleted row with stale releasedAt — should NOT open the gate.
      await db.collection("test_submission").insertOne({
        id: "old",
        testId: test.id,
        studentId: "student-1",
        submittedAt: new Date("2020-01-01T00:00:00Z"),
        deletedAt: new Date("2020-02-01T00:00:00Z"),
        releasedAt: new Date("2020-01-15T00:00:00Z"),
        releasedBy: "admin-old",
      });

      expect(
        await visibility.canRevealGrades(
          test.id,
          "student-1",
          TestStatus.Graded,
        ),
      ).toBe(false);
    },
  );
});
