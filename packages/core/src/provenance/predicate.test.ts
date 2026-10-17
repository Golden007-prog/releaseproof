import { describe, expect, it } from "vitest";
import { SIGSTORE_5, sigstoreAttestations, withEditedProvenance } from "../../test/fixtures.js";
import {
  AttestationFormatError,
  checkSubject,
  decodeStatement,
  GITHUB_WORKFLOW_BUILD_TYPE,
  type InTotoStatement,
  NPM_PUBLISH_ATTESTATION_V01,
  parseGithubPredicate,
  SLSA_PROVENANCE_V1,
} from "./predicate.js";

function provenanceBundle(attestations = sigstoreAttestations()) {
  const entry = attestations.attestations.find((a) => a.predicateType === SLSA_PROVENANCE_V1);
  if (!entry) {
    throw new Error("fixture has no provenance");
  }
  return entry.bundle;
}

describe("decodeStatement", () => {
  it("decodes the real provenance statement", () => {
    const statement = decodeStatement(provenanceBundle());
    expect(statement._type).toBe("https://in-toto.io/Statement/v1");
    expect(statement.predicateType).toBe(SLSA_PROVENANCE_V1);
    expect(statement.subject).toEqual([
      { name: SIGSTORE_5.purl, digest: { sha512: SIGSTORE_5.sha512Hex } },
    ]);
  });

  it("decodes the real publish attestation statement", () => {
    const entry = sigstoreAttestations().attestations.find(
      (a) => a.predicateType === NPM_PUBLISH_ATTESTATION_V01,
    );
    const statement = decodeStatement(entry?.bundle ?? {});
    expect(statement._type).toBe("https://in-toto.io/Statement/v0.1");
    expect(statement.predicate).toEqual({
      name: "sigstore",
      version: "5.0.0",
      registry: "https://registry.npmjs.org",
    });
  });

  it.each([
    ["no envelope", {}],
    ["wrong payloadType", { dsseEnvelope: { payloadType: "text/plain", payload: "e30=" } }],
    [
      "payload not JSON",
      { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: "bm9wZQ==" } },
    ],
    [
      "payload not a statement",
      {
        dsseEnvelope: {
          payloadType: "application/vnd.in-toto+json",
          payload: Buffer.from('{"a":1}').toString("base64"),
        },
      },
    ],
    [
      "subject digest not strings",
      {
        dsseEnvelope: {
          payloadType: "application/vnd.in-toto+json",
          payload: Buffer.from(
            JSON.stringify({
              _type: "t",
              predicateType: "p",
              predicate: {},
              subject: [{ name: "n", digest: { sha512: 1 } }],
            }),
          ).toString("base64"),
        },
      },
    ],
  ])("throws AttestationFormatError for %s", (_name, bundle) => {
    expect(() => decodeStatement(bundle)).toThrow(AttestationFormatError);
  });
});

describe("checkSubject", () => {
  const statement = decodeStatement(provenanceBundle());

  it("accepts the matching purl and digest (case-insensitively)", () => {
    expect(
      checkSubject(statement, { purl: SIGSTORE_5.purl, sha512Hex: SIGSTORE_5.sha512Hex }),
    ).toBeUndefined();
    expect(
      checkSubject(statement, {
        purl: SIGSTORE_5.purl,
        sha512Hex: SIGSTORE_5.sha512Hex.toUpperCase(),
      }),
    ).toBeUndefined();
  });

  it("rejects another package, another digest, or several subjects", () => {
    expect(
      checkSubject(statement, { purl: "pkg:npm/evil@5.0.0", sha512Hex: SIGSTORE_5.sha512Hex }),
    ).toMatch(/subject is pkg:npm\/sigstore@5.0.0, not pkg:npm\/evil@5.0.0/);
    expect(checkSubject(statement, { purl: SIGSTORE_5.purl, sha512Hex: "00".repeat(64) })).toMatch(
      /does not match the tarball/,
    );
    const two: InTotoStatement = {
      ...statement,
      subject: [...statement.subject, ...statement.subject],
    };
    expect(checkSubject(two, { purl: SIGSTORE_5.purl, sha512Hex: SIGSTORE_5.sha512Hex })).toMatch(
      /expected one subject, found 2/,
    );
  });
});

describe("parseGithubPredicate", () => {
  it("extracts the claim from the real predicate", () => {
    const parsed = parseGithubPredicate(decodeStatement(provenanceBundle()));
    expect(parsed).toEqual({
      ok: true,
      claim: {
        buildType: GITHUB_WORKFLOW_BUILD_TYPE,
        repository: SIGSTORE_5.repository,
        workflowPath: ".github/workflows/release.yml",
        workflowRef: "refs/heads/main",
        eventName: "push",
        repositoryId: "495574555",
        repositoryOwnerId: "71096353",
        sourceUri: "git+https://github.com/sigstore/sigstore-js@refs/heads/main",
        sourceRef: "refs/heads/main",
        commit: SIGSTORE_5.commit,
        builderId: "https://github.com/actions/runner/github-hosted",
        invocationId: "https://github.com/sigstore/sigstore-js/actions/runs/26781866618/attempts/1",
      },
    });
  });

  it("reports SLSA v0.2 (GitLab-style) provenance as unsupported", () => {
    const statement: InTotoStatement = {
      _type: "https://in-toto.io/Statement/v0.1",
      predicateType: "https://slsa.dev/provenance/v0.2",
      subject: [],
      predicate: {},
    };
    expect(parseGithubPredicate(statement)).toEqual({
      ok: false,
      status: "unsupported",
      reason: "in-toto statement type https://in-toto.io/Statement/v0.1",
    });
  });

  it("reports an unknown build type or builder as unsupported", () => {
    const edited = withEditedProvenance(sigstoreAttestations(), (s) => {
      (s.predicate as { buildDefinition: { buildType: string } }).buildDefinition.buildType =
        "https://example.com/other";
    });
    expect(parseGithubPredicate(decodeStatement(provenanceBundle(edited)))).toMatchObject({
      ok: false,
      status: "unsupported",
      reason: "build type https://example.com/other",
    });

    const builder = withEditedProvenance(sigstoreAttestations(), (s) => {
      (s.predicate as { runDetails: { builder: { id: string } } }).runDetails.builder.id =
        "https://ci.example/runner";
    });
    expect(parseGithubPredicate(decodeStatement(provenanceBundle(builder)))).toMatchObject({
      ok: false,
      status: "unsupported",
      reason: "builder https://ci.example/runner",
    });
  });

  it("reports missing or malformed required fields as invalid", () => {
    const noCommit = withEditedProvenance(sigstoreAttestations(), (s) => {
      (
        s.predicate as { buildDefinition: { resolvedDependencies: unknown[] } }
      ).buildDefinition.resolvedDependencies = [];
    });
    expect(parseGithubPredicate(decodeStatement(provenanceBundle(noCommit)))).toEqual({
      ok: false,
      status: "invalid",
      reason: "predicate lacks sourceUri, commit",
    });

    const shortCommit = withEditedProvenance(sigstoreAttestations(), (s) => {
      const p = s.predicate as {
        buildDefinition: { resolvedDependencies: { digest: { gitCommit: string } }[] };
      };
      for (const dependency of p.buildDefinition.resolvedDependencies) {
        dependency.digest.gitCommit = "abc";
      }
    });
    expect(parseGithubPredicate(decodeStatement(provenanceBundle(shortCommit)))).toMatchObject({
      ok: false,
      status: "invalid",
      reason: 'gitCommit "abc" is not a SHA-1',
    });
  });

  it("leaves sourceRef undefined when the source uri is not git+<repository>@<ref>", () => {
    const odd = withEditedProvenance(sigstoreAttestations(), (s) => {
      const p = s.predicate as { buildDefinition: { resolvedDependencies: { uri: string }[] } };
      for (const dependency of p.buildDefinition.resolvedDependencies) {
        dependency.uri = "git+https://github.com/other/repo@refs/heads/main";
      }
    });
    const parsed = parseGithubPredicate(decodeStatement(provenanceBundle(odd)));
    expect(parsed.ok && parsed.claim.sourceRef).toBeUndefined();
  });
});
