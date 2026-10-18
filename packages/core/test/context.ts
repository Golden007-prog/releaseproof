import { compareTarballs } from "../src/diff/compare.js";
import { readTarball, type TarballContents } from "../src/diff/tarball.js";
import type { ProvenanceResult } from "../src/provenance/types.js";
import type { RuleContext } from "../src/rules/types.js";
import { packFixture } from "./tarballs.js";

export const FIXTURE_REPOSITORY = "https://github.com/ujjwalv01/releaseproof";

/** A clean, verified provenance for the fixture package. */
export function verifiedProvenance(overrides: Partial<ProvenanceResult> = {}): ProvenanceResult {
  return {
    status: "verified",
    problems: [],
    warnings: [],
    mismatches: [],
    publishAttestation: { status: "verified", keyid: "SHA256:test" },
    source: {
      repository: FIXTURE_REPOSITORY,
      commit: "a".repeat(40),
      ref: "refs/tags/v1.0.0",
      workflowPath: ".github/workflows/release.yml",
      workflowRef: "refs/tags/v1.0.0",
      trigger: "push",
      runnerEnvironment: "github-hosted",
    },
    ...overrides,
  };
}

export function ruleContext(
  release: TarballContents,
  rebuild: TarballContents | undefined,
  overrides: Partial<RuleContext> = {},
): RuleContext {
  return {
    name: "@releaseproof/fixture",
    version: "1.0.0",
    origin: "published",
    manifestRepository: undefined,
    release,
    rebuild,
    diff: rebuild ? compareTarballs(release, rebuild) : undefined,
    provenance: verifiedProvenance(),
    expectations: {},
    rebuildWarnings: [],
    ...overrides,
  };
}

/** Context where `release` is the named fixture and the rebuild is the clean one; `null` = no rebuild. */
export async function fixtureContext(
  release: string,
  rebuild: string | null = "clean",
  overrides: Partial<RuleContext> = {},
): Promise<RuleContext> {
  const releaseTarball = readTarball(await packFixture(release));
  const rebuildTarball = rebuild ? readTarball(await packFixture(rebuild)) : undefined;
  return ruleContext(releaseTarball, rebuildTarball, overrides);
}
