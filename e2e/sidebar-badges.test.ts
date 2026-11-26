/**
 * Feature: sidebar badges
 *
 * The To grade and Join requests entries show how many items wait, hide at
 * zero, and stay current after the teacher's own actions and on every page
 * change.
 */
import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import { createOwnSchool, type OwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

test.describe("Sidebar badges", () => {
  test.describe.configure({ mode: "serial" });

  let own: OwnSchool;
  test.beforeAll(async ({ browser }) => {
    own = await createOwnSchool(browser, "sidebar-badges");
  });
  test.afterAll(async () => {
    await own?.remove();
  });

  test("the To grade badge counts waiting submissions and follows grading and page changes", async () => {
    test.setTimeout(120_000);

    // Given two students waiting on one test
    const schoolId = own.schoolId;
    const { courseId, testId, questionId, students } = await withDb(
      async (db) => {
        await clearSchoolData(db, schoolId);
        const courseId = await insertCourse(db, {
          title: "Badge Course",
          schoolId,
        });
        const testId = await insertTest(db, courseId, {
          title: "Badge Test",
          schoolId,
        });
        const questionId = await insertQuestion(db, testId, {
          type: "free_text",
        });
        const students: string[] = [];
        for (const name of ["Ann", "Ben"]) {
          students.push(await waitingStudent(db, name));
        }
        return { courseId, testId, questionId, students };

        async function waitingStudent(
          db: Parameters<Parameters<typeof withDb>[0]>[0],
          name: string,
        ) {
          const studentId = await insertStudent(db, {
            name,
            schoolIds: [schoolId],
          });
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "x" },
          });
          await insertSubmission(db, { testId, studentId });
          return studentId;
        }
      },
    );

    const page = await own.context.newPage();
    const toGradeLink = page.getByRole("link", { name: /^To grade/ });
    await page.goto("/admin/courses");

    // Then the To grade entry shows 2
    await expect(toGradeLink).toContainText("2");

    // When the teacher grades one student and saves
    await page.goto(
      `/admin/courses/${courseId}/tests/${testId}/grading?studentId=${students[0]}`,
    );
    const gradeCard = page.getByTestId("grade-card");
    await gradeCard.getByLabel("Score (0–100):").fill("80");
    const save = gradeCard.getByRole("button", { name: "Save Grade" });
    await hydrated(save);
    await save.click();
    await expect(gradeCard.getByText("Grade saved")).toBeVisible({
      timeout: 10_000,
    });

    // Then the badge drops to 1 without a reload
    await expect(toGradeLink).toContainText("1");

    // When a student hands in behind the page's back and the teacher clicks Courses
    await withDb(async (db) => {
      const studentId = await insertStudent(db, {
        name: "Cy",
        schoolIds: [schoolId],
      });
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "x" },
      });
      await insertSubmission(db, { testId, studentId });
      students.push(studentId);
    });
    const coursesLink = page
      .getByRole("link", { name: "Courses", exact: true })
      .first();
    await hydrated(coursesLink);
    await coursesLink.click();

    // Then the badge picks the new hand-in up
    await expect(toGradeLink).toContainText("2");

    // When the rest are graded
    for (const studentId of students.slice(1)) {
      await page.goto(
        `/admin/courses/${courseId}/tests/${testId}/grading?studentId=${studentId}`,
      );
      const card = page.getByTestId("grade-card");
      await card.getByLabel("Score (0–100):").fill("70");
      const saveButton = card.getByRole("button", { name: "Save Grade" });
      await hydrated(saveButton);
      await saveButton.click();
      await expect(card.getByText("Grade saved")).toBeVisible({
        timeout: 10_000,
      });
    }

    // Then nothing waits and the badge is gone
    await expect(toGradeLink).toHaveText("To grade");
    await page.close();
  });
});
