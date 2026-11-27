"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  GradingRouteKind,
  ReleaseMode,
} from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import {
  gradingBasePath,
  gradingHref,
} from "src/app/admin/(dashboard)/grading/page-body/href";
import { revalidateGradingPaths } from "src/app/admin/(dashboard)/grading/page-body/revalidate-grading-paths";
import {
  AiGradeOutcome,
  recordAiAcceptance,
} from "src/lib/ai/ai-acceptance-telemetry";
import {
  ANNOTATION_PALETTE,
  ANNOTATION_TEXT_MAX_LENGTH,
} from "src/lib/annotation-service";
import { getAuthService } from "src/lib/auth-singleton";
import { GradingMode } from "src/lib/grading-mode";
import { readGradingScreen } from "src/lib/grading-screen-read";
import {
  answerNeedsGrade,
  findNextAnswerToGrade,
} from "src/lib/next-answer-to-grade";
import { withSpan } from "src/lib/observability/with-span";
import {
  getAiGradeService,
  getAnnotationService,
  getGradeService,
  getQuestionService,
  getRedoRequestService,
  getStudentService,
  getTestFeedbackService,
  getTestService,
  getTestStartService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
import { z } from "zod";
import { assertGradingTarget, resolveOwnedTest } from "../test-parent-check";

export interface ReleaseTestState {
  success: boolean;
  message: string;
}

/** Why Save & next stayed on the answer; a successful save redirects instead of returning. */
export interface SaveAndNextState {
  message: string;
}

const testFeedbackSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  feedback: z.string(),
});

const annotationPointSchema = z.object({ x: z.number(), y: z.number() });
const annotationStrokeSchema = z.object({
  color: z.string().min(1),
  points: z.array(annotationPointSchema),
  seq: z.number().int().min(0).optional(),
});
const annotationTextSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  text: z.string().min(1).max(ANNOTATION_TEXT_MAX_LENGTH),
  color: z.enum(ANNOTATION_PALETTE),
  seq: z.number().int().min(0).optional(),
});
const annotationEntriesSchema = z.array(
  z.object({
    mediaKey: z.string().min(1),
    strokes: z.array(annotationStrokeSchema),
    texts: z.array(annotationTextSchema).optional(),
  }),
);

export interface TestFeedbackState {
  success: boolean;
  message: string;
}

/**
 * Server action: sets overall test feedback for a student.
 */
export async function setTestFeedbackAction(
  _prevState: TestFeedbackState | null,
  formData: FormData,
): Promise<TestFeedbackState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = testFeedbackSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
    feedback: formData.get("feedback"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.setTestFeedbackAction",
      {
        "lms.action.name": "setTestFeedbackAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
        await assertGradingTarget(schoolId, parsed.data);

        const testFeedbackService = await getTestFeedbackService(schoolId);
        await testFeedbackService.setTestFeedback({
          testId: parsed.data.testId,
          studentId: parsed.data.studentId,
          feedback: parsed.data.feedback,
          gradedBy: adminUserId,
        });

        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId);

        // An empty text removes the feedback, so the message says so.
        return {
          success: true,
          message:
            parsed.data.feedback === "" ? "Feedback cleared" : "Feedback saved",
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to save feedback",
    };
  }
}

/**
 * Lets a chosen-students release go ahead only when every student is enrolled
 * in the test's course, Graded now, and has no open redo.
 * @throws "Student not found" for a student outside the course.
 * @throws A message naming the students who are not graded or have an open redo.
 */
async function refuseUnlessReleasable(
  schoolId: string,
  testId: string,
  courseId: string,
  studentIds: string[],
): Promise<void> {
  const statusService = await getTestStatusService(schoolId);
  const redoService = await getRedoRequestService(schoolId);
  const questions = await (await getQuestionService(schoolId)).listQuestions(
    testId,
  );
  const notGraded: string[] = [];
  const openRedo: string[] = [];
  for (const studentId of studentIds) {
    await assertGradingTarget(schoolId, { testId, courseId, studentId });
    // The status read hands in an expired timed attempt, so it has a submission to stamp.
    const status = await statusService.getStatus(
      testId,
      studentId,
      questions.length,
    );
    if (await redoService.getActiveRedoRequest(testId, studentId)) {
      openRedo.push(studentId);
    } else if (status !== TestStatus.Graded) {
      notGraded.push(studentId);
    }
  }
  if (notGraded.length === 0 && openRedo.length === 0) return;

  const students = await (await getStudentService(schoolId)).findByIds([
    ...notGraded,
    ...openRedo,
  ]);
  const names = (ids: string[]) =>
    ids.map((id) => students.find((s) => s.id === id)?.name ?? id).join(", ");
  const reasons = [
    ...(notGraded.length > 0 ? [`Not graded: ${names(notGraded)}`] : []),
    ...(openRedo.length > 0 ? [`Open redo: ${names(openRedo)}`] : []),
  ];
  throw new Error(`Nothing was released. ${reasons.join("; ")}`);
}

const releaseTestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal(ReleaseMode.Whole),
    testId: z.string().min(1),
    courseId: z.string().min(1),
    alsoCorrectAnswers: z.boolean(),
  }),
  z.object({
    mode: z.literal(ReleaseMode.Chosen),
    testId: z.string().min(1),
    courseId: z.string().min(1),
    alsoCorrectAnswers: z.boolean(),
    studentIds: z
      .array(z.string().min(1))
      .min(1, "Choose at least one student")
      .transform((ids) => [...new Set(ids)]),
  }),
]);

/**
 * Server action: releases a test's grades to every student (one write) or to
 * the chosen students (all or none), and its correct answers too when asked.
 */
export async function releaseTestAction(
  _prevState: ReleaseTestState | null,
  formData: FormData,
): Promise<ReleaseTestState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return {
      success: false,
      message: "Unauthorized: admin access required",
    };
  }

  const parsed = releaseTestSchema.safeParse({
    mode: formData.get("mode"),
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    alsoCorrectAnswers: formData.get("alsoCorrectAnswers") === "true",
    studentIds: formData.getAll("studentId"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }
  const { testId, courseId, alsoCorrectAnswers } = parsed.data;

  try {
    return await withSpan(
      "action.releaseTestAction",
      {
        "lms.action.name": "releaseTestAction",
        "lms.test.id": testId,
        "lms.course.id": courseId,
      },
      async () => {
        const testService = await getTestService(schoolId);
        await resolveOwnedTest(testService, testId, courseId);
        if (parsed.data.mode === ReleaseMode.Chosen) {
          const { studentIds } = parsed.data;
          await refuseUnlessReleasable(schoolId, testId, courseId, studentIds);
          const submissions = await getTestSubmissionService(schoolId);
          await submissions.releaseGradesToStudents(
            testId,
            studentIds,
            adminUserId,
          );
          // Correct answers open for the whole test, not only the chosen students.
          if (alsoCorrectAnswers) {
            await testService.releaseCorrectAnswers(testId, adminUserId);
          }
        } else {
          await testService.releaseGradesAndAnswers(
            testId,
            adminUserId,
            alsoCorrectAnswers,
          );
        }

        revalidateGradingPaths(courseId, testId, [
          `/admin/courses/${courseId}/tests/${testId}`,
          `/admin/courses/${courseId}`,
          `/student/courses/${courseId}/tests/${testId}`,
        ]);

        return { success: true, message: "Released" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to release",
    };
  }
}

const requestRedoSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
});

export interface RequestRedoState {
  success: boolean;
  message: string;
}

/**
 * Server action: requests a student to redo a test.
 * Creates an active RedoRequest so the student sees a banner next time they
 * open the test page.
 */
export async function requestRedoAction(
  _prevState: RequestRedoState | null,
  formData: FormData,
): Promise<RequestRedoState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = requestRedoSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.requestRedoAction",
      {
        "lms.action.name": "requestRedoAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
        await assertGradingTarget(schoolId, parsed.data);

        const redoRequestService = await getRedoRequestService(schoolId);
        const redoAlreadyOpen =
          (await redoRequestService.getActiveRedoRequest(
            parsed.data.testId,
            parsed.data.studentId,
          )) !== null;

        // A handed-in student's old deadline would leave the redo with no time;
        // one still writing, or already mid-redo, keeps theirs. Cleared before
        // the redo is recorded so a page load in between cannot hand in the
        // old expired attempt and consume the fresh redo.
        const submissionService = await getTestSubmissionService(schoolId);
        if (
          !redoAlreadyOpen &&
          (await submissionService.isTestSubmitted(
            parsed.data.testId,
            parsed.data.studentId,
          ))
        ) {
          const testStartService = await getTestStartService();
          await testStartService.clearActiveStart(
            parsed.data.testId,
            parsed.data.studentId,
            adminUserId,
          );
        }

        await redoRequestService.requestRedo(
          parsed.data.testId,
          parsed.data.studentId,
          adminUserId,
        );

        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId, [
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        ]);

        return { success: true, message: "Redo requested" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to request redo",
    };
  }
}

const saveAndNextSchema = z.object({
  routeKind: z.nativeEnum(GradingRouteKind),
  mode: z.nativeEnum(GradingMode),
  testId: z.string().min(1),
  courseId: z.string().min(1),
  questionId: z.string().min(1),
  studentId: z.string().min(1),
  // When the answer on the teacher's screen was saved, so a later change still needs a grade.
  gradedAnswerAt: z.coerce.date().optional(),
  score: z.coerce.number().int().min(0).max(100),
  feedback: z.string(),
  solution: z.string().optional(),
  needsOnly: z.literal("1").optional(),
  // The answer's photo marks as JSON; absent for an answer with no photos.
  annotations: z
    .string()
    .transform((json, ctx) => {
      try {
        return JSON.parse(json) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid annotations format" });
        return z.NEVER;
      }
    })
    .pipe(annotationEntriesSchema)
    .optional(),
});

/**
 * Server action: grades one answer, then stores its photo marks when sent,
 * and redirects to the next answer that needs a grade. When the AI had
 * suggested a grade for the answer, records how far the teacher's grade is
 * from it. Any failure returns its reason so the screen keeps what the
 * teacher typed; `redirect()` throws, so it stays outside the try/catch.
 * @param formData - The grade form.
 * @returns Why nothing moved on; never returns after a successful save.
 */
export async function saveAndNextAction(
  formData: FormData,
): Promise<SaveAndNextState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let session: Awaited<ReturnType<typeof authService.requireAdminSession>>;
  try {
    session = await authService.requireAdminSession(requestHeaders);
  } catch {
    return { message: "Unauthorized: admin access required" };
  }

  const parsed = saveAndNextSchema.safeParse({
    routeKind: formData.get("routeKind"),
    mode: formData.get("mode"),
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    questionId: formData.get("questionId"),
    studentId: formData.get("studentId"),
    gradedAnswerAt: formData.get("gradedAnswerAt") ?? undefined,
    score: formData.get("score"),
    feedback: formData.get("feedback"),
    solution: formData.get("solution") ?? undefined,
    needsOnly: formData.get("needsOnly") ?? undefined,
    annotations: formData.get("annotations") ?? undefined,
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }
  const input = parsed.data;

  let nextHref: string;
  try {
    nextHref = await saveAndFindNext(session, input);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      message: error instanceof Error ? error.message : "Failed to save grade",
    };
  }
  redirect(nextHref);
}

/**
 * Checks the target, saves the grade and its photo marks, and works out
 * where Save & next goes.
 * @param session - The acting admin.
 * @param input - The parsed grade form.
 * @returns The link of the next answer to grade, or the finish panel's.
 * @throws When the target is not this school's or a read or write fails.
 */
async function saveAndFindNext(
  session: { userId: string; school: { id: string } },
  input: z.infer<typeof saveAndNextSchema>,
): Promise<string> {
  await assertGradingTarget(session.school.id, input);

  const previousGrade = await withSpan(
    "action.saveAndNextAction",
    {
      "lms.action.name": "saveAndNextAction",
      "lms.test.id": input.testId,
      "lms.course.id": input.courseId,
      "lms.student.id": input.studentId,
    },
    async (span) => {
      // Read before saving, so a failed lookup never leaves a saved grade behind an error.
      const aiGradeService = await getAiGradeService(session.school.id);
      const suggestion = await aiGradeService.getLatestSuggestion(
        input.testId,
        input.questionId,
        input.studentId,
      );

      const gradeService = await getGradeService(session.school.id);
      const previous = await gradeService.getGrade(
        input.testId,
        input.questionId,
        input.studentId,
      );
      await gradeService.gradeQuestion({
        testId: input.testId,
        questionId: input.questionId,
        studentId: input.studentId,
        score: input.score,
        feedback: input.feedback,
        solution: input.solution,
        gradedBy: session.userId,
        gradedAnswerAt: input.gradedAnswerAt,
      });
      // After the grade, so a failed grade save never leaves marks on an ungraded answer.
      if (input.annotations) {
        await (await getAnnotationService(session.school.id)).saveAnnotations({
          testId: input.testId,
          questionId: input.questionId,
          studentId: input.studentId,
          gradedBy: session.userId,
          annotations: input.annotations,
        });
      }

      if (suggestion) {
        recordAiAcceptance(span, AiGradeOutcome.ManuallyGraded, suggestion, {
          score: input.score,
          feedback: input.feedback,
          solution: input.solution,
        });
      }

      revalidateGradingPaths(input.courseId, input.testId);
      return previous;
    },
  );

  // Read after the write, so the answer just graded no longer counts as waiting.
  const test = await resolveOwnedTest(
    await getTestService(session.school.id),
    input.testId,
    input.courseId,
  );
  const screen = await readGradingScreen(session.school.id, test, {
    ownCountsOnly: true,
  });
  const pair = screen.pairs.get(input.studentId);
  const gradedQuestion = screen.questions.find(
    (q) => q.id === input.questionId,
  );
  const gradedAnswer = screen.answers
    .get(input.studentId)
    ?.get(input.questionId);
  const gradedAnswerWasWaiting =
    gradedQuestion !== undefined &&
    answerNeedsGrade({
      question: gradedQuestion,
      answer: gradedAnswer?.answer,
      answeredAt: gradedAnswer?.submittedAt ?? null,
      grade: previousGrade,
      redoOpen: false,
    });
  const next = findNextAnswerToGrade({
    mode: input.mode,
    students: screen.students,
    current: { studentId: input.studentId, questionId: input.questionId },
    // The walk starts after her box as the teacher saw it: she was waiting if she still is, or if the answer just graded still needed a grade before this save.
    currentWasWaiting:
      pair !== undefined &&
      !pair.redoRequested &&
      (pair.status === TestStatus.Submitted ||
        (pair.status === TestStatus.Graded && gradedAnswerWasWaiting)),
    questions: screen.questions,
    pairs: screen.pairs,
    answers: screen.answers,
    grades: screen.grades,
  });

  return gradingHref({
    basePath: gradingBasePath(input),
    mode: input.mode,
    studentId: next?.studentId ?? input.studentId,
    questionId: next?.questionId ?? input.questionId,
    needsOnly: input.needsOnly === "1",
    done: next === null,
  });
}

const releaseCorrectAnswersSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
});

export interface ReleaseCorrectAnswersState {
  success: boolean;
  message: string;
  releasedAt: string | null;
}

/**
 * Server action: releases correct answers to students for a test that
 * withheld them.
 */
export async function releaseCorrectAnswersAction(
  _prevState: ReleaseCorrectAnswersState | null,
  formData: FormData,
): Promise<ReleaseCorrectAnswersState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return {
      success: false,
      message: "Unauthorized: admin access required",
      releasedAt: null,
    };
  }

  const parsed = releaseCorrectAnswersSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
      releasedAt: null,
    };
  }

  try {
    return await withSpan(
      "action.releaseCorrectAnswersAction",
      {
        "lms.action.name": "releaseCorrectAnswersAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const testService = await getTestService(schoolId);
        await resolveOwnedTest(
          testService,
          parsed.data.testId,
          parsed.data.courseId,
        );
        await testService.releaseCorrectAnswers(
          parsed.data.testId,
          adminUserId,
        );

        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId, [
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
          // The student is the audience for this release — without this they
          // keep seeing the withheld view on their next visit.
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        ]);

        return {
          success: true,
          message: "Correct answers released",
          releasedAt: new Date().toISOString(),
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: "Failed to release correct answers",
      releasedAt: null,
    };
  }
}
