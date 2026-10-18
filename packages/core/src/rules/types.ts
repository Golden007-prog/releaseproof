import type { DiffResult } from "../diff/compare.js";
import type { TarballContents } from "../diff/tarball.js";
import type { ProvenanceResult } from "../provenance/types.js";

/**
 * critical: an attack signature on its own.
 * high: a strong indicator that must be explained before approving.
 * medium: needs a look.
 * low / info: context that does not block anything.
 */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface Finding {
  /** Stable kebab-case rule id, e.g. `install-script-added`. */
  id: string;
  severity: Severity;
  title: string;
  /** Plain-English explanation of what was seen and why it matters. */
  detail: string;
  /** Package paths involved, when the finding is about files. */
  paths?: string[] | undefined;
  /** Structured details for JSON output (patches, old/new values…). */
  evidence?: Record<string, unknown> | undefined;
}

export interface RuleContext {
  name: string;
  version: string;
  origin: "published" | "staged";
  /** The unsigned `repository` field from the manifest, when present. */
  manifestRepository: string | undefined;
  release: TarballContents;
  /** Undefined when there was no rebuild (no source, or the rebuild failed). */
  rebuild: TarballContents | undefined;
  diff: DiffResult | undefined;
  provenance: ProvenanceResult;
  /** What the user said to expect, e.g. `--repo`. */
  expectations: { repository?: string | undefined };
  /** Warnings from the build planner (version mismatch, no lockfile…). */
  rebuildWarnings: string[];
}

export type Rule = (context: RuleContext) => Finding[];

/** Most severe first, then by id, then by first path: deterministic output. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) {
      return bySeverity;
    }
    const byId = a.id.localeCompare(b.id);
    if (byId !== 0) {
      return byId;
    }
    return (a.paths?.[0] ?? "").localeCompare(b.paths?.[0] ?? "");
  });
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}
