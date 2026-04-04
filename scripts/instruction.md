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
