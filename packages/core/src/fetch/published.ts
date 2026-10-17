/// <reference path="../types/pacote.d.ts" />
import pacote from "pacote";
import { errorMessage, ToolError } from "../errors.js";
import { registryKey, resolveToken } from "../registry/auth.js";
import { normalizeRegistry, type RegistryOptions, registryJson } from "../registry/client.js";
import { type PackageSpec, parseSpec } from "../registry/spec.js";
import { base64ToHex, computeDigests, sha512FromIntegrity } from "./digests.js";
import type {
  AttestationsResponse,
  DistInfo,
  RegistrySignature,
  ReleaseArtifact,
} from "./types.js";

/** The subset of pacote we call. Injectable so tests never touch the network. */
export interface PacoteLike {
  manifest(spec: string, opts?: pacote.Options): Promise<pacote.Manifest>;
  tarball(spec: string, opts?: pacote.Options): Promise<Buffer>;
}

export interface FetchPublishedOptions extends RegistryOptions {
  pacote?: PacoteLike | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Keeps only the `dist` fields we understand, with their types checked. */
export function readDist(dist: unknown): DistInfo {
  if (!isRecord(dist)) {
    return {};
  }
  const out: DistInfo = {
    integrity: optionalString(dist.integrity),
    shasum: optionalString(dist.shasum),
    tarball: optionalString(dist.tarball),
  };
  if (Array.isArray(dist.signatures)) {
    const signatures: RegistrySignature[] = [];
    for (const entry of dist.signatures) {
      if (isRecord(entry) && typeof entry.keyid === "string" && typeof entry.sig === "string") {
        signatures.push({ keyid: entry.keyid, sig: entry.sig });
      }
    }
    out.signatures = signatures;
  }
  if (isRecord(dist.attestations) && typeof dist.attestations.url === "string") {
    const provenance = dist.attestations.provenance;
    out.attestations = {
      url: dist.attestations.url,
      provenance:
        isRecord(provenance) && typeof provenance.predicateType === "string"
          ? { predicateType: provenance.predicateType }
          : undefined,
    };
  }
  return out;
}

/** Validates the shape of an attestations response. Anything else is treated as absent. */
export function readAttestations(body: unknown): AttestationsResponse | null {
  if (!isRecord(body) || !Array.isArray(body.attestations)) {
    return null;
  }
  const attestations: AttestationsResponse["attestations"] = [];
  for (const entry of body.attestations) {
    if (isRecord(entry) && typeof entry.predicateType === "string" && isRecord(entry.bundle)) {
      attestations.push({ predicateType: entry.predicateType, bundle: entry.bundle });
    } else {
      // One malformed entry makes the whole response untrustworthy.
      return null;
    }
  }
  return { attestations };
}

function repositoryHint(repository: pacote.Manifest["repository"]): string | undefined {
  if (typeof repository === "string") {
    return repository;
  }
  return repository?.url;
}

/**
 * Fetches a published version: manifest, integrity-checked tarball and its attestations.
 * The attestations are fetched by path against our configured registry, never via the
 * absolute URL in the manifest, because the manifest is untrusted data.
 */
export async function fetchPublished(
  input: string | PackageSpec,
  options: FetchPublishedOptions = {},
): Promise<ReleaseArtifact> {
  const spec = typeof input === "string" ? parseSpec(input) : input;
  const registry = normalizeRegistry(options.registry);
  const token = resolveToken(registry, {
    explicit: options.token,
    env: options.env,
    npmrcPaths: options.npmrcPaths,
  });
  const client = options.pacote ?? pacote;
  const specString = `${spec.name}@${spec.version}`;

  const pacoteOptions: pacote.Options = { registry, fullMetadata: true, before: null };
  if (token) {
    pacoteOptions[`${registryKey(registry)}:_authToken`] = token;
  }

  let manifest: pacote.Manifest;
  try {
    manifest = await client.manifest(specString, pacoteOptions);
  } catch (error) {
    throw new ToolError(`Could not fetch ${specString} from ${registry}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  if (manifest.name !== spec.name || manifest.version !== spec.version) {
    throw new ToolError(
      `Registry returned ${manifest.name}@${manifest.version} when asked for ${specString}`,
    );
  }

  const dist = readDist(manifest.dist);
  const integrity = dist.integrity;
  const expectedSha512 = integrity ? sha512FromIntegrity(integrity) : undefined;
  if (!integrity || !expectedSha512) {
    throw new ToolError(`Registry did not provide a sha512 integrity for ${specString}`);
  }

  let tarball: Buffer;
  try {
    tarball = await client.tarball(specString, { ...pacoteOptions, integrity });
  } catch (error) {
    throw new ToolError(`Could not download ${specString}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  // pacote already checked the integrity; re-checking is cheap and keeps us independent of it.
  const digests = computeDigests(tarball);
  if (digests.sha512Base64 !== expectedSha512) {
    throw new ToolError(
      `Tarball for ${specString} does not match its integrity (expected sha512 ${base64ToHex(
        expectedSha512,
      )}, got ${digests.sha512Hex})`,
    );
  }

  let attestations: AttestationsResponse | null = null;
  if (dist.attestations) {
    const attestationsPath = new URL(dist.attestations.url).pathname;
    const body = await registryJson<unknown>(attestationsPath, { ...options, registry, token });
    attestations = readAttestations(body);
  }

  return {
    origin: { kind: "published", registry },
    name: spec.name,
    version: spec.version,
    purl: spec.purl,
    tarball,
    digests,
    dist,
    hints: { gitHead: manifest.gitHead, repository: repositoryHint(manifest.repository) },
    attestations,
  };
}
