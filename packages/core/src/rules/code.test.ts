import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureDir } from "../../test/tarballs.js";
import { analyzeCode, isCodePath } from "./code.js";
import { normalizeGithubRepository } from "./repository.js";

describe("analyzeCode", () => {
  it("sees nothing special in ordinary code", () => {
    const text = readFileSync(path.join(fixtureDir("clean"), "lib/greet.js"), "utf8");
    expect(analyzeCode(text)).toEqual({ minified: false, obfuscated: false, reasons: [] });
  });

  it("calls one very long line minified, not obfuscated", () => {
    const signals = analyzeCode(`${"var a=1;".repeat(400)}\n`);
    expect(signals.minified).toBe(true);
    expect(signals.obfuscated).toBe(false);
    expect(signals.reasons[0]).toMatch(/very long lines/);
  });

  it("recognises the obfuscated fixture by its hex identifiers and escapes", () => {
    const text = readFileSync(
      path.join(fixtureDir("attacked-obfuscated"), "lib/loader.js"),
      "utf8",
    );
    const signals = analyzeCode(text);
    expect(signals.obfuscated).toBe(true);
    expect(signals.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/hex-named identifiers/),
        expect.stringMatching(/escape sequences/),
      ]),
    );
  });

  it("needs two signals: eval alone is not obfuscation, eval plus an encoded payload is", () => {
    expect(analyzeCode('const x = eval("1 + 1");\n').obfuscated).toBe(false);
    const payload = `const p = "${"A".repeat(600)}";\nnew Function(atob(p))();\n`;
    const signals = analyzeCode(payload);
    expect(signals.obfuscated).toBe(true);
    expect(signals.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/dynamic code evaluation/),
        expect.stringMatching(/encoded payload/),
      ]),
    );
  });
});

describe("isCodePath", () => {
  it("knows which extensions carry code", () => {
    expect(isCodePath("lib/index.js")).toBe(true);
    expect(isCodePath("dist/x.mjs")).toBe(true);
    expect(isCodePath("scripts/setup.sh")).toBe(true);
    expect(isCodePath("README.md")).toBe(false);
    expect(isCodePath("package.json")).toBe(false);
  });
});

describe("normalizeGithubRepository", () => {
  it.each([
    ["https://github.com/O/R", "https://github.com/o/r"],
    ["git+https://github.com/o/r.git", "https://github.com/o/r"],
    ["git://github.com/o/r.git", "https://github.com/o/r"],
    ["git@github.com:o/r.git", "https://github.com/o/r"],
    ["ssh://git@github.com/o/r.git", "https://github.com/o/r"],
    ["github:o/r", "https://github.com/o/r"],
    ["o/r", "https://github.com/o/r"],
    ["https://github.com/o/r/", "https://github.com/o/r"],
    ["https://github.com/o/r#readme", "https://github.com/o/r"],
    ["https://gitlab.com/o/r", undefined],
    ["not a repo", undefined],
    ["", undefined],
    [undefined, undefined],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeGithubRepository(input)).toBe(expected);
  });
});
