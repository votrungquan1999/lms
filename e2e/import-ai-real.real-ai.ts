/**
 * Feature: AI document import against the REAL Gemini API (opt-in, billed)
 *
 * Run with `pnpm test:e2e:real-ai` — see `playwright.real-ai.config.ts` for
 * its two gitignored prerequisites. Uploads a real Vietnamese Grade-10
 * Biology exam and checks what a teacher needs from the import: every
 * question (spares included) arrives, each highlighted answer key comes
 * through ticked, each picture lands on its own question, and the upload's
 * highlight and picture markers never reach saved text.
 *
 * Cost rules:
 * - ONE Gemini call per run — a single upload feeds both review and import.
 * - Soft assertions, so one paid run reports every failure, not just the first.
 * - The raw parse exchange and saved questions land in `tmp/real-ai-runs/`
 *   BEFORE any assertion: diagnose from that file, change code, then rerun.
 *   A full-page screenshot of the review screen sits next to it.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { MARKDOWN_REMARK_PLUGINS } from "../src/components/markdown-content";
import { E2E_MONGODB_URI } from "./mongodb-uri";

interface SavedOptionDocument {
  text: string;
  isCorrect: boolean;
}

interface SavedMediaDocument {
  fileName: string;
}

/** The fields of a stored question this spec reads. */
interface SavedQuestionDocument {
  title: string;
  content: string;
  type: string;
  options: SavedOptionDocument[] | null;
  referenceAnswer: string | null;
  explanation: string | null;
  media: SavedMediaDocument[];
}

interface ExpectedQuestion {
  /** How the exam labels it. */
  label: string;
  /** A phrase found only in this question (an option's text when the stem is too short). */
  find: string;
  /** Text inside the one option the teacher highlighted as correct. */
  answerKey?: string;
  /** The written answer the exam gives, as a whole number. */
  referenceAnswer?: string;
  /** Fewest non-empty content lines — steps/lists must not collapse into one paragraph. */
  minLines?: number;
  /** Body rows its table must render with — extra rows mean a following line was swallowed. */
  tableRows?: number;
  /** The line after its list/table, which must render as its own paragraph, not inside the block. */
  closingLine?: string;
  /** Text inside each true/false statement the teacher highlighted as true, in order. */
  trueStatements?: string[];
  /** The document's `[image N]` pictures it must carry; absent means none. */
  pictures?: number[];
}

/** Everything one paid run produced, written to disk as it arrives. */
interface RealAiRun {
  documentPath: string;
  /** Which Gemini model answered — `GEMINI_MODEL_ID` can override the app default. */
  model: string;
  parseRequestBody?: string;
  parseResponseBody?: string;
  importAlerts?: string[];
  savedQuestions?: SavedQuestionDocument[];
}

const EXAM_DOCX = path.join(__dirname, "fixtures/private/sinh-10-hk1.docx");
const RUNS_DIR = path.join(__dirname, "../tmp/real-ai-runs");
// A screenshot of another quiz left beside Câu 8 — no question clearly owns it, so it may land anywhere or nowhere.
const STRAY_PICTURES = [5];
const COURSE_TITLE = "Real AI Import Course";
const TEST_TITLE = "Sinh 10 HK1 (real AI import)";

// All 31 questions, "Sơ cua" spares included. `answerKey` is the option the
// teacher highlighted yellow; Câu 14 has none (its key is in an image). ĐS
// questions tick their true statements; TL essays have no key in the exam.
// `pictures` follows extraction's numbering: the exam places picture 1 twice
// (same bytes, one number), and several pictures sit before their label.
const EXPECTED_QUESTIONS: ExpectedQuestion[] = [
  {
    label: "Câu 1 NLC",
    find: "Đặc điểm nào sau đây là đúng khi nói về vi sinh vật",
    answerKey: "Tốc độ chuyển hóa vật chất và năng lượng nhanh",
  },
  {
    label: "Câu 2 NLC",
    find: "Nhóm vi sinh vật có cấu tạo tế bào nhân sơ là",
    answerKey: "vi khuẩn",
  },
  {
    label: "Câu 3 NLC",
    find: "Điểm khác nhau cơ bản giữa vi sinh vật quang tự dưỡng và quang dị dưỡng",
    answerKey: "nguồn carbon",
  },
  {
    label: "Câu 4 NLC",
    find: "Một nhà nghiên cứu thực hiện các bước sau",
    answerKey: "phân lập vi sinh vật",
    minLines: 4,
    closingLine: "Quy trình trên thuộc phương pháp",
  },
  {
    label: "Sơ cua (nước ao)",
    find: "quan sát vi sinh vật trong nước ao bằng kính hiển vi",
    answerKey: "động vật nguyên sinh",
    pictures: [2],
  },
  {
    label: "Sơ cua (đĩa petri)",
    find: "nhằm phân lập một số dòng vi sinh vật",
    answerKey: "dịch mẫu chưa được pha loãng",
    pictures: [3, 4],
  },
  {
    label: "Câu 5 NLC",
    find: "Thứ tự đúng của các pha sinh trưởng ở quần thể vi khuẩn",
    answerKey: "pha tiềm phát → pha lũy thừa → pha cân bằng → pha suy vong",
  },
  {
    label: "Câu 6 NLC",
    find: "sinh trưởng tối ưu trong khoảng nhiệt độ từ 20°C đến 40°C",
    answerKey: "vi sinh vật ưa ấm",
  },
  {
    label: "Câu 7 NLC",
    find: "Dựa vào độ pH của môi trường",
    answerKey: "ưa acid, ưa kiềm và ưa trung tính",
  },
  {
    label: "Sơ cua (co nguyên sinh)",
    find: "Hiện tượng co nguyên sinh ở tế bào vi sinh vật",
    answerKey: "Áp suất thẩm thấu cao",
  },
  {
    label: "Câu 8 NLC",
    find: "Bảng sau cho biết các pha sinh trưởng",
    answerKey: "(1)-IV; (2)-III; (3)-I; (4)-II",
    tableRows: 4,
    closingLine: "Tổ hợp ghép đúng là",
  },
  {
    label: "Câu 9 NLC",
    find: "vi sinh vật trong hình có hình thức sinh sản nào",
    answerKey: "Sinh sản bằng bào tử vô tính",
    pictures: [6],
  },
  {
    label: "Câu 10 NLC",
    find: "lên men rượu nhờ nấm men Saccharomyces cerevisiae",
    answerKey: "ethanol và khí CO",
  },
  {
    label: "Câu 11 NLC",
    find: "Quy trình sản xuất nước mắm và nước tương truyền thống",
    answerKey: "Phân giải protein thành các amino acid",
  },
  {
    label: "Câu 12 NLC",
    find: "Single Cell Protein",
    answerKey: "bổ sung nguồn đạm",
  },
  {
    label: "Câu 13 NLC",
    find: "hệ vi sinh vật đường ruột ở người khỏe mạnh",
    answerKey: "Nếu điều trị bệnh bằng kháng sinh dài ngày",
  },
  {
    label: "Câu 14 NLC",
    find: "cấu trúc nào của virus đóng vai trò là thụ thể",
    pictures: [9],
  },
  {
    label: "Câu 15 NLC",
    find: "những thực thể sống có cấu tạo tế bào nhân thực và kích thước nhỏ",
    answerKey: "dạng sống không có cấu tạo tế bào, kích thước rất nhỏ",
  },
  {
    label: "Sơ cua (hạt virus)",
    find: "Virus không được gọi là một",
    answerKey: "chúng không có cấu tạo tế bào",
  },
  {
    label: "Sơ cua (thành phần virus)",
    find: "Hai thành phần cấu tạo chính của virus",
    answerKey: "lõi nucleic acid và vỏ capsid",
  },
  {
    label: "Câu 16 NLC",
    find: "Các gai glycoprotein trên bề mặt vỏ ngoài của một số virus có chức năng",
    answerKey: "thụ thể giúp virus bám dính đặc hiệu",
  },
  {
    label: "Sơ cua (chu trình virus)",
    find: "Thứ tự đúng của các giai đoạn trong chu trình nhân lên của virus",
    answerKey: "Bám dính → Xâm nhập → Sinh tổng hợp → Lắp ráp → Giải phóng",
  },
  {
    label: "TLN 1",
    find: "quan sát quần thể vi khuẩn lactic",
    referenceAnswer: "3142",
    pictures: [1],
  },
  {
    label: "TLN 2",
    find: "Đặc điểm của các pha và đồ thị sinh trưởng của vi khuẩn",
    referenceAnswer: "4312",
    minLines: 5,
    pictures: [7],
  },
  {
    label: "Câu 3 TLN",
    find: "sắp xếp theo thứ tự từ nhỏ đến lớn các ứng dụng",
    referenceAnswer: "234",
  },
  {
    label: "Câu 4 TLN",
    find: "Thuốc Ciprofloxacin là kháng sinh bán tổng hợp",
    referenceAnswer: "3",
    pictures: [8],
  },
  {
    label: "Câu 1 ĐS",
    find: "Streptomycin là một loại thuốc kháng sinh quan trọng",
    trueStatements: [
      "thuộc nhóm sinh vật đơn bào nhân sơ",
      "thay đổi cấu trúc ribosome",
    ],
  },
  {
    label: "Câu 2 ĐS",
    find: "Virus SARS-CoV-2 gây bệnh COVID-19",
    trueStatements: [
      "Nếu các gai S bị biến đổi cấu trúc",
      "Giai đoạn sinh tổng hợp",
      "có thể làm phá hủy tế bào chủ",
    ],
    pictures: [10],
  },
  {
    label: "TL1",
    find: "lịch sử phát hiện các loài vi sinh vật",
    pictures: [12],
  },
  {
    label: "TL2",
    find: "Bạn Mai thực hiện quy trình làm giấm táo",
    pictures: [11],
  },
  {
    label: "TL3",
    find: "HIV (Human Immunodeficiency Virus) là virus gây hội chứng suy giảm miễn dịch",
    pictures: [13],
  },
];

/**
 * Canonicalises text for comparison: Vietnamese diacritics can arrive
 * composed or decomposed, and whitespace/line breaks vary between runs.
 * @param text - Any text.
 * @returns NFC text with runs of whitespace collapsed to one space.
 */
function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Renders question content with the LMS's own Markdown plugins — exactly what
 * students see — so layout checks test the page, not the raw text. Renders
 * `ReactMarkdown` directly: Playwright rewrites JSX in app `.tsx` files, so
 * `MarkdownContent` itself can't render here.
 * @param content - A saved question's content.
 * @returns The rendered HTML.
 */
function renderContent(content: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: MARKDOWN_REMARK_PLUGINS },
      content,
    ),
  );
}

/**
 * Finds the saved question containing a phrase in its title, content, or options.
 * @param questions - Every saved question.
 * @param phrase - A phrase unique to one question.
 * @returns The matching question, or undefined when none contains it.
 */
function findQuestion(
  questions: SavedQuestionDocument[],
  phrase: string,
): SavedQuestionDocument | undefined {
  const needle = normalize(phrase);
  return questions.find((question) =>
    normalize(
      [
        question.title,
        question.content,
        ...(question.options ?? []).map((option) => option.text),
      ].join(" "),
    ).includes(needle),
  );
}

/**
 * Writes the run to disk, overwriting the previous snapshot of it.
 * @param runFile - This run's file.
 * @param run - Everything captured so far.
 */
function saveRun(runFile: string, run: RealAiRun): void {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(run, null, 2));
}

test.describe("AI Document Import — real Gemini", () => {
  test.describe.configure({ mode: "serial" });

  test("setup: admin creates a course and a test", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For the real-AI import e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("the real exam imports with every question, its highlighted answer keys ticked, its pictures attached, and no leaked markers", async ({
    page,
  }) => {
    const runFile = path.join(
      RUNS_DIR,
      `${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    const run: RealAiRun = {
      documentPath: EXAM_DOCX,
      model: process.env.GEMINI_MODEL_ID || "app default (gemini-3.5-flash)",
    };
    console.log(`[real-ai] model: ${run.model} — output: ${runFile}`);

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    // Real bucket: the browser may not upload from localhost:3005 (the bucket's
    // CORS list allows only :3000), so Playwright sends the same signed PUT
    // itself. Fake bucket: answer the upload here, as the other upload e2e tests do.
    const realBucket = process.env.E2E_S3_BUCKET_NAME;
    console.log(`[real-ai] storage: ${realBucket ?? "fake bucket"}`);
    await page.route(
      (url) => url.href.includes("s3") || url.href.includes("amazonaws"),
      async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        if (!realBucket) return route.fulfill({ status: 200, body: "" });
        return route.fulfill({ response: await route.fetch() });
      },
    );
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await expect(
      page.getByRole("heading", { name: "Import Questions with AI" }),
    ).toBeVisible();
    const testId = page.url().match(/\/tests\/([^/]+)\/import-ai/)?.[1];
    expect(testId, "test id in the import page URL").toBeTruthy();

    // The one paid call: the parse server action carrying the exam's text.
    const parseResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        "next-action" in response.request().headers() &&
        (response.request().postData() ?? "").includes("Câu 1 NLC"),
      // Past the client's own 240s limit, so a timeout surfaces as the app's error, not ours.
      { timeout: 270_000 },
    );
    await page.getByLabel(/document/i).setInputFiles(EXAM_DOCX);
    const parseResponse = await parseResponsePromise;
    run.parseRequestBody = parseResponse.request().postData() ?? "";
    // Diagnostic only: on some failures the page navigates first and the body is gone.
    run.parseResponseBody = await parseResponse
      .text()
      .catch((error: Error) => `<body unavailable: ${error.message}>`);
    saveRun(runFile, run);

    // The route announcer is also role=alert, but lives outside <main>.
    const alerts = page.getByRole("main").getByRole("alert");
    const importButton = page.getByRole("button", { name: "Import questions" });
    await expect(importButton.or(alerts.first())).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      importButton,
      `parse failed: ${(await alerts.allInnerTexts()).join(" | ")}`,
    ).toBeVisible();
    // For a human check of which picture landed on which question.
    await page.screenshot({
      path: runFile.replace(/\.json$/, "-review.png"),
      fullPage: true,
    });

    await importButton.click();
    const testHeading = page.getByRole("heading", {
      name: TEST_TITLE,
      level: 1,
    });
    await expect(testHeading.or(alerts.first())).toBeVisible({
      timeout: 60_000,
    });
    run.importAlerts = await alerts.allInnerTexts();
    saveRun(runFile, run);
    await expect(
      testHeading,
      `import rejected: ${run.importAlerts.join(" | ")}`,
    ).toBeVisible();

    const client = new MongoClient(E2E_MONGODB_URI);
    try {
      await client.connect();
      const documents = await client
        .db()
        .collection<SavedQuestionDocument & { testId: string }>("question")
        .find({ testId, deletedAt: null })
        .sort({ order: 1 })
        .toArray();
      run.savedQuestions = documents.map((document) => ({
        title: document.title,
        content: document.content,
        type: document.type,
        options: document.options,
        referenceAnswer: document.referenceAnswer,
        explanation: document.explanation,
        media: (document.media ?? []).map((media) => ({
          fileName: media.fileName,
        })),
      }));
    } finally {
      await client.close();
    }
    saveRun(runFile, run);

    const saved = run.savedQuestions;
    expect(saved.length, "no questions were saved").toBeGreaterThan(0);
    expect
      .soft(
        saved.length,
        "one saved question per exam question — none split, none invented",
      )
      .toBe(EXPECTED_QUESTIONS.length);

    for (const expected of EXPECTED_QUESTIONS) {
      const question = findQuestion(saved, expected.find);
      expect
        .soft(
          question,
          `${expected.label} missing (looked for "${expected.find}")`,
        )
        .toBeDefined();

      if (expected.answerKey !== undefined) {
        const ticked = (question?.options ?? [])
          .filter((option) => option.isCorrect)
          .map((option) => normalize(option.text));
        expect
          .soft(
            ticked,
            `${expected.label}: the one ticked option is the highlighted one`,
          )
          .toEqual([expect.stringContaining(normalize(expected.answerKey))]);
        expect
          .soft(
            question?.type,
            `${expected.label}: single-answer question type`,
          )
          .toBe("single_select");
      }

      if (expected.referenceAnswer !== undefined) {
        expect
          .soft(
            normalize(question?.referenceAnswer ?? ""),
            `${expected.label}: reference answer`,
          )
          .toMatch(new RegExp(`(^|\\D)${expected.referenceAnswer}(\\D|$)`));
      }

      // Content renders as Markdown with line breaks kept, so layout survives only if Gemini keeps it.
      if (expected.minLines !== undefined) {
        const lines = (question?.content ?? "")
          .split("\n")
          .filter((line) => line.trim()).length;
        expect
          .soft(
            lines,
            `${expected.label}: keeps its lines, not one run-on paragraph`,
          )
          .toBeGreaterThanOrEqual(expected.minLines);
      }

      if (expected.tableRows !== undefined) {
        const html = renderContent(question?.content ?? "");
        const bodyRows =
          html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]?.match(/<tr>/g)
            ?.length ?? 0;
        expect
          .soft(
            bodyRows,
            `${expected.label}: rendered table has exactly its rows`,
          )
          .toBe(expected.tableRows);
      }

      if (expected.closingLine !== undefined) {
        expect
          .soft(
            renderContent(question?.content ?? ""),
            `${expected.label}: "${expected.closingLine}" renders as its own paragraph`,
          )
          .toContain(`<p>${expected.closingLine}</p>`);
      }

      // Extraction names each upload picture-N, after its [image N] tag.
      const pictures = (question?.media ?? [])
        .map((media) => Number(media.fileName.match(/^picture-(\d+)\./)?.[1]))
        .filter((number) => !STRAY_PICTURES.includes(number))
        .sort((a, b) => a - b);
      expect
        .soft(pictures, `${expected.label}: carries exactly its own pictures`)
        .toEqual(expected.pictures ?? []);

      if (expected.trueStatements !== undefined) {
        const ticked = (question?.options ?? [])
          .filter((option) => option.isCorrect)
          .map((option) => normalize(option.text));
        expect
          .soft(
            ticked,
            `${expected.label}: exactly the true statements are ticked`,
          )
          .toEqual(
            expected.trueStatements.map((statement) =>
              expect.stringContaining(normalize(statement)),
            ),
          );
        expect
          .soft(
            question?.type,
            `${expected.label}: true/false statements as a multi-select`,
          )
          .toBe("multi_select");
      }
    }

    const leakedMarkers = saved
      .flatMap((question) => [
        question.title,
        question.content,
        question.referenceAnswer,
        question.explanation,
        ...(question.options ?? []).map((option) => option.text),
      ])
      .filter(
        (text): text is string =>
          !!text && /<\/?mark\b|\[image \d+\]/.test(text),
      );
    expect
      .soft(
        leakedMarkers,
        "highlight or picture markers leaked into saved question text",
      )
      .toEqual([]);
  });
});
