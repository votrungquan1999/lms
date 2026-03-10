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
import { type CreateStudentState, createStudentAction } from "./actions";

/**
 * Client component: form for admins to create student accounts.
 * Uses useActionState to manage form submission + feedback.
 */
export function CreateStudentForm() {
  const [state, formAction, isPending] = useActionState<
    CreateStudentState | null,
    FormData
  >(createStudentAction, null);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Student Account</CardTitle>
        <CardDescription>
          Add a new student with username and password credentials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Alice Nguyen"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              required
              placeholder="e.g. alice"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Student"}
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
