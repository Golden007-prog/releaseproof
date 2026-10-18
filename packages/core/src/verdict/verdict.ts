import type { DiffResult } from "../diff/compare.js";
import type { TarballContents } from "../diff/tarball.js";
import { ExitCode } from "../exit-code.js";
import type { ReleaseArtifact } from "../fetch/types.js";
import type { ProvenanceResult } from "../provenance/types.js";
import type { RebuildResult } from "../rebuild/run.js";
import type { SourceRef } from "../rebuild/source.js";
import { runRules } from "../rules/index.js";
import { countBySeverity, type Finding, type Severity } from "../rules/types.js";

/**
 * matches-source: rebuilt from the source and byte-identical, with nothing high or critical.
 * differs-from-source: something an approver must look at before clicking Approve.
 * could-not-verify: no verdict is possible; never read this as "safe".
 */
export type VerdictStatus = "matches-source" | "differs-from-source" | "could-not-verify";

export interface Verdict {
  status: VerdictStatus;
  exitCode: ExitCode;
  /** One line for humans. */
  summary: string;
  /** Why the status is what it is, in order of importance. */
  reasons: string[];
  findings: Finding[];
  counts: Record<Severity, number>;
}

export interface VerdictInput {
  artifact: Pick<ReleaseArtifact, "name" | "version" | "origin" | "hints">;
  provenance: ProvenanceResult;
  /** The source used for the rebuild: certified by provenance, or named by the user. */
  source: SourceRef | undefined;
  rebuild: RebuildResult | undefined;
  release: TarballContents;
  rebuilt: TarballContents | undefined;
  diff: DiffResult | undefined;
  expectations: { repository?: string | undefined };
}

const BLOCKING: Severity[] = ["critical", "high"];

function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

function describeSource(source: SourceRef): string {
  const repo = source.repository.replace(/^https:\/\/github\.com\//, "");
  return `${repo}@${shortCommit(source.commit)}${source.verified ? "" : " (named by you, not certified by provenance)"}`;
}

/** Decides the verdict. Pure: the same inputs always give the same answer. */
export function buildVerdict(input: VerdictInput): Verdict {
  const { artifact, provenance, source, rebuild, release, rebuilt, diff } = input;
  const findings = runRules({
    name: artifact.name,
    version: artifact.version,
    origin: artifact.origin.kind,
    manifestRepository: artifact.hints.repository,
    release,
    rebuild: rebuilt,
    diff,
    provenance,
    expectations: input.expectations,
    rebuildWarnings: rebuild?.plan?.warnings ?? [],
  });
  const counts = countBySeverity(findings);
  const blocking = findings.filter((finding) => BLOCKING.includes(finding.severity));
  const reasons: string[] = [];

  // Anything that makes a verdict impossible comes first; it is never "safe".
  if (release.entries.size === 0) {
    reasons.push(`the release tarball could not be read: ${release.problems.join("; ")}`);
  }
  if (!source) {
    reasons.push(
      `no source to rebuild from: provenance is ${provenance.status}${provenance.problems.length > 0 ? ` (${provenance.problems.join("; ")})` : ""} and no --repo/--commit was given`,
    );
  } else if (rebuild?.status !== "ok") {
    reasons.push(`the rebuild failed: ${rebuild?.failure ?? "no rebuild result"}`);
  } else if (!rebuilt || !diff) {
    reasons.push("the rebuilt tarball could not be compared");
  } else if (rebuilt.problems.length > 0) {
    reasons.push(`the rebuilt tarball could not be read cleanly: ${rebuilt.problems.join("; ")}`);
  }
  if (reasons.length > 0) {
    const summary = `COULD NOT VERIFY: ${reasons[0]}`;
    if (blocking.length > 0) {
      reasons.push(
        `${blocking.length} finding(s) need attention regardless: ${blocking.map((f) => f.id).join(", ")}`,
      );
    }
    return {
      status: "could-not-verify",
      exitCode: ExitCode.ToolError,
      summary,
      reasons,
      findings,
      counts,
    };
  }

  // From here on source, rebuild and diff are all present.
  const sourceText = source ? describeSource(source) : "the source";
  if (diff && !diff.matches) {
    const parts = [
      diff.changed.length > 0 ? `${diff.changed.length} changed` : "",
      diff.onlyInRelease.length > 0 ? `${diff.onlyInRelease.length} only in the release` : "",
      diff.onlyInRebuild.length > 0 ? `${diff.onlyInRebuild.length} only in the rebuild` : "",
      diff.problems.release.length > 0 ? "suspicious tarball entries" : "",
    ].filter((part) => part !== "");
    reasons.push(`files differ from a clean build of ${sourceText}: ${parts.join(", ")}`);
  }
  if (blocking.length > 0) {
    reasons.push(
      `${counts.critical} critical and ${counts.high} high finding(s): ${[...new Set(blocking.map((f) => f.id))].join(", ")}`,
    );
  }
  if (reasons.length > 0) {
    return {
      status: "differs-from-source",
      exitCode: ExitCode.Differs,
      summary: `DIFFERS FROM SOURCE: ${reasons[0]}`,
      reasons,
      findings,
      counts,
    };
  }

  const fileCount = diff?.identical.length ?? 0;
  const notes = counts.medium + counts.low + counts.info;
  reasons.push(`${fileCount} files identical to a clean build of ${sourceText}`);
  if (notes > 0) {
    reasons.push(`${notes} lower-severity note(s) to read`);
  }
  return {
    status: "matches-source",
    exitCode: ExitCode.Match,
    summary: `MATCHES SOURCE: ${reasons[0]}`,
    reasons,
    findings,
    counts,
  };
}
