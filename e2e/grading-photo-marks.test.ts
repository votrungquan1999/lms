import zlib from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
  expectNoPageOverflow,
  insertAnnotation,
  insertAnswer,
  insertCourse,
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

const PHOTO_WIDTH = 1600;
const PHOTO_HEIGHT = 800;

/** A plain grey PNG, wide enough that its natural size exceeds the answer pane. */
function greyPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf)
      c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 200)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Natural width of the photo the current test serves, for waiting until it has loaded. */
let servedWidth = PHOTO_WIDTH;

/** The presigned photo URLs point at a bucket that does not exist; serve a real image instead. */
async function servePhotos(
  page: Page,
  width = PHOTO_WIDTH,
  height = PHOTO_HEIGHT,
) {
  servedWidth = width;
  const png = greyPng(width, height);
  await page.route(/e2e-mock-bucket/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
}

/** The photo's drawing surface box once the answer pane is scrolled to its top, so the whole photo sits inside the pane's clip. */
async function photoBox(page: Page) {
  const surface = page.getByLabel("Drawing surface");
  await expect(
    page.getByRole("img", { name: "Student submitted work" }),
  ).toHaveJSProperty("naturalWidth", servedWidth);
  // The pane scrolls on its own: wheel until the whole photo sits inside its clip
  await expect
    .poll(async () => {
      const photo = await surface.boundingBox();
      if (!photo) return false;
      const wheelBy =
        photo.y > PANE_TOP + 40
          ? photo.y - PANE_TOP - 10
          : photo.y < PANE_TOP
            ? photo.y - PANE_TOP
            : 0;
      if (wheelBy !== 0) {
        await page.mouse.move(photo.x + 10, PANE_TOP + 100);
        await page.mouse.wheel(0, wheelBy);
      }
      return wheelBy === 0;
    })
    .toBe(true);
  const box = await surface.boundingBox();
  if (!box) throw new Error("drawing surface has no bounding box");
  return box;
}

/** Draws a drag across the photo; the answer pane scrolls on its own, so a wheel brings the photo to the pane's top first. */
async function dragOnPhoto(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const box = await photoBox(page);
  await page.mouse.move(
    box.x + box.width * from[0],
    box.y + box.height * from[1],
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1]);
  await page.mouse.up();
}

/** Clicks one spot on the photo. */
async function clickOnPhoto(page: Page, at: [number, number]) {
  const box = await photoBox(page);
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
}

/** Grades the shown answer and presses Save & next, which saves the photo marks in the same call. */
async function gradeAndSaveNext(page: Page, score: string) {
  await page.getByLabel("Score (0–100):").fill(score);
  await page.getByRole("button", { name: /^Save & next/ }).click();
}

/** Opens another student from the picker, confirming the leave prompt that unsaved marks raise. */
async function pickStudentDiscardingMarks(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Student picker" }).click();
  await page.getByRole("menuitem", { name }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Discard your unsaved grade?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Leave" }).click();
}

/** Where the answer pane starts on screen in a 1280 x 720 window. */
const PANE_TOP = 244;

const stroke = (color: string) => ({
  color,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.4, y: 0.4 },
  ],
});

/** Ann and Ben each handed in two photos; Ann's first photo already carries two marks. */
async function seedPhotoTest() {
  return withDb(async (db) => {
    const courseId = await insertCourse(db);
    const testId = await insertTest(db, courseId, { title: "[photos] Test" });
    const questionId = await insertQuestion(db, testId, {
      title: "[photos] Draw the flowchart",
      type: "image_answer",
    });
    const ids: Record<string, string> = {};
    for (const name of ["Ann Photos", "Ben Photos"]) {
      const studentId = await insertStudent(db, { name });
      ids[name] = studentId;
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: {
          type: "image",
          mediaKeys: [
            `answers/${studentId}/p1.png`,
            `answers/${studentId}/p2.png`,
          ],
        },
      });
      await insertSubmission(db, { testId, studentId });
    }
    await insertAnnotation(db, {
      testId,
      questionId,
      studentId: ids["Ann Photos"] as string,
      entries: [
        {
          mediaKey: `answers/${ids["Ann Photos"]}/p1.png`,
          strokes: [stroke("#ef4444"), stroke("#2563eb")],
        },
      ],
    });
    return {
      courseId,
      testId,
      questionId,
      ann: ids["Ann Photos"] as string,
      ben: ids["Ben Photos"] as string,
    };
  });
}

test.describe("Photo answers show one photo at a time", () => {
  for (const route of routes) {
    test(`on ${route.name} the grader moves between photos on a thumbnail strip with mark counts and zooms`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ann}`);

      // One photo shows at a time, the strip counts each photo's marks
      await expect(page.getByText("2 photos · showing photo 1")).toBeVisible();
      await expect(page.getByLabel("Drawing surface")).toHaveCount(1);
      const strip = page.getByRole("group", { name: "Photos" });
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();
      await expect(
        strip.getByRole("button", { name: "Photo 2 · 0 marks" }),
      ).toBeVisible();

      // Picking photo 2 shows it, and a mark drawn there counts for photo 2 only
      const photo2 = strip.getByRole("button", { name: "Photo 2 · 0 marks" });
      await hydrated(photo2);
      await photo2.click();
      await expect(page.getByText("2 photos · showing photo 2")).toBeVisible();
      await expect(page.locator("svg polyline")).toHaveCount(0);
      // The drawing surface covers exactly the photo, so marks land where they are drawn
      await expect
        .poll(async () => {
          const photoBox = await page
            .getByRole("img", { name: "Student submitted work" })
            .boundingBox();
          const surfaceBox = await page
            .getByLabel("Drawing surface")
            .boundingBox();
          return (
            `${Math.round(surfaceBox?.width ?? 0)}x${Math.round(surfaceBox?.height ?? 0)}` ===
            `${Math.round(photoBox?.width ?? -1)}x${Math.round(photoBox?.height ?? -1)}`
          );
        })
        .toBe(true);
      await dragOnPhoto(page, [0.2, 0.2], [0.6, 0.6]);
      await expect(
        strip.getByRole("button", { name: "Photo 2 · 1 mark" }),
      ).toBeVisible();
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();

      // Fit keeps the photo inside the pane; 100% shows its real size in a scroll area
      const image = page.getByRole("img", { name: "Student submitted work" });
      const fitWidth = (await image.boundingBox())?.width ?? 0;
      expect(fitWidth).toBeLessThan(PHOTO_WIDTH);
      await page.getByRole("button", { name: "100%" }).click();
      await expect
        .poll(async () => (await image.boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(PHOTO_WIDTH);
      await expect(page.getByLabel("Drawing surface")).toHaveCount(1);
      await page.getByRole("button", { name: "Fit" }).click();
      await expect
        .poll(async () => (await image.boundingBox())?.width ?? 0)
        .toBe(fitWidth);

      // Another student opens on his first photo with no marks, never Ann's
      await pickStudentDiscardingMarks(page, /Ben Photos/);
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.ben}`));
      await expect(page.getByText("2 photos · showing photo 1")).toBeVisible();
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 0 marks" }),
      ).toBeVisible();
      await expect(
        strip.getByRole("button", { name: "Photo 2 · 0 marks" }),
      ).toBeVisible();
      await expect(page.locator("svg polyline")).toHaveCount(0);
    });

    test(`on ${route.name} the drawing surface covers exactly a photo far wider than it is tall`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      // At the pane width this photo is shorter than an SVG's default 150 px height
      await servePhotos(page, 2400, 200);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const image = page.getByRole("img", { name: "Student submitted work" });
      await expect(image).toHaveJSProperty("naturalWidth", 2400);

      await expect
        .poll(async () => {
          const photo = await image.boundingBox();
          const surface = await page
            .getByLabel("Drawing surface")
            .boundingBox();
          return `${Math.round(surface?.width ?? 0)}x${Math.round(surface?.height ?? 0)} over ${Math.round(photo?.width ?? -1)}x${Math.round(photo?.height ?? -1)}`;
        })
        .toMatch(/^(\d+x\d+) over \1$/);
    });
  }
});

test.describe("The teacher marks a photo with a circle or an arrow", () => {
  for (const route of routes) {
    test(`on ${route.name} a circle and an arrow count as marks, undo removes the last, and the saved marks are plain strokes`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const strip = page.getByRole("group", { name: "Photos" });
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 0 marks" }),
      ).toBeVisible();

      // The tool row offers Pen (the default), Circle and Arrow
      const pen = page.getByRole("button", { name: "Pen", exact: true });
      await hydrated(pen);
      await expect(pen).toHaveAttribute("aria-pressed", "true");

      // A circle drawn by dragging a box
      await page.getByRole("button", { name: "Circle", exact: true }).click();
      await dragOnPhoto(page, [0.2, 0.2], [0.5, 0.6]);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();

      // An arrow drawn by dragging from tail to tip
      await page.getByRole("button", { name: "Arrow", exact: true }).click();
      await dragOnPhoto(page, [0.6, 0.3], [0.9, 0.7]);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();

      // Undo takes back the arrow only
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();
      await expect(page.locator("svg polyline")).toHaveCount(1);

      // Save & next stores the circle as an ordinary stroke with many points
      await gradeAndSaveNext(page, "70");
      await expect
        .poll(() =>
          withDb(async (db) => {
            const doc = await db
              .collection("annotation")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            const strokes = doc?.entries?.[0]?.strokes ?? [];
            return [strokes.length, strokes[0]?.points?.length > 20];
          }),
        )
        .toEqual([1, true]);
    });
  }
});

test.describe("The teacher types text marks onto a photo", () => {
  for (const route of routes) {
    test(`on ${route.name} Enter keeps a text mark, Escape and empty text drop it, undo and clear take marks back in order, and a half-typed mark never reaches another student`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const strip = page.getByRole("group", { name: "Photos" });
      const text = page.getByRole("button", { name: "Text", exact: true });
      await hydrated(text);
      await text.click();
      const box = page.getByRole("textbox", { name: "Text mark" });

      // Click to place, type, Enter keeps it on the photo
      await clickOnPhoto(page, [0.3, 0.4]);
      await box.fill("i never changes");
      await box.press("Enter");
      await expect(page.getByText("i never changes")).toBeVisible();
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();

      // Escape cancels and an empty text is dropped
      await clickOnPhoto(page, [0.5, 0.7]);
      await box.fill("dropped");
      await box.press("Escape");
      await expect(box).toHaveCount(0);
      await expect(page.getByText("dropped")).toHaveCount(0);
      await clickOnPhoto(page, [0.6, 0.8]);
      await box.press("Enter");
      await expect(box).toHaveCount(0);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();

      // One undo history: the pen stroke goes first, then the text
      await page.getByRole("button", { name: "Pen", exact: true }).click();
      await dragOnPhoto(page, [0.1, 0.1], [0.3, 0.2]);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText("i never changes")).toBeVisible();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText("i never changes")).toHaveCount(0);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 0 marks" }),
      ).toBeVisible();

      // Clear photo removes strokes and texts together
      await text.click();
      await clickOnPhoto(page, [0.3, 0.4]);
      await box.fill("gone soon");
      await box.press("Enter");
      await page.getByRole("button", { name: "Clear photo" }).click();
      await expect(page.getByText("gone soon")).toHaveCount(0);

      // A kept text is saved with the photo and shown again after a reload
      await clickOnPhoto(page, [0.3, 0.4]);
      await box.fill("i never changes");
      await box.press("Enter");
      await gradeAndSaveNext(page, "70");
      await expect
        .poll(() =>
          withDb(async (db) => {
            const doc = await db
              .collection("annotation")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            const mark = doc?.entries?.[0]?.texts?.[0];
            return [
              doc?.entries?.[0]?.mediaKey,
              mark?.text,
              mark?.color,
              Math.round((mark?.x ?? 0) * 10),
              Math.round((mark?.y ?? 0) * 10),
            ];
          }),
        )
        .toEqual([
          `answers/${ids.ben}/p1.png`,
          "i never changes",
          "#ef4444",
          3,
          4,
        ]);
      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      await expect(page.getByText("i never changes")).toBeVisible();

      // A half-typed text never follows the grader to the next student
      await text.click();
      await clickOnPhoto(page, [0.5, 0.5]);
      await box.fill("half typed");
      await pickStudentDiscardingMarks(page, /Ann Photos/);
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.ann}`));
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();
      await expect(box).toHaveCount(0);
      await expect(page.getByText("half typed")).toHaveCount(0);
      await expect(page.getByText("i never changes")).toHaveCount(0);
    });
  }
});

test.describe("A text mark near the photo's edge stays readable", () => {
  for (const route of routes) {
    test(`on ${route.name} a text typed near the bottom-right corner shows whole inside the photo, and the typing box is at least 16px so a phone does not zoom`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);
      await page.setViewportSize({ width: 500, height: 1100 });

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const text = page.getByRole("button", { name: "Text", exact: true });
      await hydrated(text);
      await text.click();
      const surface = page.getByLabel("Drawing surface");
      await expect(
        page.getByRole("img", { name: "Student submitted work" }),
      ).toHaveJSProperty("naturalWidth", PHOTO_WIDTH);
      const photo = await surface.boundingBox();
      if (!photo) throw new Error("drawing surface has no bounding box");
      await page.mouse.click(
        photo.x + photo.width * 0.95,
        photo.y + photo.height * 0.9,
      );

      // The typing box is big enough that iOS does not zoom the page when it takes focus
      const box = page.getByRole("textbox", { name: "Text mark" });
      await expect(box).toBeFocused();
      const typingFont = await box.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      );
      expect(typingFont).toBeGreaterThanOrEqual(16);
      await box.fill("Near the corner");
      await box.press("Enter");

      // The kept mark is on one line and sits wholly inside the photo
      const mark = page.getByText("Near the corner");
      await expect(mark).toBeVisible();
      const markBox = await mark.boundingBox();
      if (!markBox) throw new Error("text mark has no bounding box");
      expect(markBox.x).toBeGreaterThanOrEqual(photo.x - 1);
      expect(markBox.y).toBeGreaterThanOrEqual(photo.y - 1);
      expect(markBox.x + markBox.width).toBeLessThanOrEqual(
        photo.x + photo.width + 1,
      );
      expect(markBox.y + markBox.height).toBeLessThanOrEqual(
        photo.y + photo.height + 1,
      );
      const keptFont = await mark.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      );
      expect(markBox.height).toBeLessThan(keptFont * 2);
      // It keeps the photo-relative size, not the typing box's
      expect(keptFont).toBeCloseTo(photo.width * 0.03, 0);
    });
  }
});

test.describe("Undo follows the order marks were made, also after a save and reopen", () => {
  for (const route of routes) {
    test(`on ${route.name} a stroke drawn after a text is the first thing Undo takes back once saved and reopened`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const text = page.getByRole("button", { name: "Text", exact: true });
      await hydrated(text);
      await text.click();
      await clickOnPhoto(page, [0.3, 0.4]);
      const box = page.getByRole("textbox", { name: "Text mark" });
      await box.fill("first the text");
      await box.press("Enter");
      await page.getByRole("button", { name: "Pen", exact: true }).click();
      await dragOnPhoto(page, [0.1, 0.1], [0.3, 0.2]);
      await gradeAndSaveNext(page, "70");
      await expect
        .poll(() =>
          withDb(async (db) => {
            const doc = await db
              .collection("annotation")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            return doc?.entries?.[0]?.texts?.length;
          }),
        )
        .toBe(1);

      // After reopening, one Undo takes the stroke and the text stays
      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const strip = page.getByRole("group", { name: "Photos" });
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();
      const undo = page.getByRole("button", { name: "Undo", exact: true });
      await hydrated(undo);
      await undo.click();
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();
      await expect(page.getByText("first the text")).toBeVisible();
      await expect(page.locator("svg polyline")).toHaveCount(0);
    });
  }
});

test.describe("A finger can move the photo instead of drawing on it", () => {
  test.use({ hasTouch: true });

  for (const route of routes) {
    test(`on ${route.name} with Move chosen a touch drag pans the photo at 100% and makes no mark, while with Pen the same drag draws`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);
      // The narrow layout: the grade panel is a bottom bar under the answer
      await page.setViewportSize({ width: 834, height: 1194 });

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const move = page.getByRole("button", { name: "Move", exact: true });
      await hydrated(move);
      await page.getByRole("button", { name: "100%" }).click();
      const image = page.getByRole("img", { name: "Student submitted work" });
      await expect(image).toHaveJSProperty("naturalWidth", PHOTO_WIDTH);
      const strip = page.getByRole("group", { name: "Photos" });
      const surface = page.getByLabel("Drawing surface");
      // The 100% box around the photo is the one that scrolls sideways
      const scroller = surface.locator(
        "xpath=ancestor::div[contains(@class,'overflow-auto')][1]",
      );
      const scrolledLeft = () => scroller.evaluate((el) => el.scrollLeft);
      await expect(scroller).toBeVisible();
      expect(await scrolledLeft()).toBe(0);

      /** One finger dragged to the left across the photo, as a touch screen sends it. */
      async function swipeLeft() {
        const client = await page.context().newCDPSession(page);
        const at = await scroller.boundingBox();
        if (!at) throw new Error("photo box has no bounding box");
        await client.send("Input.synthesizeScrollGesture", {
          x: Math.round(at.x + at.width / 2),
          y: Math.round(at.y + Math.min(at.height, 400) / 2),
          xDistance: -300,
          yDistance: 0,
          gestureSourceType: "touch",
          speed: 800,
        });
      }

      // With Pen the finger draws and the photo stays put
      await swipeLeft();
      await expect(
        strip.getByRole("button", { name: /^Photo 1 · [1-9]\d* marks?$/ }),
      ).toBeVisible();
      expect(await scrolledLeft()).toBe(0);
      await page.getByRole("button", { name: "Clear photo" }).click();

      // With Move the same drag pans and leaves no mark
      await move.click();
      await expect(move).toHaveAttribute("aria-pressed", "true");
      await swipeLeft();
      await expect.poll(scrolledLeft).toBeGreaterThan(100);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 0 marks" }),
      ).toBeVisible();
    });
  }
});

test.describe("Photo marks save with Save & next", () => {
  for (const route of routes) {
    test(`on ${route.name} drawn marks are unsaved work until Save & next stores them with the grade, and they never follow the teacher to another student`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const strip = page.getByRole("group", { name: "Photos" });
      const pen = page.getByRole("button", { name: "Pen", exact: true });
      await hydrated(pen);

      // There is no separate save button for marks
      await expect(
        page.getByRole("button", { name: "Save annotations" }),
      ).toHaveCount(0);

      // A drawn mark is not stored yet, and leaving asks first
      await dragOnPhoto(page, [0.2, 0.2], [0.6, 0.6]);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();
      expect(
        await withDb((db) =>
          db
            .collection("annotation")
            .findOne({ studentId: ids.ben, questionId: ids.questionId }),
        ),
      ).toBeNull();
      await page.getByRole("link", { name: "[photos] Test" }).click();
      const dialog = page.getByRole("alertdialog", {
        name: "Discard your unsaved grade?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Stay" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();

      // Leaving to another student drops the marks; they are not on Ben when she returns
      await pickStudentDiscardingMarks(page, /Ann Photos/);
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.ann}`));
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 2 marks" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Student picker" }).click();
      await page.getByRole("menuitem", { name: /Ben Photos/ }).click();
      await expect(page).toHaveURL(new RegExp(`studentId=${ids.ben}`));
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 0 marks" }),
      ).toBeVisible();

      // Save & next stores the grade and the marks in the same call
      await hydrated(pen);
      await dragOnPhoto(page, [0.2, 0.2], [0.6, 0.6]);
      await gradeAndSaveNext(page, "70");
      await expect
        .poll(() =>
          withDb(async (db) => {
            const doc = await db
              .collection("annotation")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            const grade = await db
              .collection("grade")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            return [doc?.entries?.[0]?.strokes?.length, grade?.score];
          }),
        )
        .toEqual([1, 70]);
    });

    test(`on ${route.name} By question counts drawn marks as unsaved work and Save & next stores them with the grade`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(
        `${route.path(ids)}?mode=question&studentId=${ids.ben}&questionId=${ids.questionId}`,
      );
      const strip = page.getByRole("group", { name: "Photos" });
      await hydrated(page.getByRole("button", { name: "Pen", exact: true }));

      // A drawn mark makes leaving ask first
      await dragOnPhoto(page, [0.2, 0.2], [0.6, 0.6]);
      await expect(
        strip.getByRole("button", { name: "Photo 1 · 1 mark" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "[photos] Test" }).click();
      const dialog = page.getByRole("alertdialog", {
        name: "Discard your unsaved grade?",
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Stay" }).click();
      await expect(dialog).toBeHidden();

      // Save & next stores the grade and the marks in the same call
      await gradeAndSaveNext(page, "70");
      await expect
        .poll(() =>
          withDb(async (db) => {
            const doc = await db
              .collection("annotation")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            const grade = await db
              .collection("grade")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            return [doc?.entries?.[0]?.strokes?.length, grade?.score];
          }),
        )
        .toEqual([1, 70]);
    });
  }
});

interface MarkMeasure {
  /** The pen stroke's box as fractions of the photo's box: x, y, width, height. */
  pen: number[];
  /** The circle's box as fractions of the photo's box: x, y, width, height. */
  circle: number[];
  /** The pen's line width as a fraction of the photo's width. */
  lineWidth: number;
  /** The text mark's left, top and font size as fractions of the photo's box. */
  text: number[];
  /** The photo's shown width in pixels. */
  photoWidth: number;
}

/** Measures the pen stroke, the circle and the "scale" text mark against the shown photo's box. */
async function measureMarks(page: Page): Promise<MarkMeasure> {
  return page.evaluate(() => {
    const img = document.querySelector('img[alt="Student submitted work"]');
    const [pen, circle] =
      img?.parentElement?.querySelectorAll("polyline") ?? [];
    const text = [...document.querySelectorAll("span")].find(
      (el) => el.textContent === "scale",
    );
    if (!img || !pen || !circle || !text)
      throw new Error("marks or photo not on screen");
    const photo = img.getBoundingClientRect();
    const asFractions = (mark: Element) => {
      const box = mark.getBoundingClientRect();
      return [
        (box.left - photo.left) / photo.width,
        (box.top - photo.top) / photo.height,
        box.width / photo.width,
        box.height / photo.height,
      ];
    };
    const textBox = text.getBoundingClientRect();
    return {
      pen: asFractions(pen),
      circle: asFractions(circle),
      lineWidth:
        Number.parseFloat(getComputedStyle(pen).strokeWidth) / photo.width,
      text: [
        (textBox.left - photo.left) / photo.width,
        (textBox.top - photo.top) / photo.height,
        Number.parseFloat(getComputedStyle(text).fontSize) / photo.width,
      ],
      photoWidth: photo.width,
    };
  });
}

/** Both measures describe the same marks at the same fractions of the photo. */
function expectSameFractions(actual: MarkMeasure, expected: MarkMeasure) {
  for (const key of ["pen", "circle", "text"] as const) {
    expect(actual[key]).toHaveLength(expected[key].length);
    actual[key].forEach((value, index) => {
      expect(Math.abs(value - (expected[key][index] as number))).toBeLessThan(
        0.01,
      );
    });
  }
  expect(actual.lineWidth / expected.lineWidth).toBeGreaterThan(0.9);
  expect(actual.lineWidth / expected.lineWidth).toBeLessThan(1.1);
}

/** The marks sit where drawReferenceMarks put them, with a line 0.3% and text 3% of the photo width. */
function expectReferenceSpots(measured: MarkMeasure) {
  expect(measured.pen[0]).toBeCloseTo(0.2, 1);
  expect(measured.pen[2]).toBeCloseTo(0.4, 1);
  expect(measured.circle[0]).toBeCloseTo(0.65, 1);
  expect(measured.circle[1]).toBeCloseTo(0.1, 1);
  expect(measured.circle[2]).toBeCloseTo(0.25, 1);
  expect(measured.circle[3]).toBeCloseTo(0.3, 1);
  expect(measured.text[0]).toBeCloseTo(0.3, 1);
  expect(measured.text[1]).toBeCloseTo(0.8, 1);
  expect(measured.text[2]).toBeCloseTo(0.03, 2);
  expect(measured.lineWidth).toBeCloseTo(0.003, 3);
}

/** Draws a pen stroke, a circle and a text mark on the photo, at known fractions of it. */
async function drawReferenceMarks(page: Page) {
  const pen = page.getByRole("button", { name: "Pen", exact: true });
  await hydrated(pen);
  await dragOnPhoto(page, [0.2, 0.2], [0.6, 0.6]);
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await dragOnPhoto(page, [0.65, 0.1], [0.9, 0.4]);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await clickOnPhoto(page, [0.3, 0.8]);
  const box = page.getByRole("textbox", { name: "Text mark" });
  await box.fill("scale");
  await box.press("Enter");
  await expect(page.getByText("scale")).toBeVisible();
}

/** Switches to 100% and waits until the photo is shown at its natural width (its 1px frame adds 2px). */
async function showAtFullSize(page: Page, naturalWidth: number) {
  await page.getByRole("button", { name: "100%" }).click();
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole("img", { name: "Student submitted work" })
            .boundingBox()
        )?.width ?? 0,
    )
    .toBe(naturalWidth + 2);
}

test.describe("Photo marks keep their spot and size on the photo at every display size", () => {
  for (const route of routes) {
    test(`on ${route.name} a stroke, a circle and a text mark sit at the same fractions of the photo, with the same line width and text size, at Fit, 100% and the tablet layout`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      await drawReferenceMarks(page);

      // Where she drew them, at Fit
      const atFit = await measureMarks(page);
      expectReferenceSpots(atFit);

      // 100% shows the 1600 px photo far larger; the marks keep their fractions, line width and text size
      await showAtFullSize(page, PHOTO_WIDTH);
      expectSameFractions(await measureMarks(page), atFit);
      await page.getByRole("button", { name: "Fit" }).click();

      // The tablet layout shows the photo at another width; the marks still follow it
      await page.setViewportSize({ width: 834, height: 1194 });
      expectSameFractions(await measureMarks(page), atFit);
      await expectNoPageOverflow(page);
    });

    test(`on ${route.name} a smaller photo of another shape gets the marks at the same fractions, line width and text size at Fit and at its own 100% size`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page, 400, 300);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      await drawReferenceMarks(page);

      const atFit = await measureMarks(page);
      expectReferenceSpots(atFit);
      // Fit stretches the 400 px photo to the pane, so 100% shows it clearly smaller
      expect(atFit.photoWidth).toBeGreaterThan(500);

      await showAtFullSize(page, 400);
      const atFullSize = await measureMarks(page);
      expectSameFractions(atFullSize, atFit);
      expectReferenceSpots(atFullSize);
    });

    test(`on ${route.name} an arrow drawn with the photo shown smaller has the same head, as a fraction of the photo, as one drawn at full width`, async ({
      page,
    }) => {
      const ids = await seedPhotoTest();
      await servePhotos(page);

      await page.goto(`${route.path(ids)}?studentId=${ids.ben}`);
      const arrow = page.getByRole("button", { name: "Arrow", exact: true });
      await hydrated(arrow);
      await arrow.click();
      await dragOnPhoto(page, [0.6, 0.3], [0.9, 0.7]);

      // A narrow window shows the same photo about 40% smaller; the arrow is drawn between the same fractions
      await page.setViewportSize({ width: 500, height: 1100 });
      const surface = page.getByLabel("Drawing surface");
      await expect
        .poll(async () => (await surface.boundingBox())?.width ?? 0)
        .toBeLessThan(480);
      const box = await surface.boundingBox();
      if (!box) throw new Error("drawing surface has no bounding box");
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.7);
      await page.mouse.up();
      await gradeAndSaveNext(page, "70");

      await expect
        .poll(() =>
          withDb(async (db) => {
            const doc = await db
              .collection("annotation")
              .findOne({ studentId: ids.ben, questionId: ids.questionId });
            const [wide, narrow] = (doc?.entries?.[0]?.strokes ?? []) as {
              points: { x: number; y: number }[];
            }[];
            const wing = (stroke?: { points: { x: number; y: number }[] }) => {
              const [, tip, end] = stroke?.points ?? [];
              return tip && end ? Math.hypot(end.x - tip.x, end.y - tip.y) : 0;
            };
            // Two head sizes within 5% of each other, as fractions of the photo
            return (
              wing(wide) > 0 &&
              Math.abs(wing(wide) - wing(narrow)) / wing(wide) < 0.05
            );
          }),
        )
        .toBe(true);
    });
  }
});
