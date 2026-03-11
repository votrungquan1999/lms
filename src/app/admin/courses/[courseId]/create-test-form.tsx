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
import { type CreateTestState, createTestAction } from "./actions";

/**
 * Client component: form for admins to create a test within a course.
 */
export function CreateTestForm({ courseId }: { courseId: string }) {
  const [state, formAction, isPending] = useActionState<
    CreateTestState | null,
    FormData
  >(createTestAction, null);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Create Test</CardTitle>
        <CardDescription>Add a new test to this course.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="courseId" value={courseId} />

          <div className="space-y-2">
            <Label htmlFor="test-title">Test Title</Label>
            <Input
              id="test-title"
              name="title"
              type="text"
              required
              placeholder="e.g. Midterm Exam"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-description">Description</Label>
            <Textarea
              id="test-description"
              name="description"
              placeholder="Optional test description"
              rows={3}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Test"}
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
