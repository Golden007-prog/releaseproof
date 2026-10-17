import { ToolError } from "../errors.js";
import { resolveToken } from "../registry/auth.js";
import {
  normalizeRegistry,
  type RegistryOptions,
  registryBytes,
  registryJson,
} from "../registry/client.js";
import { toPurl } from "../registry/spec.js";
import { computeDigests } from "./digests.js";
import type { ReleaseArtifact, StagedItem } from "./types.js";

/** Same check as npm's `validate-uuid.js`: the id goes into a URL path, so nothing else may pass. */
export const STAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readItem(body: unknown, stageId: string): StagedItem {
  if (!isRecord(body)) {
    throw new ToolError(`Registry returned an unexpected response for staged package ${stageId}`);
  }
  const item: StagedItem = { ...body, id: stageId };
  for (const field of [
    "packageName",
    "version",
    "tag",
    "createdAt",
    "actor",
    "actorType",
    "shasum",
    "status",
  ] as const) {
    const value = body[field];
    item[field] = typeof value === "string" ? value : undefined;
  }
  return item;
}

/**
 * Downloads a staged (not yet approved) version. Needs a registry token; no 2FA.
 * The registry only publishes a SHA-1 `shasum` for staged items, so we compute SHA-512
 * ourselves and use the shasum as a transport check only.
 */
export async function fetchStaged(
  stageId: string,
  options: RegistryOptions = {},
): Promise<ReleaseArtifact> {
  if (!STAGE_ID_RE.test(stageId)) {
    throw new ToolError(`Stage id must be a UUID, got "${stageId}"`);
  }
  const registry = normalizeRegistry(options.registry);
  const token = resolveToken(registry, { explicit: options.token });
  if (!token) {
    throw new ToolError(
      "Staged packages need an npm token. Set NPM_TOKEN, pass --token, or log in with npm so .npmrc has one.",
    );
  }
  const requestOptions: RegistryOptions = { ...options, registry, token };
  const id = stageId.toLowerCase();

  const body = await registryJson<unknown>(`/-/stage/${id}`, requestOptions);
  if (body === null) {
    throw new ToolError(`Staged package ${id} was not found, or this token cannot see it`);
  }
  const item = readItem(body, id);
  if (!item.packageName || !item.version) {
    throw new ToolError(
      `Registry did not report a package name and version for staged package ${id}`,
    );
  }

  const tarball = await registryBytes(`/-/stage/${id}/tarball`, requestOptions);
  const digests = computeDigests(tarball);
  if (item.shasum && item.shasum.toLowerCase() !== digests.sha1Hex) {
    throw new ToolError(
      `Staged tarball ${id} does not match the shasum the registry reported (expected ${item.shasum}, got ${digests.sha1Hex})`,
    );
  }

  return {
    origin: { kind: "staged", registry, stageId: id, item },
    name: item.packageName,
    version: item.version,
    purl: toPurl(item.packageName, item.version),
    tarball,
    digests,
    dist: null,
    hints: {},
    // Whether the registry exposes attestations for staged versions is an open question
    // (docs/spike-npm.md section 6). Until it is answered we report provenance as missing.
    attestations: null,
  };
}
