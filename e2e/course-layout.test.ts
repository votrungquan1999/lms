import { expect, test } from "@playwright/test";
import {
  enroll,
  expectNoPageOverflow,
  expectNotClipped,
  expectWrapped,
  insertCourse,
  insertPool,
  insertStudent,
  insertTest,
  withDb,
} from "./seed";

test.describe("Course layout", () => {
  test("an unbroken course title, description and enrolled student name never force the course page to scroll sideways, and Export Results stays reachable", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenTitle =
      "[layout] averylongunbrokencoursetitlethatshouldwrapinsteadofoverflowing1234567890";
    // Long enough to wrap even across the full-width (max-w-5xl) column.
    const unbrokenDescription = `averylongunbrokencoursedescription${"thatshouldwrapinsteadofoverflowing".repeat(5)}`;
    const unbrokenStudentName = `[layout] averylongunbrokenenrolledstudentname${"thatshouldwrapinsteadofoverflowing".repeat(5)}`;

    const courseId = await withDb(async (db) => {
      const courseId = await insertCourse(db, {
        title: unbrokenTitle,
        description: unbrokenDescription,
      });
      const studentId = await insertStudent(db, { name: unbrokenStudentName });
      await enroll(db, { courseId, studentId });
      return courseId;
    });

    await page.goto(`/admin/courses/${courseId}`);
    await expect(
      page.getByRole("heading", { name: unbrokenTitle }),
    ).toBeVisible();
    await expect(
      page.getByText(unbrokenStudentName, { exact: true }),
    ).toBeVisible();
    await expectWrapped(page.getByText(unbrokenDescription, { exact: true }));
    await expectWrapped(page.getByText(unbrokenStudentName, { exact: true }));
    await expect(
      page.getByRole("link", { name: "Export Results" }),
    ).toBeInViewport({ ratio: 1 });
    await expectNoPageOverflow(page);
  });

  test("a test's graded counter and a pool's question counter never wrap onto a second line next to a long title", async ({
    page,
  }) => {
    // Long enough to fill the full-width row, so the counter beside it is squeezed.
    const longTail =
      " And Keeps Going Well Past The Full Width Of The Page".repeat(2);
    const longTestTitle = `[layout] Very Long Test Title That Wraps Across Many Words${longTail}`;
    const shortTestTitle = "[layout] Short Test";
    // The pool list is global, so a random tag keeps a re-run's rows distinct.
    const tag = crypto.randomUUID().slice(0, 8);
    const longPoolName = `[layout] ${tag} Very Long Pool Name That Wraps Across Many Words${longTail}`;
    const shortPoolName = `[layout] ${tag} Short Pool`;

    const { courseId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const studentId = await insertStudent(db);
      await enroll(db, { courseId, studentId });
      await insertTest(db, courseId, { title: longTestTitle });
      await insertTest(db, courseId, { title: shortTestTitle });
      await insertPool(db, { name: longPoolName });
      await insertPool(db, { name: shortPoolName });
      return { courseId };
    });

    await page.goto(`/admin/courses/${courseId}`);
    const longCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: longTestTitle });
    const shortCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: shortTestTitle });

    const longTitleBox = await longCard
      .getByRole("link", { name: longTestTitle })
      .boundingBox();
    const longCounterBox = await longCard
      .getByRole("link", { name: /graded$/ })
      .boundingBox();
    const shortCounterBox = await shortCard
      .getByRole("link", { name: /graded$/ })
      .boundingBox();
    if (!longTitleBox || !longCounterBox || !shortCounterBox) {
      throw new Error("Test row title or counter not found");
    }
    await expectWrapped(longCard.getByText(longTestTitle, { exact: true }));
    // The counter never wraps to a second line, whatever the title's length.
    expect(longCounterBox.height).toBeCloseTo(shortCounterBox.height, 0);
    // Title and counter stay side by side, never overlapping.
    expect(longTitleBox.x + longTitleBox.width).toBeLessThanOrEqual(
      longCounterBox.x,
    );

    await page.goto("/admin/pools");
    const poolCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: longPoolName });
    const shortPoolCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: shortPoolName });
    const poolNameBox = await poolCard
      .getByText(longPoolName, { exact: true })
      .boundingBox();
    const poolCounterBox = await poolCard
      .getByText(/^\d+ questions?$/)
      .boundingBox();
    const shortPoolCounterBox = await shortPoolCard
      .getByText(/^\d+ questions?$/)
      .boundingBox();
    if (!poolNameBox || !poolCounterBox || !shortPoolCounterBox) {
      throw new Error("Pool row name or counter not found");
    }
    await expectWrapped(poolCard.getByText(longPoolName, { exact: true }));
    expect(poolCounterBox.height).toBeCloseTo(shortPoolCounterBox.height, 0);
    expect(poolNameBox.x + poolNameBox.width).toBeLessThanOrEqual(
      poolCounterBox.x,
    );
  });

  test("an unbroken student name or test title never spills past the Export Results column", async ({
    page,
  }) => {
    // Long enough to wrap even across the full-width (max-w-5xl) column.
    const unbrokenStudentName = `[layout] averylongunbrokenexportresultsstudentname${"thatshouldwrapinsteadofoverflowing".repeat(5)}`;
    const unbrokenTestTitle = `[layout] averylongunbrokenexportresultstesttitle${"thatshouldwrapinsteadofoverflowing".repeat(5)}`;

    const courseId = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const studentId = await insertStudent(db, { name: unbrokenStudentName });
      await enroll(db, { courseId, studentId });
      await insertTest(db, courseId, { title: unbrokenTestTitle });
      return courseId;
    });

    await page.goto(`/admin/courses/${courseId}/results-report`);
    // Checked against the column's own right edge — stricter than page-level
    // scroll, which misses a spill that stops inside the page padding.
    const sectionBox = await page.locator("section").first().boundingBox();
    if (!sectionBox) throw new Error("Export Results section not found");
    const columnRight = sectionBox.x + sectionBox.width;
    await expectWrapped(page.getByText(unbrokenStudentName, { exact: true }));
    await expectWrapped(page.getByText(unbrokenTestTitle, { exact: true }));

    const nameBox = await page
      .getByText(unbrokenStudentName, { exact: true })
      .boundingBox();
    if (!nameBox) throw new Error("Student name label not found");
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(columnRight + 1);

    const titleBox = await page
      .getByText(unbrokenTestTitle, { exact: true })
      .boundingBox();
    if (!titleBox) throw new Error("Test title label not found");
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(columnRight + 1);
  });

  test('an unbroken course title never makes the Export Results breadcrumb scroll the page sideways, and never shortens "Export Results"', async ({
    page,
  }) => {
    // No hyphens/spaces: browsers treat those as soft break points even
    // without a wrap utility, so a broken string would not reproduce this.
    const unbrokenCourseTitle = `[layout] averylongunbrokenbreadcrumbcoursetitle${"thatmustneveroverflowthepage".repeat(5)}`;

    const courseId = await withDb(async (db) =>
      insertCourse(db, { title: unbrokenCourseTitle }),
    );

    // The current segment ("Export Results") is short and static — the
    // overflow instead came from the course-title link ahead of it, which
    // wraps (the bar grows) while "Export Results" reads in full.
    await page.goto(`/admin/courses/${courseId}/results-report`);
    const nav = page.getByRole("navigation", { name: "breadcrumb" });
    await expectWrapped(nav.getByRole("link", { name: unbrokenCourseTitle }));
    await expectNotClipped(nav.locator('[aria-current="page"]'));
    await expectNoPageOverflow(page);
  });

  test("unbroken student names never overflow the Manage Enrollments dialog", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenName =
      "[layout] averylongunbrokenenrollmentnamethatshouldwrapinsteadofoverflowing1234567890@example.com";
    const unbrokenUsername =
      "layoutenrollaverylongunbrokenusernamethatshouldwrap1234567890";
    const courseId = await withDb(async (db) => {
      await insertStudent(db, {
        name: unbrokenName,
        username: unbrokenUsername,
      });
      return insertCourse(db, { title: "[layout] Enrollment Course" });
    });

    await page.goto(`/admin/courses/${courseId}`);
    await page.getByRole("button", { name: "Manage Enrollments" }).click();

    const dialog = page.getByRole("dialog", { name: "Manage Enrollments" });
    await expect(dialog.getByText(unbrokenName, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(`@${unbrokenUsername}`, { exact: true }),
    ).toBeVisible();
    await expectNotClipped(dialog);
  });
});
