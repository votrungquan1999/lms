import zlib from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import {
  enroll,
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

/** The presigned photo URLs point at a bucket that does not exist; serve a real image instead. */
async function servePhotos(
  page: Page,
  width = PHOTO_WIDTH,
  height = PHOTO_HEIGHT,
) {
  const png = greyPng(width, height);
  await page.route(/e2e-mock-bucket/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
}

/** Draws a drag across the photo; the answer pane scrolls on its own, so a wheel brings the photo to the pane's top first. */
async function dragOnPhoto(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const surface = page.getByLabel("Drawing surface");
  await expect(
    page.getByRole("img", { name: "Student submitted work" }),
  ).toHaveJSProperty("naturalWidth", PHOTO_WIDTH);
  // Scroll the pane back to its top so the whole photo sits inside its clip
  const initial = await surface.boundingBox();
  if (!initial) throw new Error("drawing surface has no bounding box");
  await page.mouse.move(initial.x + 10, 400);
  await page.mouse.wheel(0, -5000);
  await expect
    .poll(async () => ((await surface.boundingBox())?.y ?? 0) > 244)
    .toBe(true);
  const box = await surface.boundingBox();
  if (!box) throw new Error("drawing surface has no bounding box");
  await page.mouse.move(
    box.x + box.width * from[0],
    box.y + box.height * from[1],
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1]);
  await page.mouse.up();
}

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
      const picker = page.getByRole("button", { name: "Student picker" });
      await picker.click();
      await page.getByRole("menuitem", { name: /Ben Photos/ }).click();
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
