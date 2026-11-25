/**
 * Feature: a teacher's redo on a timed test the student already handed in
 * gives the student a fresh start, with the full time and a working submit;
 * a timed test whose time ran out without a hand-in is handed in with the
 * saved answers the next time a student or teacher page shows its status.
 */
import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
  insertTest,
  insertTestStart,
  withDb,
} from "./seed";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;

test.describe("Timed test redo", () => {
  test("a student asked to redo a timed test they handed in gets a Start gate, full time, and can submit again", async ({
    browser,
    page: adminPage,
  }) => {
    // Given a signed-in student enrolled in a course with a 30-minute test
    const username = `redo-timed-${Date.now()}`;
    const studentContext = await browser.newContext({
      storageState: undefined,
    });
    const signUp = await studentContext.request.post(
      `${BASE_URL}/api/auth/sign-up/email`,
      {
        data: {
          email: `${username}@lms.internal`,
          password: "e2e-redo-timed-password",
          name: "Redo Timed",
        },
      },
    );
    expect(signUp.ok()).toBeTruthy();
    const { user } = await signUp.json();
    const { courseId, testId, studentId } = await withDb(async (db) => {
      const studentId = await insertStudent(db, {
        authUserId: user.id,
        username,
        name: "Redo Timed",
      });
      const courseId = await insertCourse(db, { title: "[timed redo] Course" });
      await enroll(db, { courseId, studentId });
      const testId = await insertTest(db, courseId, {
        title: "[timed redo] Test",
        timeLimitMinutes: 30,
      });
      await insertQuestion(db, testId, { title: "[timed redo] Q1" });
      return { courseId, testId, studentId };
    });
    const testUrl = `/student/courses/${courseId}/tests/${testId}`;
    const student = await studentContext.newPage();

    // And they started, answered and handed in the test
    await student.goto(`${BASE_URL}${testUrl}`);
    const start = student.getByRole("button", { name: "Start Test" });
    await hydrated(start);
    await start.click();
    await student
      .getByPlaceholder("Type your answer here...")
      .fill("first attempt");
    await student.getByRole("button", { name: "Submit Answer" }).click();
    await expect(
      student.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible({ timeout: 10000 });
    await student
      .getByRole("button", { name: "Submit Test for Grading" })
      .click();
    await student.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(
      student.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10000 });

    // And their clock ran out long ago
    await withDb((db) =>
      insertTestStart(db, {
        testId,
        studentId,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      }),
    );

    // When the teacher requests a redo
    await adminPage.goto(
      `/admin/courses/${courseId}/tests/${testId}/grading?studentId=${studentId}`,
    );
    const requestRedo = adminPage.getByRole("button", {
      name: "Request Redo",
    });
    await hydrated(requestRedo);
    await requestRedo.click();
    await expect(adminPage.getByText("Redo requested")).toBeVisible({
      timeout: 10000,
    });

    // Then the student is gated again, with the full time once they start
    await student.goto(`${BASE_URL}${testUrl}`);
    const restart = student.getByRole("button", { name: "Start Test" });
    await expect(restart).toBeVisible();
    await hydrated(restart);
    await restart.click();
    await expect(student.getByText(/Time remaining/).first()).toContainText(
      /(30:00|29:\d\d)/,
      { timeout: 10000 },
    );

    // And they can save a new answer and hand in again
    await student.getByRole("button", { name: "Edit Answer" }).click();
    await student
      .getByPlaceholder("Type your answer here...")
      .fill("second attempt");
    await student.getByRole("button", { name: "Submit Answer" }).click();
    await expect(
      student.getByRole("button", { name: "Edit Answer" }),
    ).toBeVisible({ timeout: 10000 });
    await student
      .getByRole("button", { name: "Submit Test for Grading" })
      .click();
    await student.getByRole("button", { name: "Confirm Submission" }).click();
    await expect(
      student.getByText("submitted and is waiting to be graded"),
    ).toBeVisible({ timeout: 10000 });

    await studentContext.close();
  });

  test("a timed test whose time ran out without a hand-in is handed in with the saved answers when the student or teacher opens a page showing it", async ({
    browser,
    page: adminPage,
  }) => {
    // Given two enrolled students whose 30-minute clock ran out long ago with answers saved and no hand-in
    const username = `expired-${Date.now()}`;
    const studentContext = await browser.newContext({
      storageState: undefined,
    });
    const signUp = await studentContext.request.post(
      `${BASE_URL}/api/auth/sign-up/email`,
      {
        data: {
          email: `${username}@lms.internal`,
          password: "e2e-expired-password",
          name: "Expired Student",
        },
      },
    );
    expect(signUp.ok()).toBeTruthy();
    const { user } = await signUp.json();
    const expiredStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: "[expired] Course" });
      const testId = await insertTest(db, courseId, {
        title: "[expired] Test",
        timeLimitMinutes: 30,
      });
      const questionId = await insertQuestion(db, testId, {
        title: "[expired] Q1",
      });
      const firstId = await insertStudent(db, {
        authUserId: user.id,
        username,
        name: "Expired Student",
      });
      const secondId = await insertStudent(db, {
        username: `${username}-b`,
        name: "Expired Teacher View",
      });
      for (const studentId of [firstId, secondId]) {
        await enroll(db, { courseId, studentId });
        await insertAnswer(db, {
          testId,
          questionId,
          studentId,
          answer: { type: "free_text", text: `saved by ${studentId}` },
        });
        await insertTestStart(db, {
          testId,
          studentId,
          startedAt: expiredStart,
        });
      }
      return { courseId, testId };
    });

    // When the first student opens their course page
    const student = await studentContext.newPage();
    await student.goto(`${BASE_URL}/student/courses/${courseId}`);

    // Then the test shows Submitted
    await expect(student.getByText("[expired] Test")).toBeVisible();
    await expect(student.getByText("Submitted").first()).toBeVisible();

    // And the test page shows their saved answer with no Start gate or countdown
    await student.goto(
      `${BASE_URL}/student/courses/${courseId}/tests/${testId}`,
    );
    await expect(student.getByText(/saved by /)).toBeVisible();
    await expect(
      student.getByRole("button", { name: "Start Test" }),
    ).toHaveCount(0);
    await expect(student.getByText(/Time remaining/)).toHaveCount(0);

    // And when the teacher opens the grading page, the second student reads as handed in
    await adminPage.goto(`/admin/courses/${courseId}/tests/${testId}/grading`);
    await expect(
      adminPage
        .locator('[data-student-name="Expired Teacher View"] [data-status]')
        .first(),
    ).toHaveAttribute("data-status", "submitted", { timeout: 10000 });

    await studentContext.close();
  });
});
