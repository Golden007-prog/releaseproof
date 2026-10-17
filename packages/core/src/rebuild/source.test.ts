import { describe, expect, it } from "vitest";
import { ToolError } from "../errors.js";
import type { ProvenanceResult } from "../provenance/types.js";
import { sourceFromProvenance, validateSource } from "./source.js";

const commit = "7d2900eca1c22b3f87c13987c8d4b7c9a29b733a";

describe("validateSource", () => {
  it("accepts a GitHub repository and normalizes .git and trailing slashes", () => {
    expect(
      validateSource({
        repository: "https://github.com/sigstore/sigstore-js.git/",
        commit: commit.toUpperCase(),
        verified: true,
      }),
    ).toEqual({
      repository: "https://github.com/sigstore/sigstore-js",
      commit,
      ref: undefined,
      workflowPath: undefined,
      verified: true,
    });
  });

  it.each([
    "https://gitlab.com/o/r",
    "http://github.com/o/r",
    "https://github.com/o",
    "https://github.com/o/r/extra",
    "https://github.com/o/r;rm -rf /",
    "https://github.com/-bad/r",
    "https://github.com/o/..",
    "git@github.com:o/r.git",
  ])("rejects repository %s", (repository) => {
    expect(() => validateSource({ repository, commit, verified: false })).toThrow(ToolError);
  });

  it.each(["main", "7d2900e", `${commit}0`, "7d2900eca1c22b3f87c13987c8d4b7c9a29b733g"])(
    "rejects commit %s",
    (bad) => {
      expect(() =>
        validateSource({ repository: "https://github.com/o/r", commit: bad, verified: false }),
      ).toThrow(/full 40-character SHA/);
    },
  );

  it("rejects workflow paths that leave the repository", () => {
    for (const workflowPath of ["/etc/passwd", "../x.yml", ".github/../../x"]) {
      expect(() =>
        validateSource({
          repository: "https://github.com/o/r",
          commit,
          workflowPath,
          verified: false,
        }),
      ).toThrow(/relative to the repository/);
    }
  });
});

describe("sourceFromProvenance", () => {
  const base: ProvenanceResult = {
    status: "verified",
    problems: [],
    warnings: [],
    mismatches: [],
    publishAttestation: { status: "missing" },
    source: {
      repository: "https://github.com/sigstore/sigstore-js",
      commit,
      ref: "refs/heads/main",
      workflowPath: ".github/workflows/release.yml",
    },
  };

  it("uses the certified source when the provenance is verified", () => {
    expect(sourceFromProvenance(base)).toEqual({
      repository: "https://github.com/sigstore/sigstore-js",
      commit,
      ref: "refs/heads/main",
      workflowPath: ".github/workflows/release.yml",
      verified: true,
    });
  });

  it("returns nothing for missing, invalid or unsupported provenance", () => {
    for (const status of ["missing", "invalid", "unsupported"] as const) {
      expect(sourceFromProvenance({ ...base, status })).toBeUndefined();
    }
  });
});
