/**
 * Typed MongoDB insert helpers and overflow assertions for the layout e2e specs.
 *
 * Each insert mirrors its service's create-path defaults (see the matching
 * `*-service.ts`), so a changed `*Document` interface fails `tsc --noEmit`
 * instead of drifting silently — the problem mc-edge-cases.test.ts's raw,
 * untyped inserts already have. A doc with one parent takes its id
 * positionally; a doc with several takes them by name, so ids can't be swapped.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { type Db, MongoClient } from "mongodb";
import type { AnswerDocument } from "../src/lib/answer-service";
import type { CourseDocument } from "../src/lib/course-service";
import type { EnrollmentDocument } from "../src/lib/enrollment-service";
import type { QuestionPoolDocument } from "../src/lib/question-pool-service";
import type { QuestionDocument } from "../src/lib/question-service";
import type { StudentDocument } from "../src/lib/student-service";
import type { TestDocument } from "../src/lib/test-service";
import { E2E_MONGODB_URI } from "./mongodb-uri";

/** Runs `fn` against the e2e database; the connection closes even if `fn` throws. */
export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(E2E_MONGODB_URI);
  await client.connect();
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

export async function insertCourse(
  db: Db,
  overrides: Partial<CourseDocument> = {},
): Promise<string> {
  const now = new Date();
  const doc: CourseDocument = {
    id: crypto.randomUUID(),
    title: "[layout] Course",
    description: "",
    createdAt: now,
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    materials: [],
    inviteToken: null,
    ...overrides,
  };
  await db.collection<CourseDocument>("course").insertOne(doc);
  return doc.id;
}

export async function insertTest(
  db: Db,
  courseId: string,
  overrides: Partial<TestDocument> = {},
): Promise<string> {
  const now = new Date();
  const doc: TestDocument = {
    id: crypto.randomUUID(),
    courseId,
    title: "[layout] Test",
    description: "",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
    // Explicit — an omitted field reads back as the legacy "diff" (test-service.ts:164),
    // while the UI's create path defaults new tests to "plain".
    answerRevealMode: "plain",
    timeLimitMinutes: null,
    isPractice: false,
    correctAnswersReleasedAt: null,
    gradesReleasedAt: null,
    createdAt: now,
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
  await db.collection<TestDocument>("test").insertOne(doc);
  return doc.id;
}

export async function insertQuestion(
  db: Db,
  testId: string,
  overrides: Partial<QuestionDocument> = {},
): Promise<string> {
  const now = new Date();
  const doc: QuestionDocument = {
    id: crypto.randomUUID(),
    testId,
    title: "[layout] Question",
    content: "",
    order: 1,
    createdAt: now,
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    type: "free_text",
    options: null,
    weight: 1,
    mcGradingStrategy: null,
    explanation: null,
    referenceAnswer: null,
    answerRevealMode: null,
    media: [],
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
  await db.collection<QuestionDocument>("question").insertOne(doc);
  return doc.id;
}

export async function insertStudent(
  db: Db,
  overrides: Partial<StudentDocument> = {},
): Promise<string> {
  const now = new Date();
  const doc: StudentDocument = {
    id: crypto.randomUUID(),
    authUserId: `seed-auth-${crypto.randomUUID()}`,
    username: `layout-${crypto.randomUUID().slice(0, 8)}`,
    name: "[layout] Student",
    createdAt: now,
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
  await db.collection<StudentDocument>("student").insertOne(doc);
  return doc.id;
}

export async function enroll(
  db: Db,
  fields: Pick<EnrollmentDocument, "courseId" | "studentId"> &
    Partial<EnrollmentDocument>,
): Promise<string> {
  const doc: EnrollmentDocument = {
    id: crypto.randomUUID(),
    enrolledAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    ...fields,
  };
  await db.collection<EnrollmentDocument>("enrollment").insertOne(doc);
  return doc.id;
}

export async function insertAnswer(
  db: Db,
  fields: Pick<
    AnswerDocument,
    "testId" | "questionId" | "studentId" | "answer"
  > &
    Partial<AnswerDocument>,
): Promise<string> {
  const doc: AnswerDocument = {
    id: crypto.randomUUID(),
    submittedAt: new Date(),
    ...fields,
  };
  await db.collection<AnswerDocument>("answer").insertOne(doc);
  return doc.id;
}

export async function insertPool(
  db: Db,
  overrides: Partial<QuestionPoolDocument> = {},
): Promise<string> {
  const now = new Date();
  const doc: QuestionPoolDocument = {
    id: crypto.randomUUID(),
    name: "[layout] Pool",
    description: "",
    createdAt: now,
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
  await db.collection<QuestionPoolDocument>("question_pool").insertOne(doc);
  return doc.id;
}

/** The page never grows wider than the viewport, so nothing scrolls sideways. */
export async function expectNoPageOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/**
 * The text breaks onto more than one line — proof its fixture is long enough
 * to press on its container, so a later widening can't silently hollow the test.
 */
export async function expectWrapped(locator: Locator): Promise<void> {
  const { height, lineHeight } = await locator.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height).toBeGreaterThan(lineHeight * 1.5);
}

/** An element's own content never overflows its box (clipped or scrolled). */
export async function expectNotClipped(locator: Locator): Promise<void> {
  const { scrollWidth, clientWidth } = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
