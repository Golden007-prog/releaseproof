import { fileRules } from "./files.js";
import { manifestRules } from "./manifest.js";
import { provenanceRules } from "./provenance.js";
import { type Finding, type Rule, type RuleContext, sortFindings } from "./types.js";

/** Findings from the build planner's warnings. */
function sourceRules(context: RuleContext): Finding[] {
  return context.rebuildWarnings.map((warning) => {
    if (warning.startsWith("repository has version")) {
      return {
        id: "version-not-in-source",
        severity: "low" as const,
        title: "the source commit has a different version number",
        detail: `${warning}. Release tooling often bumps the version after the commit; the rebuilt package.json then differs in "version".`,
      };
    }
    if (warning.startsWith("no lockfile")) {
      return {
        id: "no-lockfile",
        severity: "low" as const,
        title: "the source has no lockfile",
        detail: `${warning}. Dependency versions could differ between the original build and the rebuild.`,
      };
    }
    return { id: "rebuild-note", severity: "info" as const, title: warning, detail: warning };
  });
}

export const ALL_RULES: Rule[] = [provenanceRules, manifestRules, fileRules, sourceRules];

/** Runs every rule and returns the findings, most severe first. Pure and deterministic. */
export function runRules(context: RuleContext, rules: Rule[] = ALL_RULES): Finding[] {
  return sortFindings(rules.flatMap((rule) => rule(context)));
}

export * from "./code.js";
export * from "./files.js";
export * from "./manifest.js";
export * from "./provenance.js";
export * from "./repository.js";
export * from "./types.js";
