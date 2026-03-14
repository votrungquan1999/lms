"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { type AddQuestionState, addQuestionAction } from "./actions";

/**
 * Client component: form for adding a single question with markdown content.
 * This is the main deliverable — allows pasting .md content as text.
 */
export function AddQuestionForm({
  testId,
  courseId,
}: {
  testId: string;
  courseId: string;
}) {
  const [state, formAction, isPending] = useActionState<
    AddQuestionState | null,
    FormData
  >(addQuestionAction, null);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Add Question</CardTitle>
        <CardDescription>
          Add a question with markdown content. You can paste .md content
          directly into the content field.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />

          <div className="space-y-2">
            <Label htmlFor="question-title">Question Title</Label>
            <Input
              id="question-title"
              name="title"
              type="text"
              required
              placeholder="e.g. Question 1: Arrays"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="question-content">Content (Markdown)</Label>
            <Textarea
              id="question-content"
              name="content"
              required
              placeholder="Paste your markdown content here…"
              rows={15}
              className="font-mono text-sm"
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Adding…" : "Add Question"}
          </Button>
        </form>

        {state?.success && (
          <output className="mt-4 block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message}
          </output>
        )}

        {state && !state.success && (
          <div
            className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
