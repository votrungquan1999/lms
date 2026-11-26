/**
 * Feature: Course page
 *
 * A course page has the tabs Tests | Students | Materials as separate URLs, a
 * header with Export results and New test, and every tab guards its own course.
 */
import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import { createOwnSchool, type OwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  expectNoPageOverflow,
  insertAnswer,
  insertCourse,
  insertGrade,
  insertJoinRequest,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Pushes a hand-in clear of the 24-hour boundary so "yesterday" is stable. */
const MARGIN_MS = 60 * 60 * 1000;

test.describe("Course page", () => {
  test.describe.configure({ mode: "serial" });

  let own: OwnSchool;
  test.beforeAll(async ({ browser }) => {
    own = await createOwnSchool(browser, "course-page");
  });
  test.afterAll(async () => {
    await own?.remove();
  });

  test("a course page has the tabs Tests, Students and Materials as their own pages, with Export results and New test in the header", async () => {
    test.setTimeout(180_000);

    // Given a course with 2 students and 3 tests
    const schoolId = own.schoolId;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const id = await insertCourse(db, { title: "Tabbed Course", schoolId });
      for (const name of ["Olive", "Pat"]) {
        const studentId = await insertStudent(db, {
          name,
          schoolIds: [schoolId],
        });
        await enroll(db, { courseId: id, studentId });
      }
      for (const title of ["Quiz 1", "Quiz 2", "Quiz 3"]) {
        await insertTest(db, id, { title, schoolId });
      }
      return id;
    });
    const base = `/admin/courses/${courseId}`;

    // When the teacher opens the course
    const page = await own.context.newPage();
    await page.goto(base);

    // Then the page names the course in the breadcrumb and the title, with its counts
    const crumb = page.getByRole("navigation", { name: "breadcrumb" });
    await expect(crumb).toContainText("Courses");
    await expect(crumb.locator('[aria-current="page"]')).toHaveText(
      "Tabbed Course",
    );
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Tabbed Course" }),
    ).toBeVisible();
    await expect(main.getByText("2 students · 3 tests")).toBeVisible();

    // And the header offers Export results and New test
    await expect(
      main.getByRole("link", { name: "Export results" }),
    ).toHaveAttribute("href", `${base}/results-report`);
    await main.getByRole("button", { name: "New test" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Create Test" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // And the tab strip marks Tests as the current tab
    const tabs = page.getByRole("navigation", { name: "Course sections" });
    await expect(tabs.getByRole("link", { name: "Tests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      tabs.getByRole("link", { name: "Students" }),
    ).not.toHaveAttribute("aria-current", "page");

    // When they open Students
    await tabs.getByRole("link", { name: "Students" }).click();

    // Then it is its own page with the enrolment section and the join link
    await expect(page).toHaveURL(`${base}/students`);
    await expect(
      main.getByRole("heading", { name: "Students (2)" }),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Get Join Link" }),
    ).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Students" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // When they open Materials
    await tabs.getByRole("link", { name: "Materials" }).click();

    // Then it is its own page with the materials section
    await expect(page).toHaveURL(`${base}/materials`);
    await expect(
      main.getByRole("heading", { name: "Materials (0)" }),
    ).toBeVisible();

    // When they go back
    await page.goBack();

    // Then they return to the Students tab
    await expect(page).toHaveURL(`${base}/students`);
    await expect(
      main.getByRole("heading", { name: "Students (2)" }),
    ).toBeVisible();

    // And each tab opened directly still shows the course crumb
    for (const path of ["", "/students", "/materials"]) {
      await page.goto(`${base}${path}`);
      await expect(crumb.locator('[aria-current="page"]')).toHaveText(
        "Tabbed Course",
      );
    }
    await page.close();
  });

  test("on a phone the course header puts Export results and New test below the title and counts; on a desktop they sit beside them", async () => {
    // Given a course
    const schoolId = own.schoolId;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      return insertCourse(db, { title: "Phone Course", schoolId });
    });
    const page = await own.context.newPage();
    const main = page.getByRole("main");
    const counts = main.getByText("0 students · 0 tests");
    const exportLink = main.getByRole("link", { name: "Export results" });
    const newTest = main.getByRole("button", { name: "New test" });

    // When the teacher opens it on a phone
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/admin/courses/${courseId}`);
    await expect(counts).toBeVisible();

    // Then both buttons start below the counts line, which reads on one line
    const countsBox = await counts.boundingBox();
    const countsLine = await counts.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).lineHeight),
    );
    expect(countsBox?.height).toBeLessThan(countsLine * 1.5);
    const countsBottom = (countsBox?.y ?? 0) + (countsBox?.height ?? 0);
    expect((await exportLink.boundingBox())?.y).toBeGreaterThanOrEqual(
      countsBottom,
    );
    expect((await newTest.boundingBox())?.y).toBeGreaterThanOrEqual(
      countsBottom,
    );
    await expect(exportLink).toBeInViewport({ ratio: 1 });
    await expect(newTest).toBeInViewport({ ratio: 1 });

    // When the window is a desktop
    await page.setViewportSize({ width: 1280, height: 800 });

    // Then the buttons sit beside the title, above the counts line
    await expect
      .poll(async () => (await exportLink.boundingBox())?.y ?? 0)
      .toBeLessThan((await counts.boundingBox())?.y ?? 0);
    await page.close();
  });

  test("a course of another school is not found on any tab", async () => {
    test.setTimeout(120_000);

    // Given a course that belongs to the shared e2e school, not this one
    const foreignId = await withDb((db) =>
      insertCourse(db, { title: "Foreign Course" }),
    );

    // When the teacher opens each tab of it
    const page = await own.context.newPage();
    for (const path of ["", "/students", "/materials"]) {
      await page.goto(`/admin/courses/${foreignId}${path}`);

      // Then the tab is not found, and no course page shows
      await expect(
        page.getByText("This page could not be found."),
      ).toBeVisible();
      await expect(page.getByText("Foreign Course")).toHaveCount(0);
      await expect(
        page.getByRole("navigation", { name: "Course sections" }),
      ).toHaveCount(0);
    }
    await page.close();
  });

  test("the Tests tab lists tests to grade and tests ready to release in Needs your action, and Release moves a test out of it", async () => {
    test.setTimeout(180_000);

    // Given a course with 5 students, a test W with 1 of 2 hand-ins waiting,
    // a test R fully graded but hidden, a practice test and an untouched test
    const schoolId = own.schoolId;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseId = await insertCourse(db, {
        title: "Action Course",
        schoolId,
      });
      const students: string[] = [];
      for (const name of ["Olive", "Pat", "Quinn", "Rae", "Sam"]) {
        const studentId = await insertStudent(db, {
          name,
          schoolIds: [schoolId],
        });
        await enroll(db, { courseId, studentId });
        students.push(studentId);
      }
      const [olive, pat, quinn] = students;

      /** A hand-in answering every question, graded on the given ones. */
      const handIn = async (
        testId: string,
        questionIds: string[],
        studentId: string,
        gradedIds: string[],
        at: Date,
      ) => {
        for (const questionId of questionIds) {
          await insertAnswer(db, {
            testId,
            questionId,
            studentId,
            answer: { type: "free_text", text: "x" },
          });
        }
        await insertSubmission(db, { testId, studentId, submittedAt: at });
        for (const questionId of gradedIds) {
          await insertGrade(db, { testId, questionId, studentId });
        }
      };

      const w = await insertTest(db, courseId, {
        title: "Waiting Quiz",
        schoolId,
        showGradeAfterSubmit: false,
      });
      const wq1 = await insertQuestion(db, w, { type: "free_text", order: 1 });
      const wq2 = await insertQuestion(db, w, { type: "free_text", order: 2 });
      const yesterday = new Date(Date.now() - DAY_MS - MARGIN_MS);
      await handIn(w, [wq1, wq2], olive, [wq1], yesterday);
      await handIn(w, [wq1, wq2], pat, [wq1, wq2], yesterday);

      const r = await insertTest(db, courseId, {
        title: "Release Quiz",
        schoolId,
        showGradeAfterSubmit: false,
      });
      const rq = await insertQuestion(db, r, { type: "free_text" });
      await handIn(r, [rq], quinn, [rq], yesterday);

      const practice = await insertTest(db, courseId, {
        title: "Practice Quiz",
        schoolId,
        isPractice: true,
      });
      const pq = await insertQuestion(db, practice, { type: "free_text" });
      await handIn(practice, [pq], olive, [], yesterday);

      await insertTest(db, courseId, { title: "Untouched Quiz", schoolId });
      return { courseId, w, r };
    });

    // When the teacher opens the course
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${ids.courseId}`);

    // Then Needs your action holds only W and R
    const card = page.getByRole("region", { name: "Needs your action" });
    await expect(
      card.getByRole("heading", { name: "Needs your action (2)" }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Waiting Quiz" }),
    ).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Release Quiz" }),
    ).toBeVisible();
    await expect(card.getByText("Practice Quiz")).toHaveCount(0);
    await expect(card.getByText("Untouched Quiz")).toHaveCount(0);

    // And W shows who waits, what is left, and Grade into the course grading page
    const rowW = card.getByTestId(`test-row-${ids.w}`);
    await expect(rowW).toContainText("2 of 5");
    await expect(rowW).toContainText("1 waiting");
    await expect(rowW).toContainText("Not released");
    await expect(rowW).toContainText(
      "Olive submitted yesterday · 1 answer left · 2 questions",
    );
    await expect(rowW.getByRole("link", { name: "Grade" })).toHaveAttribute(
      "href",
      `/admin/courses/${ids.courseId}/tests/${ids.w}/grading`,
    );

    // And R is all graded, not visible to students, with Release
    const rowR = card.getByTestId(`test-row-${ids.r}`);
    await expect(rowR).toContainText("1 of 5");
    await expect(rowR).toContainText("All graded");
    await expect(rowR).toContainText("Not released");
    await expect(rowR).toContainText(
      "All 1 submission graded · students can't see their grades yet",
    );

    // When they release R
    const release = rowR.getByRole("button", { name: "Release" });
    await hydrated(release);
    await release.click();

    // Then R leaves the card and W stays
    await expect(
      card.getByRole("heading", { name: "Needs your action (1)" }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: "Release Quiz" })).toHaveCount(
      0,
    );
    await expect(
      card.getByRole("link", { name: "Waiting Quiz" }),
    ).toBeVisible();

    // And in All tests, R now shows Released to students
    const allTests = page.getByRole("region", { name: "All tests" });
    await expect(allTests.getByTestId(`test-row-${ids.r}`)).toContainText(
      "Released",
    );
    await page.close();
  });

  test("a course with nothing to act on shows no Needs your action card", async () => {
    test.setTimeout(120_000);

    // Given a course whose only test has no hand-ins
    const schoolId = own.schoolId;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const id = await insertCourse(db, { title: "Quiet Course", schoolId });
      await insertTest(db, id, { title: "Quiet Quiz", schoolId });
      return id;
    });

    // When the teacher opens it
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${courseId}`);

    // Then the page shows the test but no action card
    await expect(page.getByText("Quiet Quiz")).toBeVisible();
    await expect(page.getByText("Needs your action")).toHaveCount(0);
    await page.close();
  });

  test("All tests lists every test newest first with its state, and search and filter chips narrow it together", async () => {
    test.setTimeout(180_000);

    // Given 5 tests created one after another: practice, timed, no questions,
    // one with a waiting hand-in, one released
    const schoolId = own.schoolId;
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseId = await insertCourse(db, {
        title: "List Course",
        schoolId,
      });
      const olive = await insertStudent(db, {
        name: "Olive",
        schoolIds: [schoolId],
      });
      await enroll(db, { courseId, studentId: olive });

      const practice = await insertTest(db, courseId, {
        title: "Practice Quiz",
        schoolId,
        isPractice: true,
        createdAt: ago(5),
      });
      await insertQuestion(db, practice, { type: "free_text" });

      const timed = await insertTest(db, courseId, {
        title: "Timed Exam",
        schoolId,
        timeLimitMinutes: 90,
        createdAt: ago(4),
      });
      await insertQuestion(db, timed, { type: "single_select", order: 1 });
      await insertQuestion(db, timed, { type: "free_text", order: 2 });

      const zero = await insertTest(db, courseId, {
        title: "Kiểm tra Đầu vào",
        schoolId,
        createdAt: ago(3),
      });

      const waiting = await insertTest(db, courseId, {
        title: "Waiting Quiz",
        schoolId,
        showGradeAfterSubmit: false,
        createdAt: ago(2),
      });
      const wq = await insertQuestion(db, waiting, { type: "free_text" });
      await insertAnswer(db, {
        testId: waiting,
        questionId: wq,
        studentId: olive,
        answer: { type: "free_text", text: "x" },
      });
      await insertSubmission(db, { testId: waiting, studentId: olive });

      const released = await insertTest(db, courseId, {
        title: "Released Quiz",
        schoolId,
        showGradeAfterSubmit: false,
        gradesReleasedAt: new Date(),
        createdAt: ago(1),
      });
      const rq = await insertQuestion(db, released, { type: "free_text" });
      await insertAnswer(db, {
        testId: released,
        questionId: rq,
        studentId: olive,
        answer: { type: "free_text", text: "x" },
      });
      await insertSubmission(db, { testId: released, studentId: olive });
      await insertGrade(db, {
        testId: released,
        questionId: rq,
        studentId: olive,
      });
      return { courseId, practice, timed, zero, waiting, released };
    });

    // When the teacher opens the course
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${ids.courseId}`);
    const all = page.getByRole("region", { name: "All tests" });
    const rows = all.getByTestId(/^test-row-/);

    // Then the tests run newest first
    await expect(rows).toHaveCount(5);
    await expect(
      all.getByRole("heading", { name: "All tests (5)" }),
    ).toBeVisible();
    const order = [
      ids.released,
      ids.waiting,
      ids.zero,
      ids.timed,
      ids.practice,
    ];
    for (const [index, testId] of order.entries()) {
      await expect(rows.nth(index)).toHaveAttribute(
        "data-testid",
        `test-row-${testId}`,
      );
    }

    // And each row shows its tags, question counts, grading and release state, and one action
    const row = (testId: string) => all.getByTestId(`test-row-${testId}`);
    await expect(row(ids.practice)).toContainText("Practice");
    await expect(row(ids.practice)).toContainText("1 question · 1 written");
    await expect(row(ids.practice)).toContainText("Practice, no grades");
    await expect(row(ids.practice)).toContainText("Answers as they go");
    await expect(
      row(ids.practice).getByRole("link", { name: "Open" }),
    ).toHaveAttribute(
      "href",
      `/admin/courses/${ids.courseId}/tests/${ids.practice}`,
    );
    await expect(row(ids.timed)).toContainText("Timed 90 min");
    await expect(row(ids.timed)).toContainText(
      "2 questions · 1 single choice · 1 written",
    );
    await expect(row(ids.timed)).toContainText("Nothing submitted");
    await expect(row(ids.timed)).toContainText("Nothing yet");
    await expect(row(ids.zero)).toContainText("No questions yet");
    await expect(row(ids.zero)).toContainText("0 questions");
    await expect(row(ids.waiting)).toContainText("1 of 1");
    await expect(row(ids.waiting)).toContainText("1 waiting");
    await expect(row(ids.waiting)).toContainText("Not released");
    await expect(
      row(ids.waiting).getByRole("link", { name: "Grade" }),
    ).toBeVisible();
    await expect(row(ids.released)).toContainText("All graded");
    await expect(row(ids.released)).toContainText("Released");
    await expect(
      row(ids.released).getByRole("link", { name: "Open" }),
    ).toBeVisible();

    // And a test is never deleted from the list
    await expect(all.getByRole("button", { name: /delete/i })).toHaveCount(0);

    // And the chips count the whole course
    const chip = (name: RegExp) => all.getByRole("button", { name });
    await expect(chip(/^All 5$/)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(/^Needs grading 1$/)).toBeVisible();
    await expect(chip(/^Not released 1$/)).toBeVisible();
    await expect(chip(/^Practice 1$/)).toBeVisible();

    // When they pick Needs grading
    await hydrated(chip(/^Needs grading/));
    await chip(/^Needs grading/).click();

    // Then only the waiting test stays
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Waiting Quiz");
    await expect(chip(/^Needs grading 1$/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // When they search "quiz" on the Practice chip
    await chip(/^Practice/).click();
    await all.getByRole("searchbox", { name: "Search tests" }).fill("quiz");

    // Then both narrow the list, and the chip counts stay whole-course
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Practice Quiz");
    await expect(chip(/^All 5$/)).toBeVisible();
    await expect(chip(/^Practice 1$/)).toBeVisible();

    // When the search and the chip leave nothing
    await chip(/^Needs grading/).click();
    await all.getByRole("searchbox", { name: "Search tests" }).fill("practice");

    // Then the list says so
    await expect(all.getByText("No tests match")).toBeVisible();
    await expect(rows).toHaveCount(0);

    // When they clear the chip and search an unaccented spelling of an accented title
    await chip(/^All/).click();
    await all
      .getByRole("searchbox", { name: "Search tests" })
      .fill("kiem tra dau vao");

    // Then the accented title is found
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Kiểm tra Đầu vào");
    await page.close();
  });

  test("the All tests heading, chips, search and column header stay in view while a long list scrolls, on desktop and phone", async () => {
    test.setTimeout(180_000);

    // Given a course with 30 tests, one of them with an unbroken long title
    const schoolId = own.schoolId;
    const unbroken = `averylongunbrokentesttitle${"thatshouldwrapinsidethefirstcolumn".repeat(4)}`;
    const courseId = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const id = await insertCourse(db, { title: "Long Course", schoolId });
      for (let i = 0; i < 30; i++) {
        await insertTest(db, id, {
          title: i === 0 ? unbroken : `Test number ${i}`,
          schoolId,
          createdAt: new Date(Date.now() - i * 60_000),
        });
      }
      return id;
    });

    const page = await own.context.newPage();
    const pinned = page.getByTestId("all-tests-pinned");

    // When a desktop window is short and the page scrolls down
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto(`/admin/courses/${courseId}`);
    await expect(page.getByRole("region", { name: "All tests" })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.mouse.move(640, 300);
    await page.mouse.wheel(0, 1500);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(500);

    // Then the heading, chips, search and column header are pinned to the top
    await expect(pinned).toBeInViewport({ ratio: 1 });
    expect((await pinned.boundingBox())?.y).toBeCloseTo(0, 0);
    await expect(
      pinned.getByRole("heading", { name: /All tests/ }),
    ).toBeVisible();
    await expect(
      pinned.getByRole("button", { name: /^All 30$/ }),
    ).toBeVisible();
    await expect(
      pinned.getByRole("searchbox", { name: "Search tests" }),
    ).toBeVisible();
    await expect(pinned.getByText("Submitted", { exact: true })).toBeVisible();

    // When the window is a phone
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(`/admin/courses/${courseId}`);
    await expect(page.getByRole("region", { name: "All tests" })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 3000);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(500);

    // Then the block sits right under the 56 px top bar, which stays in view
    await expect(
      page.getByRole("button", { name: "Open menu" }),
    ).toBeInViewport();
    await expect(pinned).toBeInViewport({ ratio: 1 });
    expect((await pinned.boundingBox())?.y).toBeCloseTo(56, 0);
    await page.close();
  });

  test("the Students tab lists enrolled students with their joined date in Vietnam time, searches by name or username, removes one after a confirm and adds students", async () => {
    test.setTimeout(240_000);

    // Given a course with 3 students; Olive was enrolled at 18:30 UTC, already the next day in Vietnam
    const schoolId = own.schoolId;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseId = await insertCourse(db, {
        title: "Roster Course",
        schoolId,
      });
      const people = [
        {
          name: "Olive Green",
          username: "olive.g",
          at: "2026-09-02T18:30:00Z",
        },
        { name: "Điệp Nguyễn", username: "diep.n", at: "2026-09-05T03:00:00Z" },
        { name: "Pat Quinn", username: "pat.q", at: "2026-09-12T10:00:00Z" },
      ];
      for (const person of people) {
        const studentId = await insertStudent(db, {
          name: person.name,
          username: person.username,
          schoolIds: [schoolId],
        });
        await enroll(db, {
          courseId,
          studentId,
          enrolledAt: new Date(person.at),
        });
      }
      await insertStudent(db, {
        name: "Newcomer Lee",
        username: "newcomer.l",
        schoolIds: [schoolId],
      });
      return { courseId };
    });

    // When the teacher opens the Students tab
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${ids.courseId}/students`);
    const main = page.getByRole("main");
    const roster = main.getByRole("region", { name: "Students" });
    const rowOf = (name: string) =>
      roster.getByRole("listitem").filter({ hasText: name });

    // Then each row shows the name, the @username and the joined date in Vietnam time
    await expect(
      roster.getByRole("heading", { name: "Students (3)" }),
    ).toBeVisible();
    await expect(rowOf("Olive Green")).toContainText("@olive.g");
    await expect(rowOf("Olive Green")).toContainText("3 Sep 2026");
    await expect(rowOf("Điệp Nguyễn")).toContainText("5 Sep 2026");
    await expect(rowOf("Pat Quinn")).toContainText("12 Sep 2026");

    // And a link says new students go on the Students page first
    await expect(
      roster.getByRole("link", { name: "Students page" }),
    ).toHaveAttribute("href", "/admin/students");

    // When they search by name, without accents, by username, and for nothing
    const search = roster.getByRole("searchbox", { name: "Search students" });
    await hydrated(search);
    await search.fill("OLIVE");
    await expect(rowOf("Olive Green")).toBeVisible();
    await expect(roster.getByRole("listitem")).toHaveCount(1);
    await search.fill("diep");
    await expect(rowOf("Điệp Nguyễn")).toBeVisible();
    await expect(roster.getByRole("listitem")).toHaveCount(1);
    await search.fill("pat.q");
    await expect(rowOf("Pat Quinn")).toBeVisible();
    await expect(roster.getByRole("listitem")).toHaveCount(1);
    await search.fill("zzz");
    await expect(roster.getByText("No students match")).toBeVisible();
    await search.fill("");
    await expect(roster.getByRole("listitem")).toHaveCount(3);

    // When they start to remove Pat and cancel
    await rowOf("Pat Quinn")
      .getByRole("button", { name: "Remove Pat Quinn from this course" })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(
      confirm.getByRole("heading", {
        name: "Remove Pat Quinn from this course?",
      }),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();

    // Then Pat is still enrolled
    await expect(rowOf("Pat Quinn")).toBeVisible();

    // When they remove Pat and confirm
    await rowOf("Pat Quinn")
      .getByRole("button", { name: "Remove Pat Quinn from this course" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove", exact: true })
      .click();

    // Then the row is gone and the count drops
    await expect(rowOf("Pat Quinn")).toHaveCount(0);
    await expect(
      roster.getByRole("heading", { name: "Students (2)" }),
    ).toBeVisible();
    await expect(main.getByText("2 students")).toBeVisible();

    // And the account is still on the Students page
    await page.goto("/admin/students");
    await expect(page.getByText("Pat Quinn")).toBeVisible();

    // When they add Newcomer through Add students
    await page.goto(`/admin/courses/${ids.courseId}/students`);
    const addButton = roster.getByRole("button", { name: "Add students" });
    await hydrated(addButton);
    await addButton.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Manage Enrollments" }),
    ).toBeVisible();
    await dialog.getByLabel(/Newcomer Lee/).check();
    await dialog.getByRole("button", { name: "Confirm Enrollments" }).click();

    // Then Newcomer shows as a row
    await expect(dialog.getByRole("status")).toContainText(
      "Enrollments updated",
    );
    await page.keyboard.press("Escape");
    await expect(rowOf("Newcomer Lee")).toBeVisible();
    await page.close();
  });

  test("the Students tab shows this course's pending join requests oldest first, and Approve enrols the student while Reject removes the request", async () => {
    test.setTimeout(180_000);

    // Given course X with 2 pending requests (5 and 2 hours old) and course Y with 1
    const schoolId = own.schoolId;
    const HOUR_MS = 60 * 60 * 1000;
    const ids = await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseX = await insertCourse(db, { title: "Course X", schoolId });
      const courseY = await insertCourse(db, { title: "Course Y", schoolId });
      /** A real student with no school yet, as a join request's author is. */
      const requester = (name: string, username: string) =>
        insertStudent(db, { name, username, schoolIds: [] });
      const older = await insertJoinRequest(db, {
        courseId: courseX,
        studentId: await requester("Older Asker", "older.asker"),
        schoolId,
        requestedAt: new Date(Date.now() - 5 * HOUR_MS - 5 * 60 * 1000),
      });
      const newer = await insertJoinRequest(db, {
        courseId: courseX,
        studentId: await requester("Newer Asker", "newer.asker"),
        schoolId,
        requestedAt: new Date(Date.now() - 2 * HOUR_MS - 5 * 60 * 1000),
      });
      await insertJoinRequest(db, {
        courseId: courseY,
        studentId: await requester("Other Course Asker", "y.asker"),
        schoolId,
        requestedAt: new Date(Date.now() - HOUR_MS),
      });
      return { courseX, older, newer };
    });

    // When the teacher opens course X's Students tab
    const page = await own.context.newPage();
    await page.goto(`/admin/courses/${ids.courseX}/students`);
    const requests = page.getByRole("region", { name: "Join requests" });
    const rows = requests.locator('[data-testid^="join-request-row-"]');
    const joinLink = page.getByRole("link", { name: /^Join requests/ });

    // Then only X's 2 requests show, oldest first, with who, how and how long ago
    await expect(
      requests.getByRole("heading", { name: "Join requests (2)" }),
    ).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Older Asker");
    await expect(rows.nth(0)).toContainText("@older.asker");
    await expect(rows.nth(0)).toContainText(
      "Asked to join through the join link · 5 hours ago",
    );
    await expect(rows.nth(1)).toContainText("Newer Asker");
    await expect(rows.nth(1)).toContainText("2 hours ago");
    await expect(page.getByText("Other Course Asker")).toHaveCount(0);
    await expect(joinLink).toContainText("3");

    // When the teacher approves the older request
    const approve = page
      .getByTestId(`join-request-row-${ids.older}`)
      .getByRole("button", { name: "Approve" });
    await hydrated(approve);
    await approve.click();

    // Then that student is in the Students list and the badge drops by one
    const roster = page.getByRole("region", { name: "Students" });
    await expect(
      roster.getByRole("listitem").filter({ hasText: "Older Asker" }),
    ).toBeVisible();
    await expect(
      requests.getByRole("heading", { name: "Join requests (1)" }),
    ).toBeVisible();
    await expect(joinLink).toContainText("2");

    // When the teacher rejects the other one
    const reject = page
      .getByTestId(`join-request-row-${ids.newer}`)
      .getByRole("button", { name: "Reject" });
    await hydrated(reject);
    await reject.click();

    // Then the Join requests section is gone and the rejected student is not enrolled
    await expect(requests).toHaveCount(0);
    await expect(page.getByText("Newer Asker")).toHaveCount(0);
    await page.close();
  });
});
