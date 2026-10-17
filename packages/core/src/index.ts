/**
 * Process exit codes shared by the CLI and the GitHub Action.
 * Anything that is not a clean MATCH must be non-zero, so CI fails closed.
 */
export const ExitCode = {
  Match: 0,
  Differs: 1,
  ToolError: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export * from "./errors.js";
export * from "./fetch/digests.js";
export * from "./fetch/published.js";
export * from "./fetch/staged.js";
export * from "./fetch/types.js";
export * from "./provenance/certificate.js";
export * from "./provenance/der.js";
export * from "./provenance/keys.js";
export * from "./provenance/predicate.js";
export * from "./provenance/types.js";
export * from "./provenance/verify.js";
export * from "./registry/auth.js";
export * from "./registry/client.js";
export * from "./registry/spec.js";
