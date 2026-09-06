"use client";

import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useImportAi } from "./import-ai-form.state";

/** Human-readable label for each question type the AI can identify. */
const TYPE_LABELS: Record<string, string> = {
  free_text: "Free response",
  single_select: "Multiple choice (one answer)",
  multi_select: "Multiple choice (multiple answers)",
};

/**
 * File picker for the document to import; shows an error if unusable.
 */
export function ImportAiFilePicker(): React.ReactNode {
  const { selectFile, error, isBusy } = useImportAi();

  return (
    <div className="space-y-3">
      <Label htmlFor="import-ai-file">Document (.docx or .pdf)</Label>
      <Input
        id="import-ai-file"
        type="file"
        accept=".docx,.pdf"
        disabled={isBusy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) selectFile(file);
        }}
      />
      {error && (
        <div
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the reviewable list of questions parsed from the uploaded document.
 */
export function QuestionPreviewList(): React.ReactNode {
  const { questions } = useImportAi();

  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">
        {questions.length} question{questions.length === 1 ? "" : "s"} found
      </h2>
      {questions.map((question, index) => (
        <Card key={question.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">#{index + 1}</span>
                <span>{question.title}</span>
              </span>
              <Badge variant="outline">{TYPE_LABELS[question.type]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">{question.content}</p>
            {question.options && (
              <ul className="space-y-1 text-sm">
                {question.options.map((option) => (
                  <li key={option.text} className="flex items-center gap-2">
                    <span>{option.isCorrect ? "✓" : "○"}</span>
                    <span>{option.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
