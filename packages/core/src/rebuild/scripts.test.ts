import { describe, expect, it } from "vitest";
import { type BuildPlan, OUT_DIR, REPO_DIR } from "./plan.js";
import {
  CLONE_SCRIPT,
  INSPECT_JS,
  renderBuildScript,
  renderCommand,
  renderInstallScript,
  shellQuote,
} from "./scripts.js";

const plan: BuildPlan = {
  packageDir: "packages/core",
  packageName: "@scope/core",
  packageVersion: "2.0.0",
  manager: { name: "pnpm", spec: "pnpm@10.4.1", source: "packageManager field" },
  nodeMajor: 22,
  nodeSource: "default",
  image: "node:22-bookworm",
  install: {
    argv: ["corepack", "pnpm@10.4.1", "install", "--frozen-lockfile", "--ignore-scripts"],
    cwd: REPO_DIR,
  },
  rebuildDeps: { argv: ["corepack", "pnpm@10.4.1", "-r", "rebuild"], cwd: REPO_DIR },
  build: {
    argv: ["corepack", "pnpm@10.4.1", "--filter", "@scope/core...", "run", "build"],
    cwd: REPO_DIR,
  },
  buildSource: "build script",
  pack: {
    argv: ["corepack", "pnpm@10.4.1", "pack", "--pack-destination", OUT_DIR],
    cwd: `${REPO_DIR}/packages/core`,
  },
  packDir: `${REPO_DIR}/packages/core`,
  warnings: [],
};

describe("shellQuote / renderCommand", () => {
  it("single-quotes every token so no shell metacharacter is interpreted", () => {
    expect(shellQuote("plain")).toBe("'plain'");
    expect(shellQuote('it\'s; rm -rf / $(x) `y` "z"')).toBe(`'it'\\''s; rm -rf / $(x) \`y\` "z"'`);
    expect(renderCommand({ argv: ["npm", "run", "build"], cwd: "/work/repo/pkg dir" })).toBe(
      "cd '/work/repo/pkg dir' && 'npm' 'run' 'build'",
    );
  });
});

describe("CLONE_SCRIPT", () => {
  it("takes every parameter from the environment and fails fast", () => {
    expect(CLONE_SCRIPT).toContain("set -euo pipefail");
    expect(CLONE_SCRIPT).toContain(`git remote add origin "\${RP_REPOSITORY}.git"`);
    expect(CLONE_SCRIPT).toContain(`git fetch -q --depth 1 origin "\${RP_COMMIT}"`);
    expect(CLONE_SCRIPT).toContain(`git checkout -q --detach "\${RP_COMMIT}"`);
    expect(CLONE_SCRIPT).toContain(`node -e "\${RP_INSPECT_JS}"`);
    expect(CLONE_SCRIPT).toContain("export GIT_TERMINAL_PROMPT=0");
  });

  it("ships the inspector on a single line and never requires repository code", () => {
    expect(INSPECT_JS).not.toContain("\n");
    expect(INSPECT_JS).toContain('require("node:fs")');
    // Only built-in modules are required; nothing from the checkout.
    const required = [...INSPECT_JS.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(required).toEqual(["node:fs", "node:path", "node:child_process"]);
    expect(INSPECT_JS).toContain('execFileSync("git",["ls-files","-z"]');
  });
});

describe("renderInstallScript", () => {
  it("runs the install command and reports the tool version", () => {
    const script = renderInstallScript(plan);
    expect(script).toContain("export HOME=/work/home");
    expect(script).toContain("export COREPACK_HOME=/work/home/.corepack");
    expect(script).toContain(
      "cd '/work/repo' && 'corepack' 'pnpm@10.4.1' 'install' '--frozen-lockfile' '--ignore-scripts'",
    );
    expect(script).toContain(`echo "__RP_TOOL_VERSION__ $('corepack' 'pnpm@10.4.1' '--version')"`);
  });

  it("asks the image's npm for its version when no spec is pinned", () => {
    const npmPlan: BuildPlan = {
      ...plan,
      manager: { name: "npm", spec: undefined, source: "package-lock.json" },
      install: { argv: ["npm", "ci", "--ignore-scripts"], cwd: REPO_DIR },
    };
    expect(renderInstallScript(npmPlan)).toContain(
      `echo "__RP_TOOL_VERSION__ $('npm' '--version')"`,
    );
  });
});

describe("renderBuildScript", () => {
  it("runs offline: dependency scripts (non-fatal), build, pack, then one tarball and its digest", () => {
    const script = renderBuildScript(plan);
    expect(script).toContain("export COREPACK_ENABLE_NETWORK=0");
    expect(script).toContain(
      "if ! ( cd '/work/repo' && 'corepack' 'pnpm@10.4.1' '-r' 'rebuild' ); then echo \"warning: running dependency scripts failed; continuing\" >&2; fi",
    );
    expect(script).toContain(
      "cd '/work/repo' && 'corepack' 'pnpm@10.4.1' '--filter' '@scope/core...' 'run' 'build'",
    );
    expect(script).toContain(
      "cd '/work/repo/packages/core' && 'corepack' 'pnpm@10.4.1' 'pack' '--pack-destination' '/work/out'",
    );
    expect(script).toContain('if [ "$count" != "1" ]; then');
    expect(script.trim().endsWith("sha256sum package.tgz")).toBe(true);
    // Dependency scripts run before the build, the build before the pack.
    expect(script.indexOf("'rebuild'")).toBeLessThan(script.indexOf("'run' 'build'"));
    expect(script.indexOf("'run' 'build'")).toBeLessThan(script.indexOf("'pack'"));
  });

  it("omits the optional steps when the plan has none", () => {
    const script = renderBuildScript({ ...plan, rebuildDeps: undefined, build: undefined });
    expect(script).not.toContain("rebuild");
    expect(script).not.toContain("'run' 'build'");
    expect(script).toContain("'pack'");
  });
});

describe("tool version reporting", () => {
  it("is printed by the build stage too, for plans that skip the install stage", () => {
    expect(renderBuildScript(plan)).toContain(
      `echo "__RP_TOOL_VERSION__ $('corepack' 'pnpm@10.4.1' '--version')"`,
    );
    expect(() => renderInstallScript({ ...plan, install: undefined })).toThrow(/no install step/);
  });
});
