import type { PredicateClaim } from "./types.js";

export const INTOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const INTOTO_STATEMENT_V1 = "https://in-toto.io/Statement/v1";
export const INTOTO_STATEMENT_V01 = "https://in-toto.io/Statement/v0.1";
export const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";
export const SLSA_PROVENANCE_PREFIX = "https://slsa.dev/provenance/";
export const NPM_PUBLISH_ATTESTATION_V01 =
  "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
export const GITHUB_WORKFLOW_BUILD_TYPE =
  "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
export const GITHUB_BUILDER_ID_PREFIX = "https://github.com/actions/runner/";

const GIT_COMMIT_RE = /^[0-9a-f]{40}$/;

export class AttestationFormatError extends Error {
  override readonly name = "AttestationFormatError";
}

export interface InTotoSubject {
  name: string;
  digest: Record<string, string>;
}

export interface InTotoStatement {
  _type: string;
  subject: InTotoSubject[];
  predicateType: string;
  predicate: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a nested string, e.g. `read(obj, "a", "b")` for `obj.a.b`. */
function read(value: unknown, ...path: string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Decodes the in-toto statement inside a DSSE bundle without trusting it: the shape is
 * checked field by field. Signature verification happens separately.
 */
export function decodeStatement(bundle: Record<string, unknown>): InTotoStatement {
  const envelope = bundle.dsseEnvelope;
  if (!isRecord(envelope) || typeof envelope.payload !== "string") {
    throw new AttestationFormatError("bundle has no DSSE envelope with a payload");
  }
  if (envelope.payloadType !== INTOTO_PAYLOAD_TYPE) {
    throw new AttestationFormatError(`unexpected DSSE payloadType ${String(envelope.payloadType)}`);
  }
  let statement: unknown;
  try {
    statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
  } catch {
    throw new AttestationFormatError("DSSE payload is not valid JSON");
  }
  if (
    !isRecord(statement) ||
    typeof statement._type !== "string" ||
    typeof statement.predicateType !== "string" ||
    !isRecord(statement.predicate) ||
    !Array.isArray(statement.subject)
  ) {
    throw new AttestationFormatError("DSSE payload is not an in-toto statement");
  }
  const subject: InTotoSubject[] = [];
  for (const entry of statement.subject) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !isRecord(entry.digest)) {
      throw new AttestationFormatError("in-toto subject is malformed");
    }
    const digest: Record<string, string> = {};
    for (const [algorithm, value] of Object.entries(entry.digest)) {
      if (typeof value !== "string") {
        throw new AttestationFormatError("in-toto subject digest is malformed");
      }
      digest[algorithm] = value;
    }
    subject.push({ name: entry.name, digest });
  }
  return {
    _type: statement._type,
    subject,
    predicateType: statement.predicateType,
    predicate: statement.predicate,
  };
}

/** Returns a problem description when the statement is not about exactly this tarball. */
export function checkSubject(
  statement: InTotoStatement,
  expected: { purl: string; sha512Hex: string },
): string | undefined {
  if (statement.subject.length !== 1) {
    return `expected one subject, found ${statement.subject.length}`;
  }
  const [subject] = statement.subject;
  if (!subject) {
    return "expected one subject, found none";
  }
  if (subject.name !== expected.purl) {
    return `subject is ${subject.name}, not ${expected.purl}`;
  }
  const sha512 = subject.digest.sha512?.toLowerCase();
  if (sha512 !== expected.sha512Hex.toLowerCase()) {
    return `subject sha512 digest ${sha512 ?? "(none)"} does not match the tarball (${expected.sha512Hex})`;
  }
  return undefined;
}

export type PredicateParse =
  | { ok: true; claim: PredicateClaim }
  | { ok: false; status: "unsupported" | "invalid"; reason: string };

/** Interprets a SLSA v1 predicate produced by npm on GitHub Actions. */
export function parseGithubPredicate(statement: InTotoStatement): PredicateParse {
  if (statement._type !== INTOTO_STATEMENT_V1) {
    return {
      ok: false,
      status: "unsupported",
      reason: `in-toto statement type ${statement._type}`,
    };
  }
  if (statement.predicateType !== SLSA_PROVENANCE_V1) {
    return {
      ok: false,
      status: "unsupported",
      reason: `predicate type ${statement.predicateType}`,
    };
  }
  const p = statement.predicate;
  const buildType = read(p, "buildDefinition", "buildType");
  if (buildType !== GITHUB_WORKFLOW_BUILD_TYPE) {
    return { ok: false, status: "unsupported", reason: `build type ${buildType ?? "(none)"}` };
  }
  const repository = read(p, "buildDefinition", "externalParameters", "workflow", "repository");
  const workflowPath = read(p, "buildDefinition", "externalParameters", "workflow", "path");
  const workflowRef = read(p, "buildDefinition", "externalParameters", "workflow", "ref");
  const builderId = read(p, "runDetails", "builder", "id");
  const definition = isRecord(p.buildDefinition) ? p.buildDefinition : undefined;
  const dependencies = Array.isArray(definition?.resolvedDependencies)
    ? definition.resolvedDependencies
    : [];
  const sourceUri = read(dependencies[0], "uri");
  const commit = read(dependencies[0], "digest", "gitCommit");

  const missing = Object.entries({
    repository,
    workflowPath,
    workflowRef,
    builderId,
    sourceUri,
    commit,
  })
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);
  if (missing.length > 0) {
    return { ok: false, status: "invalid", reason: `predicate lacks ${missing.join(", ")}` };
  }
  // The checks above guarantee these; the casts keep TypeScript's narrowing simple.
  const claim: PredicateClaim = {
    buildType,
    repository: repository as string,
    workflowPath: workflowPath as string,
    workflowRef: workflowRef as string,
    eventName: read(p, "buildDefinition", "internalParameters", "github", "event_name"),
    repositoryId: read(p, "buildDefinition", "internalParameters", "github", "repository_id"),
    repositoryOwnerId: read(
      p,
      "buildDefinition",
      "internalParameters",
      "github",
      "repository_owner_id",
    ),
    sourceUri: sourceUri as string,
    commit: commit as string,
    builderId: builderId as string,
    invocationId: read(p, "runDetails", "metadata", "invocationId"),
  };
  if (!GIT_COMMIT_RE.test(claim.commit)) {
    return { ok: false, status: "invalid", reason: `gitCommit "${claim.commit}" is not a SHA-1` };
  }
  if (!claim.builderId.startsWith(GITHUB_BUILDER_ID_PREFIX)) {
    return { ok: false, status: "unsupported", reason: `builder ${claim.builderId}` };
  }
  const sourcePrefix = `git+${claim.repository}@`;
  if (claim.sourceUri.startsWith(sourcePrefix)) {
    claim.sourceRef = claim.sourceUri.slice(sourcePrefix.length);
  }
  return { ok: true, claim };
}
