import { AnnotationTool } from "src/app/admin/(dashboard)/grading/page-body/annotation-tool";
import {
  FreeTextAnswerBlock,
  ModelAnswerFold,
  PhotoAnswerBlock,
} from "src/app/admin/(dashboard)/grading/page-body/answer-pane.ui";
import { CompareWithAiFix } from "src/app/admin/(dashboard)/grading/page-body/compare-with-ai-fix";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { StudentQuestionCard } from "src/components/student-question-card.ui";
import type { AnnotationEntry } from "src/lib/annotation-service";
import type { AnswerImage } from "src/lib/answer-image-urls";
import type { StudentAnswer } from "src/lib/answer-service";
import { isMcQuestion, type Question } from "src/lib/question-service";

interface AnswerPaneProps {
  testId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  /** The question with its media URLs already minted. */
  question: Question;
  /** The student's latest answer, or undefined when there is none. */
  answer: StudentAnswer | undefined;
  /** The answer photos with minted URLs; empty unless the answer is a photo answer. */
  photos: AnswerImage[];
  annotations: AnnotationEntry[];
  /** Students can already see the correct answers. */
  correctAnswersVisible: boolean;
  /** The latest AI suggestion's fixed answer; absent when there is none. */
  aiFix?: string;
  /** The saved grade, shown under the answer once grading is done. */
  gradeLine?: string;
}

/**
 * The left pane: one question as the student saw it, her answer, and for a
 * written question a folded model answer. A blank answer shows nothing here;
 * the grade panel says so.
 */
export function AnswerPane({
  testId,
  courseId,
  studentId,
  studentName,
  question,
  answer,
  photos,
  annotations,
  correctAnswersVisible,
  aiFix,
  gradeLine,
}: AnswerPaneProps) {
  const modelAnswer =
    question.type === "free_text" ? question.referenceAnswer?.trim() : "";

  function renderAnswer() {
    if (isMcQuestion(question)) {
      return (
        <McAnswerChips
          selectedIds={answer?.type === "mc" ? answer.selectedIds : []}
          options={question.options}
          colorPicks={true}
          showMissedCorrect={false}
        />
      );
    }

    if (answer?.type === "image" && photos.length > 0) {
      return (
        <PhotoAnswerBlock>
          <AnnotationTool
            key={`${studentId}:${question.id}`}
            testId={testId}
            courseId={courseId}
            questionId={question.id}
            studentId={studentId}
            photos={photos}
            initialAnnotations={annotations}
          />
        </PhotoAnswerBlock>
      );
    }

    if (answer?.type === "free_text" && answer.text) {
      return (
        <FreeTextAnswerBlock text={answer.text}>
          {aiFix && (
            <CompareWithAiFix
              studentName={studentName}
              studentAnswer={answer.text}
              aiFix={aiFix}
            />
          )}
        </FreeTextAnswerBlock>
      );
    }

    return null;
  }

  return (
    <StudentQuestionCard question={question}>
      {renderAnswer()}
      {gradeLine && (
        <p className="text-sm font-medium" data-testid="your-grade">
          {gradeLine}
        </p>
      )}
      {modelAnswer && (
        <ModelAnswerFold
          text={modelAnswer}
          correctAnswersVisible={correctAnswersVisible}
        />
      )}
    </StudentQuestionCard>
  );
}
