/**
 * Shared argv parsing for scripts, split into its own file (no top-level
 * side effect) so it can be unit-tested directly — every script file itself
 * runs `main()` at import time.
 */

/** Reads a `--flag value` pair from argv; undefined when the flag is absent. */
export function getArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}
