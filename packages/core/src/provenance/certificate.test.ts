import { describe, expect, it } from "vitest";
import { SIGSTORE_5, sigstoreSignerIdentity, withFulcioOid } from "../../test/fixtures.js";
import { extractCertificateIdentity, splitWorkflowUri } from "./certificate.js";

describe("extractCertificateIdentity", () => {
  it("decodes every Fulcio extension of the real sigstore@5.0.0 certificate", () => {
    const identity = extractCertificateIdentity(sigstoreSignerIdentity());
    expect(identity).toEqual({
      subjectAlternativeName: SIGSTORE_5.workflow,
      issuer: "https://token.actions.githubusercontent.com",
      buildSignerUri: SIGSTORE_5.workflow,
      buildSignerDigest: SIGSTORE_5.commit,
      runnerEnvironment: "github-hosted",
      sourceRepositoryUri: SIGSTORE_5.repository,
      sourceRepositoryDigest: SIGSTORE_5.commit,
      sourceRepositoryRef: "refs/heads/main",
      sourceRepositoryId: "495574555",
      sourceRepositoryOwnerUri: "https://github.com/sigstore",
      sourceRepositoryOwnerId: "71096353",
      buildConfigUri: SIGSTORE_5.workflow,
      buildConfigDigest: SIGSTORE_5.commit,
      buildTrigger: "push",
      runInvocationUri:
        "https://github.com/sigstore/sigstore-js/actions/runs/26781866618/attempts/1",
      sourceRepositoryVisibility: "public",
      tokenSubject: "repo:sigstore/sigstore-js:ref:refs/heads/main",
    });
  });

  it("ignores the deprecated raw-string extensions (.1 to .6) and unknown OIDs", () => {
    const identity = extractCertificateIdentity({
      subjectAlternativeName: "x",
      oids: [
        { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 5] }, value: Buffer.from("owner/repo") },
        { oid: { id: [1, 3, 6, 1, 4, 1, 57264, 1, 99] }, value: Buffer.from([0x0c, 1, 0x41]) },
        { oid: { id: [2, 5, 29, 17] }, value: Buffer.from([0x30, 0]) },
        { oid: undefined, value: Buffer.from([0x0c, 1, 0x41]) },
      ],
    });
    expect(identity).toEqual({ subjectAlternativeName: "x", issuer: undefined });
  });

  it("drops a malformed extension value instead of guessing", () => {
    const identity = extractCertificateIdentity({
      ...withFulcioOid(sigstoreSignerIdentity(), 13, "ignored"),
      oids: sigstoreSignerIdentity().oids?.map((entry) =>
        entry.oid?.id?.at(-1) === 13 ? { ...entry, value: Buffer.from("raw, not DER") } : entry,
      ),
    });
    expect(identity.sourceRepositoryDigest).toBeUndefined();
  });

  it("falls back to sigstore's issuer extension when OID .8 is absent", () => {
    const identity = extractCertificateIdentity({
      extensions: { issuer: "https://token.actions.githubusercontent.com" },
      oids: [],
    });
    expect(identity.issuer).toBe("https://token.actions.githubusercontent.com");
  });
});

describe("splitWorkflowUri", () => {
  it("splits path and ref relative to the repository", () => {
    expect(splitWorkflowUri(SIGSTORE_5.workflow, SIGSTORE_5.repository)).toEqual({
      path: ".github/workflows/release.yml",
      ref: "refs/heads/main",
    });
  });

  it("splits at the last @ so paths containing @ survive", () => {
    expect(
      splitWorkflowUri(
        "https://github.com/o/r/.github/workflows/odd@name.yml@refs/tags/v1",
        "https://github.com/o/r",
      ),
    ).toEqual({ path: ".github/workflows/odd@name.yml", ref: "refs/tags/v1" });
  });

  it("returns undefined for a workflow outside the repository or without a ref", () => {
    expect(
      splitWorkflowUri(
        "https://github.com/other/repo/.github/workflows/a.yml@refs/heads/main",
        "https://github.com/o/r",
      ),
    ).toBeUndefined();
    expect(
      splitWorkflowUri("https://github.com/o/r/.github/workflows/a.yml", "https://github.com/o/r"),
    ).toBeUndefined();
  });
});
