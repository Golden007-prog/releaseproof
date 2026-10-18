import type { BuildPlan, Command } from "./plan.js";

/** Single-quotes a token for bash; the only escape needed is for `'` itself. */
export function shellQuote(token: string): string {
  return `'${token.replace(/'/g, "'\\''")}'`;
}

export function renderCommand(command: Command): string {
  return `cd ${shellQuote(command.cwd)} && ${command.argv.map(shellQuote).join(" ")}`;
}

export const INSPECTION_MARKER = "__RP_INSPECTION__";
export const TOOL_VERSION_MARKER = "__RP_TOOL_VERSION__";

/**
 * Everything a stage inherits. HOME lives in the volume so caches, Corepack downloads and
 * any config a tool writes persist between stages and never touch the image or the host.
 */
const COMMON_ENV = [
  "export HOME=/work/home",
  "export CI=1",
  "export NO_COLOR=1 FORCE_COLOR=0",
  "export GIT_TERMINAL_PROMPT=0",
  "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_ENABLE_STRICT=0 COREPACK_ENABLE_AUTO_PIN=0",
  "export COREPACK_HOME=/work/home/.corepack",
  // We always name the exact tool ourselves; a project whose packageManager field names
  // something Corepack does not know (seen: "nub@0.8.3") must not make Corepack refuse to
  // run at all.
  "export COREPACK_ENABLE_PROJECT_SPEC=0",
  // Shims installed by the install stage, so package scripts that call pnpm or yarn by
  // name (tsx's prepack runs "pnpm build") find them offline.
  'export PATH="/work/home/bin:$PATH"',
  "export npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false",
].join("\n");

/**
 * Runs inside the clone stage with cwd /work/repo. Reads files only; nothing from the
 * repository is required or executed. Written on one line because it travels in an
 * environment variable.
 */
export const INSPECT_JS = [
  'const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");',
  'const files=cp.execFileSync("git",["ls-files","-z"],{maxBuffer:64*1024*1024}).toString().split("\\0").filter(Boolean);',
  'const read=(f)=>{try{return fs.readFileSync(f,"utf8")}catch{return undefined}};',
  "const packages=[];",
  'for(const f of files){if(path.posix.basename(f)!=="package.json"||f.split("/").includes("node_modules"))continue;',
  'let j;try{j=JSON.parse(read(f)??"")}catch{continue}if(!j||typeof j!=="object")continue;',
  'packages.push({dir:path.posix.dirname(f),name:j.name,version:j.version,private:j.private,scripts:j.scripts,packageManager:j.packageManager,publishConfig:j.publishConfig,engines:j.engines,lockfiles:["package-lock.json","npm-shrinkwrap.json","pnpm-lock.yaml","yarn.lock"].filter((n)=>fs.existsSync(path.posix.join(path.posix.dirname(f),n))),hasWorkspaces:Array.isArray(j.workspaces)||(!!j.workspaces&&typeof j.workspaces==="object")});}',
  'const lockfiles=["package-lock.json","npm-shrinkwrap.json","pnpm-lock.yaml","yarn.lock","bun.lock","bun.lockb"].filter((n)=>fs.existsSync(n));',
  "const lockfileDetails={};",
  'const pl=read("pnpm-lock.yaml");if(pl){const m=/^lockfileVersion:\\s*[\'"]?([\\d.]+)/m.exec(pl);if(m)lockfileDetails.pnpm=m[1];}',
  'const nl=read("package-lock.json");if(nl){try{lockfileDetails.npm=JSON.parse(nl).lockfileVersion}catch{}}',
  'const yl=read("yarn.lock");if(yl){lockfileDetails.yarnBerry=/^__metadata:/m.test(yl);}',
  'const nodeVersionFiles={};for(const n of [".nvmrc",".node-version",".tool-versions"]){const c=read(n);if(c!==undefined)nodeVersionFiles[n]=c.slice(0,500);}',
  'const wf=process.env.RP_WORKFLOW;const workflow=wf&&files.includes(wf)?(read(wf)??"").slice(0,200000):null;',
  'const out={commit:cp.execFileSync("git",["rev-parse","HEAD"]).toString().trim(),lockfiles,lockfileDetails,nodeVersionFiles,hasYarnrcYml:fs.existsSync(".yarnrc.yml"),hasPnpmWorkspace:fs.existsSync("pnpm-workspace.yaml"),hasSubmodules:fs.existsSync(".gitmodules"),hasLernaJson:fs.existsSync("lerna.json"),packages,workflow};',
  "process.stdout.write(JSON.stringify(out));",
].join("");

/** Stage 1: fetch exactly RP_COMMIT from RP_REPOSITORY, then print the inspection JSON. */
export const CLONE_SCRIPT = `set -euo pipefail
${COMMON_ENV}
cd /work
rm -rf repo
mkdir repo
cd repo
git init -q
git remote add origin "\${RP_REPOSITORY}.git"
if ! git fetch -q --depth 1 origin "\${RP_COMMIT}"; then
  echo "shallow fetch of the commit failed; fetching all branches" >&2
  git fetch -q origin
fi
git checkout -q --detach "\${RP_COMMIT}"
if [ -f .gitmodules ]; then
  git submodule update -q --init --recursive --depth 1 || git submodule update -q --init --recursive
fi
echo ${INSPECTION_MARKER}
node -e "\${RP_INSPECT_JS}"
`;

/** The command that prints the package manager version actually in use. */
function versionCommand(plan: BuildPlan): string {
  const tool = plan.manager.name === "npm" ? "npm" : plan.manager.name === "pnpm" ? "pnpm" : "yarn";
  const argv = plan.manager.spec
    ? ["corepack", plan.manager.spec, "--version"]
    : [tool, "--version"];
  return `echo "${TOOL_VERSION_MARKER} $(${argv.map(shellQuote).join(" ")})"`;
}

/** Stage 2 (network): install with scripts ignored, then report the tool version used. */
export function renderInstallScript(plan: BuildPlan): string {
  if (!plan.install) {
    throw new Error("this plan has no install step");
  }
  return `set -euo pipefail
${COMMON_ENV}
mkdir -p /work/home
${toolSetup(plan)}${renderCommand(plan.install)}
${plan.installExtra ? `${renderCommand(plan.installExtra)}\n` : ""}${versionCommand(plan)}
`;
}

/**
 * Makes pnpm or yarn callable by name from package scripts: Corepack shims in the volume
 * plus the version itself in Corepack's cache, both written while the network is still
 * available so the offline build stage never needs it.
 */
function toolSetup(plan: BuildPlan): string {
  if (!plan.manager.spec) {
    return "";
  }
  return [
    "mkdir -p /work/home/bin",
    "corepack enable --install-directory /work/home/bin",
    `corepack install -g ${shellQuote(plan.manager.spec)}`,
    "",
  ].join("\n");
}

/** Stage 3 (no network): dependency scripts, build, pack; prints the tarball's sha256. */
export function renderBuildScript(plan: BuildPlan): string {
  const lines = [
    "set -euo pipefail",
    COMMON_ENV,
    "export COREPACK_ENABLE_NETWORK=0",
    versionCommand(plan),
    "mkdir -p /work/out",
    "rm -f /work/out/*.tgz",
  ];
  if (plan.setVersion) {
    // Release tooling (semantic-release, changesets) sets the version before the publish
    // build runs; bundlers embed it (tsx emits a chunk named by its hash), so it must be
    // in place before the build, not just before the pack.
    lines.push(
      renderCommand({
        argv: ["npm", "pkg", "set", `version=${plan.setVersion}`],
        cwd: plan.packDir,
      }),
    );
  }
  if (plan.rebuildDeps) {
    lines.push(
      `if ! ( ${renderCommand(plan.rebuildDeps)} ); then echo "warning: running dependency scripts failed; continuing" >&2; fi`,
    );
  }
  if (plan.build) {
    lines.push(renderCommand(plan.build));
  }
  lines.push(
    renderCommand(plan.pack),
    "cd /work/out",
    "count=$(ls -1 *.tgz 2>/dev/null | wc -l)",
    'if [ "$count" != "1" ]; then echo "expected exactly one packed tarball, found $count" >&2; exit 1; fi',
    "mv ./*.tgz package.tgz",
    "sha256sum package.tgz",
  );
  return `${lines.join("\n")}\n`;
}

/** Stage 0: make the volume writable by the unprivileged user every other stage runs as. */
export const INIT_SCRIPT = "set -eu\nmkdir -p /work/out /work/home\nchown -R 1000:1000 /work\n";
