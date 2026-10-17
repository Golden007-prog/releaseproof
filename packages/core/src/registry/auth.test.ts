import { describe, expect, it } from "vitest";
import { parseNpmrcToken, registryKey, resolveToken } from "./auth.js";

const REGISTRY = "https://registry.npmjs.org/";

describe("registryKey", () => {
  it("uses npm's //host/path/ form", () => {
    expect(registryKey(undefined)).toBe("//registry.npmjs.org/");
    expect(registryKey("https://npm.example.com/npm")).toBe("//npm.example.com/npm/");
  });
});

describe("parseNpmrcToken", () => {
  it("finds the token for the registry", () => {
    const npmrc = [
      "registry=https://registry.npmjs.org/",
      "//registry.npmjs.org/:_authToken=abc123",
    ].join("\n");
    expect(parseNpmrcToken(npmrc, REGISTRY, {})).toBe("abc123");
  });

  it("expands env placeholders like npm does and strips quotes", () => {
    const npmrc = `//registry.npmjs.org/:_authToken="\${NPM_TOKEN}"`;
    expect(parseNpmrcToken(npmrc, REGISTRY, { NPM_TOKEN: "from-env" })).toBe("from-env");
    expect(parseNpmrcToken(npmrc, REGISTRY, {})).toBeUndefined();
  });

  it("ignores comments, blank lines and other registries", () => {
    const npmrc = [
      "# comment",
      "; another comment",
      "",
      "//npm.pkg.github.com/:_authToken=gh-token",
      "always-auth=true",
    ].join("\r\n");
    expect(parseNpmrcToken(npmrc, REGISTRY, {})).toBeUndefined();
  });

  it("prefers the exact registry path over the host root", () => {
    const npmrc = [
      "//npm.example.com/:_authToken=root-token",
      "//npm.example.com/npm/:_authToken=exact-token",
    ].join("\n");
    expect(parseNpmrcToken(npmrc, "https://npm.example.com/npm/", {})).toBe("exact-token");
    expect(parseNpmrcToken(npmrc, "https://npm.example.com/other/", {})).toBe("root-token");
  });
});

describe("resolveToken", () => {
  const files: Record<string, string> = {
    "/project/.npmrc": "//registry.npmjs.org/:_authToken=project-token",
    "/home/.npmrc": "//registry.npmjs.org/:_authToken=user-token",
  };
  const readFile = (file: string) => files[file];
  const npmrcPaths = ["/project/.npmrc", "/home/.npmrc"];

  it("prefers an explicit token over everything", () => {
    expect(
      resolveToken(REGISTRY, { explicit: "flag", env: { NPM_TOKEN: "env" }, npmrcPaths, readFile }),
    ).toBe("flag");
  });

  it("prefers NPM_TOKEN, then NODE_AUTH_TOKEN, over .npmrc", () => {
    expect(
      resolveToken(REGISTRY, {
        env: { NPM_TOKEN: "a", NODE_AUTH_TOKEN: "b" },
        npmrcPaths,
        readFile,
      }),
    ).toBe("a");
    expect(resolveToken(REGISTRY, { env: { NODE_AUTH_TOKEN: "b" }, npmrcPaths, readFile })).toBe(
      "b",
    );
  });

  it("reads .npmrc files in order, skipping unreadable ones", () => {
    expect(resolveToken(REGISTRY, { env: {}, npmrcPaths, readFile })).toBe("project-token");
    expect(
      resolveToken(REGISTRY, {
        env: {},
        npmrcPaths: ["/missing/.npmrc", "/home/.npmrc"],
        readFile,
      }),
    ).toBe("user-token");
  });

  it("returns undefined when there is no token anywhere", () => {
    expect(resolveToken(REGISTRY, { env: {}, npmrcPaths: [], readFile })).toBeUndefined();
  });
});
