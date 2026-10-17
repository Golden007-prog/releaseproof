import { describe, expect, it, vi } from "vitest";
import { sigstoreAttestations } from "../../test/fixtures.js";
import { ToolError } from "../errors.js";
import { SLSA_PROVENANCE_V1 } from "../provenance/predicate.js";
import { computeDigests } from "./digests.js";
import { fetchPublished, type PacoteLike, readAttestations, readDist } from "./published.js";

const tarball = Buffer.from("not really a tarball, but bytes are bytes");
const digests = computeDigests(tarball);

function manifestFor(overrides: Record<string, unknown> = {}) {
  return {
    name: "sigstore",
    version: "5.0.0",
    dist: {
      integrity: `sha512-${digests.sha512Base64}`,
      shasum: digests.sha1Hex,
      tarball: "https://registry.npmjs.org/sigstore/-/sigstore-5.0.0.tgz",
      signatures: [{ keyid: "SHA256:key", sig: "MEUC…" }],
      attestations: {
        url: "https://registry.npmjs.org/-/npm/v1/attestations/sigstore@5.0.0",
        provenance: { predicateType: SLSA_PROVENANCE_V1 },
      },
    },
    gitHead: "7d2900eca1c22b3f87c13987c8d4b7c9a29b733a",
    repository: { type: "git", url: "git+https://github.com/sigstore/sigstore-js.git" },
    ...overrides,
  };
}

function fakePacote(
  manifest: Record<string, unknown>,
  bytes = tarball,
): PacoteLike & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    manifest: async (spec, opts) => {
      calls.push(["manifest", spec, opts]);
      return manifest as Awaited<ReturnType<PacoteLike["manifest"]>>;
    },
    tarball: async (spec, opts) => {
      calls.push(["tarball", spec, opts]);
      return bytes;
    },
  };
}

function fetchJson(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("fetchPublished", () => {
  it("returns the tarball, digests, dist, hints and attestations", async () => {
    const pacote = fakePacote(manifestFor());
    const fetch = fetchJson(sigstoreAttestations());
    const artifact = await fetchPublished("sigstore@5.0.0", { pacote, fetch, token: "tok" });

    expect(artifact.origin).toEqual({ kind: "published", registry: "https://registry.npmjs.org/" });
    expect(artifact.name).toBe("sigstore");
    expect(artifact.purl).toBe("pkg:npm/sigstore@5.0.0");
    expect(artifact.tarball).toBe(tarball);
    expect(artifact.digests).toEqual(digests);
    expect(artifact.dist?.signatures).toEqual([{ keyid: "SHA256:key", sig: "MEUC…" }]);
    expect(artifact.hints).toEqual({
      gitHead: "7d2900eca1c22b3f87c13987c8d4b7c9a29b733a",
      repository: "git+https://github.com/sigstore/sigstore-js.git",
    });
    expect(artifact.attestations?.attestations).toHaveLength(2);

    // pacote gets full metadata, the token under npm's per-registry key, and the integrity.
    const [, , manifestOpts] = pacote.calls[0] ?? [];
    expect(manifestOpts).toMatchObject({
      registry: "https://registry.npmjs.org/",
      fullMetadata: true,
      "//registry.npmjs.org/:_authToken": "tok",
    });
    const [, , tarballOpts] = pacote.calls[1] ?? [];
    expect(tarballOpts).toMatchObject({ integrity: `sha512-${digests.sha512Base64}` });
  });

  it("fetches attestations by path on our registry, never on the host the manifest names", async () => {
    const manifest = manifestFor();
    (manifest.dist as { attestations: { url: string } }).attestations.url =
      "https://evil.example/-/npm/v1/attestations/sigstore@5.0.0";
    const fetch = fetchJson(sigstoreAttestations());
    await fetchPublished("sigstore@5.0.0", {
      pacote: fakePacote(manifest),
      fetch,
      registry: "https://npm.example.com/npm/",
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://npm.example.com/npm/-/npm/v1/attestations/sigstore@5.0.0",
    );
  });

  it("reports null attestations when the registry has none (404)", async () => {
    const artifact = await fetchPublished("sigstore@5.0.0", {
      pacote: fakePacote(manifestFor()),
      fetch: fetchJson("", 404),
    });
    expect(artifact.attestations).toBeNull();
  });

  it("does not request attestations when dist has none", async () => {
    const manifest = manifestFor();
    delete (manifest.dist as Record<string, unknown>).attestations;
    const fetch = fetchJson({});
    const artifact = await fetchPublished("sigstore@5.0.0", {
      pacote: fakePacote(manifest),
      fetch,
    });
    expect(artifact.attestations).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the tarball does not match the integrity", async () => {
    const pacote = fakePacote(manifestFor(), Buffer.from("different bytes"));
    await expect(
      fetchPublished("sigstore@5.0.0", { pacote, fetch: fetchJson({}) }),
    ).rejects.toThrow(/does not match its integrity/);
  });

  it("fails closed when the registry provides no sha512 integrity", async () => {
    const manifest = manifestFor();
    (manifest.dist as Record<string, unknown>).integrity = "sha1-abc";
    await expect(
      fetchPublished("sigstore@5.0.0", { pacote: fakePacote(manifest), fetch: fetchJson({}) }),
    ).rejects.toThrow(/no.*sha512 integrity/i);
  });

  it("rejects a manifest for a different package or version", async () => {
    await expect(
      fetchPublished("sigstore@5.0.0", {
        pacote: fakePacote(manifestFor({ version: "5.0.1" })),
        fetch: fetchJson({}),
      }),
    ).rejects.toThrow(/returned sigstore@5.0.1 when asked for sigstore@5.0.0/);
  });

  it("wraps pacote failures in ToolError", async () => {
    const pacote: PacoteLike = {
      manifest: async () => {
        throw new Error("E404 not found");
      },
      tarball: async () => tarball,
    };
    await expect(fetchPublished("nope@1.0.0", { pacote, fetch: fetchJson({}) })).rejects.toThrow(
      ToolError,
    );
  });
});

describe("readDist", () => {
  it("keeps only well-typed fields", () => {
    expect(
      readDist({
        integrity: 5,
        shasum: "abc",
        signatures: [{ keyid: "k" }, { keyid: "k", sig: "s" }],
      }),
    ).toEqual({
      integrity: undefined,
      shasum: "abc",
      tarball: undefined,
      signatures: [{ keyid: "k", sig: "s" }],
    });
    expect(readDist(null)).toEqual({});
  });
});

describe("readAttestations", () => {
  it("rejects the whole response when one entry is malformed", () => {
    expect(
      readAttestations({ attestations: [{ predicateType: "x", bundle: "not an object" }] }),
    ).toBeNull();
    expect(readAttestations({ attestations: "nope" })).toBeNull();
    expect(readAttestations({ attestations: [] })).toEqual({ attestations: [] });
  });
});
