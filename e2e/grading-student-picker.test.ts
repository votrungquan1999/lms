import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  insertAnswer,
  insertCourse,
  insertGrade,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

const routes = [
  {
    name: "the grading page",
    path: (ids: { courseId: string; testId: string }) =>
      `/admin/grading/${ids.testId}`,
  },
  {
    name: "the course Tests tab grading",
    path: (ids: { courseId: string; testId: string }) =>
      `/admin/courses/${ids.courseId}/tests/${ids.testId}/grading`,
  },
];

test.describe("Student picker search", () => {
  for (const route of routes) {
    test(`on ${route.name} finds a student by name without accents or by @username and opens her`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[search] One",
        });
        const students: Record<string, string> = {};
        const tag = crypto.randomUUID().slice(0, 6);
        for (const [name, username, hour] of [
          ["Tâm Search", `tam.${tag}`, 8],
          ["Bob Search", `bob.${tag}`, 9],
        ] as const) {
          const studentId = await insertStudent(db, { name, username });
          students[name] = studentId;
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "answer" },
          });
          await insertSubmission(db, {
            testId,
            studentId,
            submittedAt: new Date(`2026-11-01T0${hour}:00:00Z`),
          });
        }
        return { courseId, testId, tag, tam: students["Tâm Search"] };
      });

      await page.goto(route.path(ids));
      const picker = page.getByRole("button", { name: "Student picker" });
      await hydrated(picker);
      await picker.click();
      const search = page.getByRole("searchbox", { name: "Search students" });

      // "tam" finds Tâm only, whatever the case and accents
      await search.fill("TAM");
      await expect(page.getByRole("menuitem")).toHaveCount(1);
      await expect(page.getByRole("menuitem")).toContainText("Tâm Search");

      // The @username finds her too, and picking her opens her
      await search.fill(`@tam.${ids.tag}`);
      await page.getByRole("menuitem", { name: /Tâm Search/ }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.tam}`));
    });
  }
});

test.describe("Student picker next waiting student", () => {
  for (const route of routes) {
    test(`on ${route.name} opens the oldest other waiting student and skips a graded one`, async ({
      page,
    }) => {
      const ids = await withDb(async (db) => {
        const courseId = await insertCourse(db);
        const testId = await insertTest(db, courseId);
        const questionId = await insertQuestion(db, testId, {
          title: "[waiting] One",
        });
        const students: string[] = [];
        // Oldest hand-in first: Ann waits (shown), Bea is graded, Cy waits.
        for (const [name, hour, graded] of [
          ["Ann Waiting", 8, false],
          ["Bea Waiting", 9, true],
          ["Cy Waiting", 10, false],
        ] as const) {
          const studentId = await insertStudent(db, { name });
          students.push(studentId);
          await enroll(db, { courseId, studentId });
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "answer" },
          });
          await insertSubmission(db, {
            testId,
            studentId,
            submittedAt: new Date(
              `2026-11-01T${String(hour).padStart(2, "0")}:00:00Z`,
            ),
          });
          if (graded) await insertGrade(db, { testId, questionId, studentId });
        }
        return { courseId, testId, cy: students[2] };
      });

      await page.goto(route.path(ids));
      const picker = page.getByRole("button", { name: "Student picker" });
      await hydrated(picker);
      await picker.click();
      await page
        .getByRole("menuitem", { name: /Next waiting student/ })
        .click();

      await expect(page).toHaveURL(new RegExp(`studentId=${ids.cy}`));
    });
  }
});
