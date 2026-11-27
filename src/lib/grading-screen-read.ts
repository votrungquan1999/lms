import type { Answer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import type {
  PairGradingResult,
  TestGradingCounts,
} from "src/lib/grading-count-service";
import type { Question } from "src/lib/question-service";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import {
  getAnswerService,
  getEnrollmentService,
  getGradeService,
  getQuestionService,
  getStudentService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import type { Student } from "src/lib/student-service";
import type { Test } from "src/lib/test-service";

/** Everything the grading screen shows about one test, read once. */
export interface GradingScreenRead {
  /** The test's live questions, in order. */
  questions: Question[];
  /** The course's enrolled students of this school, in enrollment order. */
  students: Student[];
  /** The test's school counts; null when the school's counts do not list the test. */
  counts: TestGradingCounts | null;
  /** Each enrolled student's pair result, by student id. */
  pairs: Map<string, PairGradingResult>;
  /** Latest answers on live questions: student id, then question id. */
  answers: Map<string, Map<string, Answer>>;
  /** Grades on live questions: student id, then question id. */
  grades: Map<string, Map<string, Grade>>;
}

/**
 * Reads the grading screen's data in the order its counts need: school counts,
 * hand-ins for the expired attempts those counts flag, then the test's answers
 * and grades. Reading grades before the hand-in would show choice answers an
 * expired attempt is about to auto-grade as still needing a grade.
 * @param schoolId - The page's school.
 * @param test - A test of that school.
 * @returns The questions, students, counts and the test-wide answers and grades.
 */
export async function readGradingScreen(
  schoolId: string,
  test: Test,
): Promise<GradingScreenRead> {
  const [enrollmentService, studentService, questionService] =
    await Promise.all([
      getEnrollmentService(schoolId),
      getStudentService(schoolId),
      getQuestionService(schoolId),
    ]);

  const [schoolCounts, studentIds, questions] = await Promise.all([
    getSchoolGradingCounts(schoolId),
    enrollmentService.listEnrollmentsByCourse(test.courseId),
    questionService.listQuestions(test.id),
  ]);

  const testPairs = schoolCounts.pairs.filter((p) => p.testId === test.id);
  const submissionService = await getTestSubmissionService(schoolId);
  await Promise.all(
    testPairs
      .filter((p) => p.assumedHandIn)
      .map((p) => submissionService.handInIfExpired(test.id, p.studentId)),
  );

  const [answerService, gradeService] = await Promise.all([
    getAnswerService(schoolId),
    getGradeService(schoolId),
  ]);
  const [allAnswers, allGrades, studentRows] = await Promise.all([
    answerService.getLatestAnswersForTest(test.id),
    gradeService.getGradesForTest(test.id),
    studentService.findByIds(studentIds),
  ]);

  // A question can be deleted after it was answered or graded; those rows must not count.
  const liveQuestionIds = new Set(questions.map((q) => q.id));
  const answers = new Map<string, Map<string, Answer>>();
  for (const a of allAnswers) {
    if (!liveQuestionIds.has(a.questionId)) continue;
    const byQuestion = answers.get(a.studentId) ?? new Map<string, Answer>();
    byQuestion.set(a.questionId, a);
    answers.set(a.studentId, byQuestion);
  }
  const grades = new Map<string, Map<string, Grade>>();
  for (const g of allGrades) {
    if (!liveQuestionIds.has(g.questionId)) continue;
    const byQuestion = grades.get(g.studentId) ?? new Map<string, Grade>();
    byQuestion.set(g.questionId, g);
    grades.set(g.studentId, byQuestion);
  }

  const studentById = new Map(studentRows.map((s) => [s.id, s]));
  return {
    questions,
    students: studentIds
      .map((id) => studentById.get(id))
      .filter((s): s is Student => s !== undefined),
    counts: schoolCounts.tests.find((t) => t.testId === test.id) ?? null,
    pairs: new Map(testPairs.map((p) => [p.studentId, p])),
    answers,
    grades,
  };
}
