import {
  Document,
  type DocumentProps,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type {
  QuestionBreakdownEntry,
  StudentResultsReport,
  StudentTestReportEntry,
} from "./results-report-assembler";
import { QuestionGradeStatus } from "./results-report-assembler";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 16, fontFamily: "Helvetica-Bold" },
  test: { marginBottom: 16 },
  testHeader: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  meta: { marginBottom: 2, color: "#333" },
  feedback: { marginBottom: 6, fontStyle: "italic", color: "#555" },
  question: {
    marginBottom: 6,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: "#ccc",
  },
  questionTitle: { fontFamily: "Helvetica-Bold" },
});

/**
 * Presentation-only label for a score that may be pending manual grading.
 * @param score - The numeric score, or null when not yet graded.
 * @param gradeStatus - Whether the score is finalised or pending.
 */
function scoreLabel(
  score: number | null,
  gradeStatus: QuestionGradeStatus,
): string {
  if (gradeStatus === QuestionGradeStatus.Pending || score === null) {
    return "Pending";
  }
  return String(score);
}

/**
 * Renders a single question's breakdown row.
 * @param question - The per-question breakdown entry.
 */
function QuestionRow(question: QuestionBreakdownEntry): ReactElement {
  return (
    <View style={styles.question} key={question.questionId}>
      <Text style={styles.questionTitle}>{question.title}</Text>
      <Text style={styles.meta}>Answer: {question.answer.join(", ")}</Text>
      <Text style={styles.meta}>
        Score: {scoreLabel(question.score, question.gradeStatus)}
      </Text>
      {question.feedback ? (
        <Text style={styles.meta}>Feedback: {question.feedback}</Text>
      ) : null}
    </View>
  );
}

/**
 * Renders a single test's section: header, score/status, overall feedback,
 * and the per-question breakdown.
 * @param test - The per-test report entry.
 */
function TestSection(test: StudentTestReportEntry): ReactElement {
  return (
    <View style={styles.test} key={test.testId}>
      <Text style={styles.testHeader}>{test.title}</Text>
      <Text style={styles.meta}>
        Overall score: {scoreLabel(test.score, test.gradeStatus)}
      </Text>
      <Text style={styles.meta}>Status: {test.status}</Text>
      {test.overallFeedback ? (
        <Text style={styles.feedback}>Feedback: {test.overallFeedback}</Text>
      ) : null}
      {test.questions.map((question) => QuestionRow(question))}
    </View>
  );
}

/**
 * Builds the `@react-pdf/renderer` element tree for a student's results
 * report. Pure presentation: it renders only what the model already contains
 * and performs no data fetching or score/status derivation.
 * @param model - The fully-assembled report model.
 * @returns The renderable PDF document element.
 */
export function ResultsReportDocument(
  model: StudentResultsReport,
): ReactElement<DocumentProps> {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Results report — {model.student.name}</Text>
        {model.tests.map((test) => TestSection(test))}
      </Page>
    </Document>
  );
}

/**
 * Renders a student's results report to a PDF buffer.
 * @param model - The fully-assembled report model.
 * @returns A promise resolving to the PDF bytes.
 */
export async function renderResultsReportToBuffer(
  model: StudentResultsReport,
): Promise<Buffer> {
  return renderToBuffer(ResultsReportDocument(model));
}
