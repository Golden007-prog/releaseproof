import type { Digests } from "./digests.js";

export interface RegistrySignature {
  keyid: string;
  sig: string;
}

/** The `dist` object of a published version, as served by the registry. */
export interface DistInfo {
  integrity?: string | undefined;
  shasum?: string | undefined;
  tarball?: string | undefined;
  signatures?: RegistrySignature[] | undefined;
  attestations?: { url: string; provenance?: { predicateType: string } | undefined } | undefined;
}

/** One entry of `GET /-/npm/v1/attestations/<name>@<version>`. */
export interface AttestationEntry {
  predicateType: string;
  /** A serialized Sigstore bundle. Treated as untrusted until verified. */
  bundle: Record<string, unknown>;
}

export interface AttestationsResponse {
  attestations: AttestationEntry[];
}

/** A staged item as returned by `GET /-/stage/<id>`. Extra registry fields are kept as-is. */
export interface StagedItem {
  id: string;
  packageName?: string | undefined;
  version?: string | undefined;
  tag?: string | undefined;
  createdAt?: string | undefined;
  actor?: string | undefined;
  actorType?: string | undefined;
  shasum?: string | undefined;
  status?: string | undefined;
  [extra: string]: unknown;
}

export type ArtifactOrigin =
  | { kind: "published"; registry: string }
  | { kind: "staged"; registry: string; stageId: string; item: StagedItem };

/** A release tarball plus everything the registry told us about it. */
export interface ReleaseArtifact {
  origin: ArtifactOrigin;
  name: string;
  version: string;
  purl: string;
  tarball: Buffer;
  digests: Digests;
  /** Null for staged artifacts: the registry exposes no `dist` for them. */
  dist: DistInfo | null;
  /** Unsigned, maintainer-supplied values from the manifest. Hints only, never proof. */
  hints: { gitHead?: string | undefined; repository?: string | undefined };
  /** Null when the registry has no attestations for this version. */
  attestations: AttestationsResponse | null;
}
