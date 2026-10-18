import { describe, expect, it } from "vitest";
import { fixtureContext, ruleContext } from "../../test/context.js";
import { rawTar } from "../../test/tarballs.js";
import { readTarball } from "../diff/tarball.js";
import { runRules } from "./index.js";
import type { Finding } from "./types.js";

function ids(findings: Finding[]): string[] {
  return findings.map((finding) => `${finding.severity}:${finding.id}`);
}

describe("runRules on the fixture packages", () => {
  it("is silent for the clean package built from a verified source", async () => {
    expect(runRules(await fixtureContext("clean"))).toEqual([]);
  });

  it("catches an added install script as critical, plus the file it runs", async () => {
    const findings = runRules(await fixtureContext("attacked-postinstall"));
    expect(ids(findings)).toEqual(["critical:install-script-added", "high:file-added"]);
    expect(findings[0]).toMatchObject({
      title: 'install script added: "postinstall"',
      evidence: { script: "postinstall", command: "node lib/setup.js" },
    });
    expect(findings[1]?.paths).toEqual(["lib/setup.js"]);
  });

  it("catches a file the source does not produce", async () => {
    const findings = runRules(await fixtureContext("attacked-extra-file"));
    expect(ids(findings)).toEqual(["high:file-added"]);
    expect(findings[0]?.paths).toEqual(["lib/telemetry.js"]);
  });

  it("catches modified content with the patch as evidence", async () => {
    const findings = runRules(await fixtureContext("attacked-modified"));
    expect(ids(findings)).toEqual(["high:file-changed"]);
    const patches = findings[0]?.evidence?.patches as Record<string, string>;
    expect(patches["lib/greet.js"]).toContain("+  const beacon");
  });

  it("catches an added dependency", async () => {
    const findings = runRules(await fixtureContext("attacked-dependency"));
    expect(ids(findings)).toEqual(["high:dependency-added"]);
    expect(findings[0]?.evidence).toEqual({
      field: "dependencies",
      name: "left-pad",
      range: "^1.3.0",
    });
  });

  it("catches a native addon the source does not produce as critical", async () => {
    const findings = runRules(await fixtureContext("attacked-binary"));
    expect(ids(findings)).toEqual(["critical:native-code-added", "high:file-added"]);
    expect(findings[0]?.paths).toEqual(["build/Release/native.node"]);
  });

  it("catches obfuscated code the source does not produce as critical", async () => {
    const findings = runRules(await fixtureContext("attacked-obfuscated"));
    expect(ids(findings)).toEqual(["critical:obfuscated-code-added", "high:file-added"]);
    expect(findings[0]?.detail).toContain("hex-named identifiers");
  });

  it("reports files the release lacks as medium", async () => {
    const findings = runRules(await fixtureContext("clean", "attacked-extra-file"));
    expect(ids(findings)).toEqual(["medium:file-missing"]);
    expect(findings[0]?.paths).toEqual(["lib/telemetry.js"]);
  });

  it("downgrades to 'present' findings when there is no rebuild to compare with", async () => {
    expect(ids(runRules(await fixtureContext("attacked-postinstall", null)))).toEqual([
      "medium:install-script-present",
    ]);
    expect(ids(runRules(await fixtureContext("attacked-binary", null)))).toEqual([
      "medium:native-code-present",
    ]);
    expect(runRules(await fixtureContext("clean", null))).toEqual([]);
  });

  it("keeps install scripts that match the source as info only", async () => {
    const findings = runRules(await fixtureContext("attacked-postinstall", "attacked-postinstall"));
    expect(ids(findings)).toEqual(["info:install-script-present"]);
  });
});

describe("file rules on crafted tarballs", () => {
  const clean = (files: Array<{ path: string; content?: string; mode?: number }>) =>
    readTarball(rawTar(files.map((f) => ({ ...f, path: `package/${f.path}` }))));

  it("flags unexpected paths: high when the source lacks them, medium when it has them too", () => {
    const withEditor = clean([
      { path: "package.json", content: "{}" },
      { path: ".vscode/tasks.json", content: "{}" },
      { path: ".claude/settings.json", content: "{}" },
    ]);
    const without = clean([{ path: "package.json", content: "{}" }]);
    const high = runRules(ruleContext(withEditor, without)).filter(
      (f) => f.id === "unexpected-path",
    );
    expect(high.map((f) => [f.severity, f.paths])).toEqual([
      ["high", [".claude/settings.json"]],
      ["high", [".vscode/tasks.json"]],
    ]);
    const medium = runRules(ruleContext(withEditor, withEditor)).filter(
      (f) => f.id === "unexpected-path",
    );
    expect(medium.map((f) => f.severity)).toEqual(["medium", "medium"]);
  });

  it("flags tarball problems as critical even when files match", () => {
    const release = readTarball(
      rawTar([
        { path: "package/package.json", content: "{}" },
        { path: "package/evil", type: "SymbolicLink", linkpath: "/etc/passwd" },
      ]),
    );
    const rebuild = clean([{ path: "package.json", content: "{}" }]);
    const findings = runRules(ruleContext(release, rebuild));
    expect(findings.map((f) => f.id)).toContain("tarball-problem");
    expect(findings.find((f) => f.id === "tarball-problem")?.severity).toBe("critical");
  });

  it("labels whitespace-only changes low and binary additions high", () => {
    const release = clean([
      { path: "package.json", content: "{}" },
      { path: "a.js", content: "x = 1;\r\n" },
      { path: "blob.dat", content: "\u0000\u0001\u0002binary" },
    ]);
    const rebuild = clean([
      { path: "package.json", content: "{}" },
      { path: "a.js", content: "x = 1;\n" },
    ]);
    expect(ids(runRules(ruleContext(release, rebuild)))).toEqual([
      "high:binary-added",
      "high:file-added",
      "low:file-changed-whitespace",
    ]);
  });

  it("does not call images binaries, and ignores minified code the source also produces", () => {
    const minified = `${"var a=1;".repeat(400)}\n`;
    const release = clean([
      { path: "package.json", content: "{}" },
      { path: "logo.png", content: "\u0089PNG\u0000" },
      { path: "dist/index.min.js", content: minified },
    ]);
    const rebuild = clean([
      { path: "package.json", content: "{}" },
      { path: "dist/index.min.js", content: minified },
    ]);
    expect(ids(runRules(ruleContext(release, rebuild)))).toEqual(["high:file-added"]);
    const changed = clean([
      { path: "package.json", content: "{}" },
      { path: "dist/index.min.js", content: `${minified}x();` },
    ]);
    expect(ids(runRules(ruleContext(changed, rebuild)))).toEqual([
      "high:file-changed",
      "high:minified-code-added",
    ]);
  });
});

describe("source rules", () => {
  it("turns planner warnings into low or info findings", async () => {
    const findings = runRules(
      await fixtureContext("clean", "clean", {
        rebuildWarnings: [
          "repository has version 0.9.0 at this commit, the release is 1.0.0",
          "no lockfile found: dependency versions are not pinned, so the rebuild may drift",
          "repository uses git submodules; they are cloned at their recorded commits",
        ],
      }),
    );
    expect(ids(findings)).toEqual([
      "low:no-lockfile",
      "low:version-not-in-source",
      "info:rebuild-note",
    ]);
  });
});
