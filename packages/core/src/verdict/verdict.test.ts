import { describe, expect, it } from "vitest";
import { FIXTURE_REPOSITORY, verifiedProvenance } from "../../test/context.js";
import { packFixture } from "../../test/tarballs.js";
import { compareTarballs } from "../diff/compare.js";
import { readTarball } from "../diff/tarball.js";
import type { RebuildResult } from "../rebuild/run.js";
import type { SourceRef } from "../rebuild/source.js";
import { buildVerdict, type VerdictInput } from "./verdict.js";

const source: SourceRef = {
  repository: FIXTURE_REPOSITORY,
  commit: "a".repeat(40),
  verified: true,
};
const artifact = {
  name: "@releaseproof/fixture",
  version: "1.0.0",
  origin: { kind: "published" as const, registry: "https://registry.npmjs.org/" },
  hints: {},
};

function okRebuild(overrides: Partial<RebuildResult> = {}): RebuildResult {
  return { status: "ok", source, stages: [], volume: "v", ...overrides };
}

async function inputFor(
  release: string,
  rebuilt: string | null,
  overrides: Partial<VerdictInput> = {},
): Promise<VerdictInput> {
  const releaseTarball = readTarball(await packFixture(release));
  const rebuiltTarball = rebuilt ? readTarball(await packFixture(rebuilt)) : undefined;
  return {
    artifact,
    provenance: verifiedProvenance(),
    source,
    rebuild: rebuilt ? okRebuild() : undefined,
    release: releaseTarball,
    rebuilt: rebuiltTarball,
    diff: rebuiltTarball ? compareTarballs(releaseTarball, rebuiltTarball) : undefined,
    expectations: {},
    ...overrides,
  };
}

describe("buildVerdict", () => {
  it("matches when the rebuild is identical and nothing is high or critical", async () => {
    const verdict = buildVerdict(await inputFor("clean", "clean"));
    expect(verdict.status).toBe("matches-source");
    expect(verdict.exitCode).toBe(0);
    expect(verdict.summary).toBe(
      "MATCHES SOURCE: 5 files identical to a clean build of ujjwalv01/releaseproof@aaaaaaa",
    );
    expect(verdict.findings).toEqual([]);
  });

  it("differs when files differ, with the findings explaining why", async () => {
    const verdict = buildVerdict(await inputFor("attacked-postinstall", "clean"));
    expect(verdict.status).toBe("differs-from-source");
    expect(verdict.exitCode).toBe(1);
    expect(verdict.summary).toMatch(
      /^DIFFERS FROM SOURCE: files differ from a clean build of ujjwalv01\/releaseproof@aaaaaaa: 1 changed, 1 only in the release/,
    );
    expect(verdict.reasons[1]).toMatch(
      /1 critical and 1 high finding\(s\): install-script-added, file-added/,
    );
    expect(verdict.counts).toMatchObject({ critical: 1, high: 1 });
  });

  it("differs on a blocking finding even when every file matches", async () => {
    const provenance = verifiedProvenance({
      mismatches: [{ field: "commit", certificate: "a".repeat(40), predicate: "0".repeat(40) }],
    });
    const verdict = buildVerdict(await inputFor("clean", "clean", { provenance }));
    expect(verdict.status).toBe("differs-from-source");
    expect(verdict.summary).toBe(
      "DIFFERS FROM SOURCE: 1 critical and 0 high finding(s): provenance-claim-mismatch",
    );
  });

  it("cannot verify without a source, and says what provenance said", async () => {
    const provenance = verifiedProvenance({
      status: "missing",
      problems: ["no attestations"],
      source: undefined,
    });
    const verdict = buildVerdict(
      await inputFor("attacked-postinstall", null, { provenance, source: undefined }),
    );
    expect(verdict.status).toBe("could-not-verify");
    expect(verdict.exitCode).toBe(2);
    expect(verdict.summary).toBe(
      "COULD NOT VERIFY: no source to rebuild from: provenance is missing (no attestations) and no --repo/--commit was given",
    );
    // Findings that need attention regardless are still listed.
    expect(verdict.findings.map((f) => f.id)).toEqual([
      "install-script-present",
      "provenance-missing",
    ]);
  });

  it("cannot verify when the rebuild failed or the release is unreadable", async () => {
    const failed = buildVerdict(
      await inputFor("clean", null, {
        rebuild: okRebuild({ status: "failed", failure: "install stage exited with code 1" }),
      }),
    );
    expect(failed.status).toBe("could-not-verify");
    expect(failed.summary).toBe(
      "COULD NOT VERIFY: the rebuild failed: install stage exited with code 1",
    );

    const garbage = buildVerdict({
      ...(await inputFor("clean", "clean")),
      release: readTarball(Buffer.from("not a tarball")),
    });
    expect(garbage.status).toBe("could-not-verify");
    expect(garbage.summary).toMatch(/^COULD NOT VERIFY: the release tarball could not be read/);
  });

  it("matches from a user-named source but says it was not certified", async () => {
    const provenance = verifiedProvenance({
      status: "missing",
      problems: ["no attestations"],
      source: undefined,
    });
    const named: SourceRef = { ...source, verified: false };
    const verdict = buildVerdict(
      await inputFor("clean", "clean", {
        provenance,
        source: named,
        rebuild: okRebuild({ source: named }),
      }),
    );
    expect(verdict.status).toBe("matches-source");
    expect(verdict.summary).toBe(
      "MATCHES SOURCE: 5 files identical to a clean build of ujjwalv01/releaseproof@aaaaaaa (named by you, not certified by provenance)",
    );
    expect(verdict.reasons).toContain("1 lower-severity note(s) to read");
    expect(verdict.findings.map((f) => `${f.severity}:${f.id}`)).toEqual([
      "medium:provenance-missing",
    ]);
  });
});
