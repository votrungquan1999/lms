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
import { type CreateCourseState, createCourseAction } from "./actions";

/**
 * Client component: form for admins to create a new course.
 */
export function CreateCourseForm() {
  const [state, formAction, isPending] = useActionState<
    CreateCourseState | null,
    FormData
  >(createCourseAction, null);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Course</CardTitle>
        <CardDescription>
          Add a new course to organize lessons and tests.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Course Title</Label>
            <Input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Introduction to Algorithms"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional course description"
              rows={3}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Course"}
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
