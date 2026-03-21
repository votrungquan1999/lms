# Node: Summary

Generate a final summary of the entire orchestrated workflow execution.

## Input

Read all workflow state artifacts from the brain directory:
- `research-output.md`
- `plan-steps.md`
- `loop-state.json`
- `quality-result.md` (if exists)
- `step-result.md` (latest)

## Execution

1. **Count completed steps** from `plan-steps.md` (all with status `done`)
2. **Gather quality gate results** from all quality checkpoints
3. **List all files changed** across all steps
4. **Run the full test suite** one final time to confirm everything passes
5. **Run linting** to check for any remaining issues

## Output

Present to the user:

```markdown
# Feature Development Complete

## Summary
[One-paragraph description of what was built]

## Steps Completed: [X/Y]
| Step | Behavior | Result |
|------|----------|--------|
| 1 | [behavior] | ✅ done |
| 2 | [behavior] | ✅ done (already covered) |
| ... | ... | ... |

## Quality Gates: [X] checkpoints passed
- Checkpoint 1 (after steps 1-3): [pass/fixed N issues]
- Checkpoint 2 (after steps 4-6): [pass/fixed N issues]

## Test Results
- Total tests: [count]
- All passing: [yes/no]

## Files Changed
- [file1]: [brief description]
- [file2]: [brief description]

## Notes
- [Any caveats, follow-ups, or things to watch out for]
```

No cleanup needed — artifacts are managed by the Antigravity platform and persist with the conversation.
