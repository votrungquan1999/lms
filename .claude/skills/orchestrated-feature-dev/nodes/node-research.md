# Node: Research

Focused context-gathering phase. Read the codebase to understand patterns, architecture, and affected areas.

## Input

Read the user's feature request from the conversation context.

## Execution

1. **Identify the feature area** — what part of the codebase is affected?

2. **Read broadly first:**
   - Entry points and main files for the affected area
   - Related tests to understand existing behavior
   - Types, interfaces, and data models
   - Configuration files if relevant

3. **Read deeply second:**
   - Implementation details in the core affected files
   - Patterns used in similar features (if any exist)
   - Utility functions and shared helpers that might be reused

4. **Research the standard approach:**
   - Use `@web-search` to find the standard/best/recommended way to implement this type of feature
   - Look for established patterns, common pitfalls, and industry best practices
   - Compare what you find externally with the patterns already in the codebase

5. When researching external libraries or APIs, use `@context7` for documentation queries and `@web-search` for broader research.

6. **Count what you read** — track the number of files examined.

## Output

Write findings to `RESEARCH_OUTPUT.md` in the project root:

```markdown
# Research Output

## Files Read: [count]

## Feature Area
[Brief description of what area of the codebase is affected]

## Key Patterns Found
- [Pattern 1]: [Where it's used and how]
- [Pattern 2]: [Where it's used and how]

## Existing Related Code
- [File/function]: [What it does and how it relates]

## Affected Areas
- [Area 1]: [How it's affected]
- [Area 2]: [How it's affected]

## Testing Patterns
- [How tests are organized in this part of the codebase]
- [Testing utilities available]

## Unknowns / Questions
- [Anything unclear that needs user input]
```

**CRITICAL:** After writing the output, you MUST PAUSE execution. Ask the user if the research is sufficient and wait for their explicit command to "continue with implementation plan" or "continue" before moving to the next node. Answer any questions the user has about the research during this pause.
