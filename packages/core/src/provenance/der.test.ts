import { describe, expect, it } from "vitest";
import { decodeDerUtf8String, encodeDerUtf8String } from "./der.js";

describe("DER UTF8String", () => {
  it("round-trips short-form lengths", () => {
    const encoded = encodeDerUtf8String("push");
    expect([...encoded]).toEqual([0x0c, 4, 0x70, 0x75, 0x73, 0x68]);
    expect(decodeDerUtf8String(encoded)).toBe("push");
  });

  it("round-trips long-form lengths (128 bytes and up)", () => {
    const value = "x".repeat(200);
    const encoded = encodeDerUtf8String(value);
    expect([...encoded.subarray(0, 3)]).toEqual([0x0c, 0x81, 200]);
    expect(decodeDerUtf8String(encoded)).toBe(value);

    const longer = "y".repeat(70_000);
    expect(decodeDerUtf8String(encodeDerUtf8String(longer))).toBe(longer);
  });

  it("decodes the empty string and multi-byte UTF-8", () => {
    expect(decodeDerUtf8String(Buffer.from([0x0c, 0x00]))).toBe("");
    expect(decodeDerUtf8String(encodeDerUtf8String("héllo ✓"))).toBe("héllo ✓");
  });

  it.each([
    ["wrong tag (PrintableString)", [0x13, 0x01, 0x41]],
    ["raw string without DER framing", [0x70, 0x75, 0x73, 0x68]],
    ["truncated body", [0x0c, 0x05, 0x41]],
    ["trailing bytes", [0x0c, 0x01, 0x41, 0x42]],
    ["indefinite length", [0x0c, 0x80, 0x41]],
    ["too many length bytes", [0x0c, 0x85, 0, 0, 0, 0, 1, 0x41]],
    ["empty input", []],
  ])("returns undefined for %s", (_name, bytes) => {
    expect(decodeDerUtf8String(Buffer.from(bytes))).toBeUndefined();
  });
});
