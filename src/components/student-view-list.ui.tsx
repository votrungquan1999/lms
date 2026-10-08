"use client";

import { useState } from "react";
import {
  FreeTextAnswerControl,
  ImageAnswerControl,
  McAnswerControls,
  type PickedPhoto,
} from "src/components/student-answer-controls.ui";
import {
  type StudentCardQuestion,
  StudentQuestionCard,
} from "src/components/student-question-card.ui";
import { validateAnswerPhotos } from "src/lib/answer-photo-validation";

/**
 * Every question as a student sees it, each with answer controls to try.
 * Nothing is saved: picks live in local state only and there is no submit.
 * Cards show each question's own `order` as its number.
 * Reproduces the student test page's box and padding, so content wraps the same.
 * @param questions - The questions to show, in display order.
 */
export function StudentViewList({
  questions,
}: {
  questions: StudentCardQuestion[];
}) {
  return (
    // -mx-6 cancels the host page's own p-6, so the inner box matches the student page exactly
    <section aria-label="Student view" className="-mx-6">
      <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
        {questions.map((question) => (
          <StudentQuestionCard key={question.id} question={question}>
            <TryAnswerControls question={question} />
          </StudentQuestionCard>
        ))}
      </div>
    </section>
  );
}

/** The question's answer control, backed by throwaway local state. */
function TryAnswerControls({ question }: { question: StudentCardQuestion }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  if (question.type === "single_select" || question.type === "multi_select") {
    return (
      <McAnswerControls
        questionId={question.id}
        type={question.type}
        options={question.options}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />
    );
  }

  if (question.type === "image_answer") {
    return (
      <ImageAnswerControl
        questionId={question.id}
        photos={photos}
        error={photoError}
        onAddFiles={(files) => {
          const { accepted, error } = validateAnswerPhotos(
            files,
            photos.length,
          );
          setPhotos((prev) => [
            ...prev,
            ...accepted.map((file) => ({
              id: crypto.randomUUID(),
              name: file.name,
            })),
          ]);
          setPhotoError(error);
        }}
        onRemoveFile={(id) => {
          setPhotos((prev) => prev.filter((photo) => photo.id !== id));
          setPhotoError(null);
        }}
      />
    );
  }

  return <FreeTextAnswerControl />;
}
