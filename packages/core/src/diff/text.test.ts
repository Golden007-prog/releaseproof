import { describe, expect, it } from "vitest";
import { classifyText, isProbablyText, normalizeWhitespace, unifiedDiff } from "./text.js";

describe("isProbablyText", () => {
  it("treats a NUL byte near the start as binary", () => {
    expect(isProbablyText(Buffer.from("plain text\n"))).toBe(true);
    expect(isProbablyText(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]))).toBe(false);
    expect(isProbablyText(Buffer.alloc(0))).toBe(true);
  });
});

describe("classifyText", () => {
  it("separates whitespace-only changes from real ones", () => {
    const a = Buffer.from("const x = 1;\nconst y = 2;\n");
    expect(classifyText(a, a)).toBe("identical");
    expect(classifyText(a, Buffer.from("const x = 1;\r\nconst y = 2;\r\n"))).toBe("whitespace");
    expect(classifyText(a, Buffer.from("const x = 1;  \nconst y = 2;\n\n\n"))).toBe("whitespace");
    expect(classifyText(a, Buffer.from("const x = 1;\nconst y = 3;\n"))).toBe("content");
    // Indentation changes are content: they can change meaning in some languages.
    expect(classifyText(a, Buffer.from("const x = 1;\n  const y = 2;\n"))).toBe("content");
  });

  it("normalizes to LF with one trailing newline", () => {
    expect(normalizeWhitespace("a \r\nb\r\n\r\n")).toBe("a\nb\n");
    expect(normalizeWhitespace("")).toBe("\n");
  });
});

describe("unifiedDiff", () => {
  it("goes from the rebuild (expected) to the release (actual), so additions are +", () => {
    const patch = unifiedDiff("lib/a.js", "one\ntwo\n", "one\nthree\n");
    expect(patch).toContain("--- rebuild/lib/a.js");
    expect(patch).toContain("+++ release/lib/a.js");
    expect(patch).toContain("-three");
    expect(patch).toContain("+two");
  });
});
