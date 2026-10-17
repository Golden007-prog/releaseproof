import { describe, expect, it } from "vitest";
import { ToolError } from "../errors.js";
import { parseSpec, toPurl } from "./spec.js";

describe("parseSpec", () => {
  it("parses an unscoped exact spec", () => {
    expect(parseSpec("sigstore@5.0.0")).toEqual({
      name: "sigstore",
      version: "5.0.0",
      purl: "pkg:npm/sigstore@5.0.0",
    });
  });

  it("parses a scoped spec and escapes only the scope marker in the purl", () => {
    expect(parseSpec("@sigstore/verify@4.1.2")).toEqual({
      name: "@sigstore/verify",
      version: "4.1.2",
      purl: "pkg:npm/%40sigstore/verify@4.1.2",
    });
  });

  it("accepts prerelease and build metadata", () => {
    expect(parseSpec("pkg@1.0.0-beta.1+build.5").version).toBe("1.0.0-beta.1+build.5");
  });

  it.each(["sigstore", "@sigstore/verify", "sigstore@", "@5.0.0"])(
    "rejects %j without an exact version",
    (input) => {
      expect(() => parseSpec(input)).toThrow(ToolError);
    },
  );

  it.each(["sigstore@^5.0.0", "sigstore@latest", "sigstore@5", "sigstore@5.0", "sigstore@v5.0.0"])(
    "rejects range or tag %j: a verdict must be about one tarball",
    (input) => {
      expect(() => parseSpec(input)).toThrow(/exact version/);
    },
  );

  it.each(["Sigstore@1.0.0", ".hidden@1.0.0", "bad name@1.0.0", "@scope@1.0.0", "a/b@1.0.0"])(
    "rejects invalid package name in %j",
    (input) => {
      expect(() => parseSpec(input)).toThrow(/Invalid package name/);
    },
  );
});

describe("toPurl", () => {
  it("matches npm-package-arg's encoding", () => {
    expect(toPurl("sigstore", "5.0.0")).toBe("pkg:npm/sigstore@5.0.0");
    expect(toPurl("@types/node", "22.0.0")).toBe("pkg:npm/%40types/node@22.0.0");
  });
});
