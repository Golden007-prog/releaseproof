/**
 * Process exit codes shared by the CLI and the GitHub Action.
 * Anything that is not a clean MATCH must be non-zero, so CI fails closed.
 */
export const ExitCode = {
  Match: 0,
  Differs: 1,
  /** Tool or environment failure, including "could not verify". */
  ToolError: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
