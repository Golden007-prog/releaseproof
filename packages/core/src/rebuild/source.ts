import { ToolError } from "../errors.js";
import type { ProvenanceResult } from "../provenance/types.js";

/** Where to rebuild from. `verified` is true only when it came from verified provenance. */
export interface SourceRef {
  /** `https://github.com/<owner>/<repo>`, no `.git` suffix. */
  repository: string;
  /** Full 40-hex commit SHA. */
  commit: string;
  ref?: string | undefined;
  /** Path of the release workflow inside the repository, when known. */
  workflowPath?: string | undefined;
  verified: boolean;
}

// GitHub owner: alphanumerics and hyphens; repo: alphanumerics, "-", "_", ".".
const GITHUB_REPOSITORY_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;

/**
 * Validates a source reference before anything is passed to git or a shell. Only GitHub
 * is accepted in v1 (the only provenance issuer we verify).
 */
export function validateSource(input: {
  repository: string;
  commit: string;
  ref?: string | undefined;
  workflowPath?: string | undefined;
  verified: boolean;
}): SourceRef {
  const repository = input.repository.replace(/\/+$/, "").replace(/\.git$/, "");
  const match = GITHUB_REPOSITORY_RE.exec(repository);
  if (!match || repository.includes("..")) {
    throw new ToolError(
      `Repository must look like https://github.com/<owner>/<repo>, got "${input.repository}"`,
    );
  }
  const commit = input.commit.toLowerCase();
  if (!COMMIT_RE.test(commit)) {
    throw new ToolError(`Commit must be a full 40-character SHA, got "${input.commit}"`);
  }
  if (input.workflowPath !== undefined) {
    const p = input.workflowPath;
    if (p.startsWith("/") || p.split("/").includes("..") || p.includes("\0")) {
      throw new ToolError(`Workflow path must be relative to the repository, got "${p}"`);
    }
  }
  return {
    repository,
    commit,
    ref: input.ref,
    workflowPath: input.workflowPath,
    verified: input.verified,
  };
}

/** The source a verified provenance vouches for, or undefined when there is none. */
export function sourceFromProvenance(provenance: ProvenanceResult): SourceRef | undefined {
  if (provenance.status !== "verified" || !provenance.source) {
    return undefined;
  }
  const { repository, commit, ref, workflowPath } = provenance.source;
  return validateSource({ repository, commit, ref, workflowPath, verified: true });
}
