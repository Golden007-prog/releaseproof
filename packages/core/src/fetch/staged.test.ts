import { describe, expect, it, vi } from "vitest";
import { ToolError } from "../errors.js";
import { computeDigests } from "./digests.js";
import { fetchStaged, STAGE_ID_RE } from "./staged.js";

const STAGE_ID = "123e4567-e89b-12d3-a456-426614174000";
const tarball = Buffer.from("staged tarball bytes");
const digests = computeDigests(tarball);

function itemFor(overrides: Record<string, unknown> = {}) {
  return {
    id: STAGE_ID,
    packageName: "@scope/pkg",
    version: "1.2.3",
    tag: "latest",
    createdAt: "2026-10-17T10:00:00.000Z",
    actor: "ci-bot",
    actorType: "trusted-publisher",
    shasum: digests.sha1Hex,
    status: "pending",
    somethingNew: { nested: true },
    ...overrides,
  };
}

function fakeFetch(item: unknown, bytes = tarball): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith(`/-/stage/${STAGE_ID}`)) {
      return item === null ? new Response("", { status: 404 }) : Response.json(item);
    }
    if (href.endsWith(`/-/stage/${STAGE_ID}/tarball`)) {
      return new Response(bytes, { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
}

describe("fetchStaged", () => {
  it("accepts only UUID stage ids, like npm", () => {
    expect(STAGE_ID_RE.test(STAGE_ID)).toBe(true);
    expect(STAGE_ID_RE.test("../approve")).toBe(false);
  });

  it("rejects a non-UUID id before any request", async () => {
    const fetch = fakeFetch(itemFor());
    await expect(fetchStaged("not-a-uuid", { token: "tok", fetch })).rejects.toThrow(
      /must be a UUID/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a token", async () => {
    await expect(
      fetchStaged(STAGE_ID, { fetch: fakeFetch(itemFor()), env: {} } as never),
    ).rejects.toThrow(/need an npm token/);
  });

  it("downloads the tarball and reports the staged item", async () => {
    const artifact = await fetchStaged(STAGE_ID.toUpperCase(), {
      token: "tok",
      fetch: fakeFetch(itemFor()),
    });
    expect(artifact.origin).toMatchObject({ kind: "staged", stageId: STAGE_ID });
    expect(artifact.name).toBe("@scope/pkg");
    expect(artifact.version).toBe("1.2.3");
    expect(artifact.purl).toBe("pkg:npm/%40scope/pkg@1.2.3");
    expect(artifact.digests).toEqual(digests);
    expect(artifact.dist).toBeNull();
    expect(artifact.attestations).toBeNull();
    if (artifact.origin.kind !== "staged") {
      throw new Error("expected a staged origin");
    }
    expect(artifact.origin.item.actor).toBe("ci-bot");
    expect(artifact.origin.item.somethingNew).toEqual({ nested: true });
  });

  it("fails closed when the tarball does not match the reported shasum", async () => {
    await expect(
      fetchStaged(STAGE_ID, { token: "tok", fetch: fakeFetch(itemFor(), Buffer.from("tampered")) }),
    ).rejects.toThrow(/does not match the shasum/);
  });

  it("fails when the item has no package name or version", async () => {
    await expect(
      fetchStaged(STAGE_ID, { token: "tok", fetch: fakeFetch(itemFor({ version: 7 })) }),
    ).rejects.toThrow(/package name and version/);
  });

  it("reports a missing or inaccessible staged package", async () => {
    await expect(fetchStaged(STAGE_ID, { token: "tok", fetch: fakeFetch(null) })).rejects.toThrow(
      ToolError,
    );
  });
});
