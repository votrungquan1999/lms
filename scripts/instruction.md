# Programmatic Test Creation Instructions

This file instructs developers or AI agents on how to structurally generate Typescript data files to programmatically insert LMS queries directly into MongoDB.

Use this infrastructure when you need to load complex exams or populate hundreds of tests rapidly, bypassing standard Admin UI or API barriers.

## 1. Prerequisites
You will need a valid `courseId` from the database.
You can find an existing course ID by connecting to the MongoDB instance or by inspecting the UI routes (e.g., `/admin/courses/[courseId]`).

## 2. Type Interfaces

External agents MUST construct their data objects to conform to these exact TypeScript structures. (You do not need to import these types if generating the file outside the repository, simply ensure the final JSON/object matches this structure).

```typescript
type McGradingStrategy = "all_or_nothing" | "partial";

interface McOption {
  text: string;
  isCorrect: boolean;
}

interface BaseQuestion {
  title: string;
  content: string;
  weight?: number; // Optional, defaults to 1
}

interface FreeTextQuestion extends BaseQuestion {
  type?: "free_text";
}

interface SingleSelectQuestion extends BaseQuestion {
  type: "single_select";
  options: McOption[];
  mcGradingStrategy?: McGradingStrategy;
}

interface MultiSelectQuestion extends BaseQuestion {
  type: "multi_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy; // Required for multi_select
}

type QuestionDefinition =
  | FreeTextQuestion
  | SingleSelectQuestion
  | MultiSelectQuestion;

export interface TestDefinition {
  /** ID of the existing course to create the test in. */
  courseId: string;
  
  /** Test metadata. */
  test: {
    title: string;
    description: string;
    showCorrectAnswerAfterSubmit?: boolean;
    showGradeAfterSubmit?: boolean;
  };
  
  /** Ordered list of questions to create in the test. */
  questions: QuestionDefinition[];
}
```

## 3. File Format Setup
All data files should end in `.ts` and belong within the `scripts/data/` directory (or be piped into the LMS repository).
The file must `export default` an object strictly satisfying the structure above.

### Example Template (`scripts/data/demo-test.ts`):
```typescript
export default {
  // 1. Course ID
  courseId: "PLACEHOLDER_COURSE_ID", 

  // 2. Test metadata
  test: {
    title: "Sample Exam",
    description: "Please complete all questions.",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
  },

  // 3. Questions array
  questions: [
    // Free Text Question
    {
      type: "free_text",         // Optional, defaults to "free_text"
      title: "Self Reflection",
      content: "Explain your thought process.",
      weight: 10,                // Optional, defaults to 1
    },
    
    // Single Select Question
    {
      type: "single_select",     // Required
      title: "Multiple Choice 1",
      content: "Which of the following is true?",
      options: [
        { text: "Option A", isCorrect: true },
        { text: "Option B", isCorrect: false }
      ],
      // mcGradingStrategy is Optional 
      weight: 5,
    },
    
    // Multi Select Question
    {
      type: "multi_select",      // Required
      title: "Select All That Apply",
      content: "Check all correct boxes.",
      options: [
        { text: "Correct 1", isCorrect: true },
        { text: "Correct 2", isCorrect: true },
        { text: "Incorrect", isCorrect: false }
      ],
      mcGradingStrategy: "partial", // Required ("partial" | "all_or_nothing")
      weight: 15,
    }
  ]
};
```

## Multi-Tenant Backfill Runbook

This section is unrelated to the test-creation tooling above — it covers deploying the multi-tenant (schools) feature and running `scripts/backfill-schools.ts`, the one-off script that moves existing pre-multi-tenant data and admins into a `default` school.

### Deploy order (hard precondition)

1. **Before the branch is pushed:** run `scripts/backfill-schools.ts` as a dry run, then with `--apply`, against production. Vercel preview deployments of this branch use the production database (`MONGODB_URI` targets both production and preview), so pushing the branch is a production deploy as far as data is concerned.
2. **Right after the production promote:** run `--apply` again. It catches records the old build wrote in the window between the first apply and the promote.
3. **No second school and no new school admins until the deploy is verified.**
4. **Before creating a second school, delete or protect every older Vercel deployment.** An older preview or the previous production build stays live on its own URL against the production database and ignores schools entirely — a student signing in there reaches every school's tests. Use deployment deletion or Vercel deployment protection.
5. **Once a second school exists, a rerun no longer guesses.** Unassigned courses, students and pools are reported and left unassigned; tests, join requests and pool questions still take their parent's school.
6. **No rollback once a second school exists.** A pre-multi-tenant build ignores schools, so every admin would see every school's data. Any fix goes forward, never back.
7. **The branch merges as one unit.** Intermediate commits are not deployable: from the point admins without a membership are locked out onward, only the finished branch is safe to run.
8. **After deploy, never use an older checkout's `scripts/create-test.ts`.** It writes tests with no school, which no school can see.
9. **If the new build boots before the first apply,** what happens depends on duplicates. With no duplicate usernames or sign-in accounts, every admin sees the "not part of any school yet" page and all data is hidden — the intended fail-closed behavior, not a bug. **With duplicates, every request fails** until they are resolved: the new build cannot create its unique username and sign-in-account indexes, and retries (and fails) on each request. The dry run lists them (item 10); resolve them before any boot.
10. **Duplicates block the apply.** The dry run lists duplicate usernames and duplicate sign-in accounts (with each row's id, sign-in account, created date and enrollment count); `--apply` stops before writing anything while any exist. See the recovery steps in `backfill-schools.ts`'s own JSDoc.
11. **Never run this script, not even a dry run, against production from an agent session.** A human operator runs it by hand, following this runbook.
12. **Cross-school enrollments are listed, never changed.** The dry run and `--apply` list every enrollment whose course and student are in different schools, by enrollment id. The app already hides such a row from both schools; whether to delete it is a manual decision.

### Local databases

Run against a local database the same way, with an explicit `MONGODB_URI` (never rely on Bun's `.env.local` autoload):

```
MONGODB_URI=mongodb://localhost:27017/lms_visual bun scripts/backfill-schools.ts --apply
MONGODB_URI=mongodb://localhost:27017/lms bun scripts/backfill-schools.ts --apply
```

An agent session must never run either of these — or any `bun scripts/*.ts` invocation — from the worktree root, since Bun auto-loads `.env.local` (production Atlas). Scripts are exercised only through the Vitest subprocess harness in `scripts/__tests__`, which sets an explicit `mongodb://localhost:27017/<test-db>`.
