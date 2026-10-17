import { describe, expect, it } from "vitest";
import { SIGSTORE_5 } from "../../test/fixtures.js";
import { base64ToHex, computeDigests, sha512FromIntegrity } from "./digests.js";

describe("computeDigests", () => {
  it("computes sha512 (hex and base64) and sha1 of the bytes", () => {
    const digests = computeDigests(Buffer.from("hello"));
    expect(digests.sha1Hex).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
    expect(digests.sha512Hex).toBe(
      "9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043",
    );
    expect(base64ToHex(digests.sha512Base64)).toBe(digests.sha512Hex);
  });
});

describe("sha512FromIntegrity", () => {
  const sha512 =
    "hJqJfoG/e4qFQaauQL00c6J6FrHLBGKtkFvW3JbTSIEFOhLrSjdSM/gWd/yUOfYo/gsERehTXGC1VZWX+9X4Dg==";

  it("returns the sha512 entry and converts to the attestation subject's hex form", () => {
    expect(sha512FromIntegrity(`sha512-${sha512}`)).toBe(sha512);
    expect(base64ToHex(sha512)).toBe(SIGSTORE_5.sha512Hex);
  });

  it("picks sha512 out of a multi-entry SRI string and ignores options", () => {
    expect(sha512FromIntegrity(`sha1-abc sha512-${sha512}?foo`)).toBe(sha512);
  });

  it("returns undefined without a well-formed sha512 entry", () => {
    expect(sha512FromIntegrity("sha1-aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d")).toBeUndefined();
    expect(sha512FromIntegrity("sha512-tooshort")).toBeUndefined();
    expect(sha512FromIntegrity("")).toBeUndefined();
  });
});
