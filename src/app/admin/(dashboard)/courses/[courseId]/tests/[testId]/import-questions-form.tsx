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
import { type ImportQuestionsState, importQuestionsAction } from "./actions";

/**
 * Client component: form for importing questions from a JSON file.
 * Expected JSON format: [{ "title": "Q1", "content": "## markdown..." }, ...]
 */
export function ImportQuestionsForm({
  testId,
  courseId,
}: {
  testId: string;
  courseId: string;
}) {
  const [state, formAction, isPending] = useActionState<
    ImportQuestionsState | null,
    FormData
  >(importQuestionsAction, null);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Import Questions from JSON</CardTitle>
        <CardDescription>
          Upload a .json file with format:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {'[{ "title": "...", "content": "..." }]'}
          </code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />

          <div className="space-y-2">
            <Label htmlFor="import-file">JSON File</Label>
            <Input
              id="import-file"
              name="file"
              type="file"
              accept=".json"
              required
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Importing…" : "Import Questions"}
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
