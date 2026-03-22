# Node: Plan

Create a focused implementation plan using research output as context.

## Input

Read the `research-output.md` artifact from the brain directory for context about the codebase.

## Execution

1. **Read the research output** to understand patterns, affected areas, and existing code.

2. **Use `@create-implementation-plan`** to create the plan. When the skill asks you to research, point it to the research output artifact instead of re-reading the codebase — the research is already done.

3. **Ensure the plan has the two key sections:**
   - **Technical Design**: Only significant decisions (new fields, API changes, strategy choices). Skip anything obvious.
   - **Behaviors to Implement**: Observable behaviors as TDD steps — not code tasks:
     - ✅ `User sees trending markets at the top`
     - ❌ `Add isTrending field to database`

4. **Write the step list** to the workflow state artifact for the TDD loop to consume.

## Output

After the plan is approved, write the step list to the `plan-steps.md` artifact:

```markdown
# Planned Steps

## Step 1: [Observable behavior]
- Status: pending

## Step 2: [Observable behavior]
- Status: pending

## Step 3: [Observable behavior]  
- Status: pending

## Quality Checkpoint (after steps 1-3)
- Status: pending

## Step 4: [Observable behavior]
- Status: pending

...
```

The implementation plan itself remains in the brain artifact directory per the `@create-implementation-plan` skill convention.
