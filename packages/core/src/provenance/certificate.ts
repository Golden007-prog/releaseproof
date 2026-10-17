import { decodeDerUtf8String } from "./der.js";
import type { CertificateIdentity } from "./types.js";

export const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";

/** The identity object sigstore's `verify()` returns for certificate-signed bundles. */
export interface SignerIdentityLike {
  subjectAlternativeName?: string | undefined;
  extensions?: { issuer?: string | undefined } | undefined;
  oids?:
    | ReadonlyArray<{
        oid?: { id?: ReadonlyArray<number> | undefined } | undefined;
        value?: Uint8Array | undefined;
      }>
    | undefined;
}

const FULCIO_PREFIX = "1.3.6.1.4.1.57264.1.";

// Fulcio OID suffix -> field. 1 to 6 are the deprecated raw-string extensions; 8+ are
// DER UTF8Strings. See https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md
const FIELDS: Record<number, keyof CertificateIdentity> = {
  8: "issuer",
  9: "buildSignerUri",
  10: "buildSignerDigest",
  11: "runnerEnvironment",
  12: "sourceRepositoryUri",
  13: "sourceRepositoryDigest",
  14: "sourceRepositoryRef",
  15: "sourceRepositoryId",
  16: "sourceRepositoryOwnerUri",
  17: "sourceRepositoryOwnerId",
  18: "buildConfigUri",
  19: "buildConfigDigest",
  20: "buildTrigger",
  21: "runInvocationUri",
  22: "sourceRepositoryVisibility",
  23: "deploymentEnvironment",
  24: "tokenSubject",
};

/** Reads the Fulcio extensions out of a verified signer identity. Malformed values are dropped. */
export function extractCertificateIdentity(identity: SignerIdentityLike): CertificateIdentity {
  const out: CertificateIdentity = {
    subjectAlternativeName: identity.subjectAlternativeName,
  };
  for (const entry of identity.oids ?? []) {
    const id = entry.oid?.id?.join(".");
    if (!id?.startsWith(FULCIO_PREFIX) || !entry.value) {
      continue;
    }
    const field = FIELDS[Number(id.slice(FULCIO_PREFIX.length))];
    if (!field) {
      continue;
    }
    const value = decodeDerUtf8String(entry.value);
    if (value !== undefined) {
      out[field] = value;
    }
  }
  // sigstore already exposes the issuer; it is the same value as OID .8.
  out.issuer ??= identity.extensions?.issuer;
  return out;
}

/** Splits a Build Config URI into the workflow path and ref relative to its repository. */
export function splitWorkflowUri(
  uri: string,
  repository: string,
): { path: string; ref: string } | undefined {
  const prefix = `${repository}/`;
  if (!uri.startsWith(prefix)) {
    return undefined;
  }
  const rest = uri.slice(prefix.length);
  // The path may contain "@"; the ref ("refs/…") never does, so split at the last one.
  const at = rest.lastIndexOf("@");
  if (at <= 0 || at === rest.length - 1) {
    return undefined;
  }
  return { path: rest.slice(0, at), ref: rest.slice(at + 1) };
}
