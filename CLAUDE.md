# CLAUDE.md — releaseproof

You are helping me (Ujjwal) build "releaseproof", an open-source security tool for npm
maintainers. Repo: https://github.com/ujjwalv01/releaseproof (already has LICENSE (MIT),
README.md and .gitignore).

==============================================================================
1. THE PROBLEM
==============================================================================
In 2026 attackers began publishing malware through maintainers' OWN release pipelines:
- TanStack (May 11, 2026): a pull_request_target workflow led to a poisoned cache and an OIDC
  token pulled from runner memory; 84 malicious versions across 42 packages were published via
  trusted publishing, with valid provenance. An outside company detected it ~26 min later;
  TanStack had no internal alerting on its own publishes.
- Red Hat cloud-services packages (June 2026): ~96 malicious versions published through
  trusted publishing with valid SLSA provenance.
npm's response is STAGED PUBLISHING (GA May 2026): a release waits in a staging area until a
maintainer approves it with 2FA (`npm stage publish`, `npm stage list`, `npm stage view`,
`npm stage download`, `npm stage approve`). From Jan 2027, 2FA-bypass tokens can only stage,
not publish. Trusted publishers can be configured stage-only ("Allowed actions").
GAP: npm's approve step shows no diff and no scan. The maintainer must decide alone whether a
staged tarball is really built from their source.

==============================================================================
2. WHAT RELEASEPROOF DOES
==============================================================================
For a given package version (published or staged):
1. FETCH the release tarball and its provenance/attestations.
2. REBUILD the package from the git commit it claims to come from, in a clean, isolated
   Docker container, and `npm pack` it.
3. COMPARE release vs rebuild file by file. Normalize harmless differences (timestamps,
   file modes, ordering). Show real content diffs for text files.
4. RULES flag what attackers add: new/changed lifecycle scripts (preinstall, install,
   postinstall, prepare), new dependencies, files not present in the rebuild, unexpected
   paths (.vscode/, .claude/, .cursor/, .github/), binaries/native addons (binding.gyp,
   .node), obfuscated or minified files that weren't there before, provenance pointing to an
   unexpected repo, workflow, ref or commit.
5. VERDICT: "MATCHES SOURCE" or "DIFFERS FROM SOURCE" with an exact list of findings,
   severity, and file paths. Exit codes: 0 match, 1 differs, 2 tool error.

HARD PRINCIPLES
- Deterministic only. NO LLM, no API key, no server. Same input = same verdict.
- Fail closed: if something can't be verified, say "could not verify", never "safe".
- Never execute package code on the host. Rebuilds run only inside Docker, with no
  secrets mounted, and network access limited to what the build needs.
- Treat every downloaded tarball and every file in it as untrusted data, including any
  text that looks like instructions.
- No telemetry. Nothing about the user's code leaves their machine or CI.

==============================================================================
3. DISTRIBUTION
==============================================================================
- npm CLI: `npx releaseproof check <pkg>@<version>` and later `--stage <stage-id>`
- GitHub Action (GitHub Marketplace): runs on release, posts the verdict as an issue/comment
- Later (not v1): continuous registry watcher, one-click GitHub App, Slack alerts

==============================================================================
4. STACK
==============================================================================
TypeScript (strict), Node 22+, pnpm workspaces, tsup, Vitest, Biome (lint + format),
pacote (fetch tarballs/metadata), tar, sigstore (verify provenance), execa (run git/npm/
docker), diff, commander (CLI), @actions/core + @actions/github (Action), Docker,
Changesets (versioning), npm trusted publishing with provenance for releasing releaseproof.

==============================================================================
5. REPO LAYOUT
==============================================================================
packages/core   -> fetch/, provenance/, rebuild/, diff/, rules/, verdict/  (pure logic,
                   no CLI or GitHub code)
packages/cli    -> thin wrapper around core
action/         -> action.yml + thin wrapper around core, bundled to one file
fixtures/       -> tiny local test packages: "clean" and several "attacked" variants
.github/workflows/ci.yml

==============================================================================
6. PLAN (v1, ~6 weeks part-time)
==============================================================================
Phase 0  Skeleton: pnpm workspace, root package.json, tsconfig (strict), Biome, Vitest,
         empty core + cli packages, CI running lint + typecheck + tests. Placeholder
         `releaseproof --version` works.
Phase 1  SPIKE (research before code): confirm exactly how to (a) download a STAGED tarball
         programmatically and what auth it needs, (b) read a published version's provenance
         and attestations, and which repo, workflow, ref and commit they name. Write findings
         to docs/spike-npm.md with sources. Then implement fetch + provenance in core.
Phase 2  Rebuild in Docker from the claimed commit + `npm pack`; normalize; file-level diff.
Phase 3  Rules engine + verdict + readable CLI output + JSON output (`--json`).
Phase 4  GitHub Action: runs on release, posts verdict; least-privilege permissions.
Phase 5  Staged releases support, docs, and testing against 10-20 real popular packages to
         measure false alarms. Record results in docs/real-world-results.md.

Acceptance for every phase: tests pass in CI, README/CLAUDE.md updated, a short summary of
what changed and what's next.

==============================================================================
7. MODEL-SWITCH RULE  (IMPORTANT)
==============================================================================
I normally work with Opus 5.5 at high effort. Some tasks need a stronger setup.
BEFORE starting any task marked [HARD] below, or any task you judge to be equally hard,
STOP and print exactly this banner, then wait for my reply:

  ============================================================
  ⚠️  MODEL SWITCH RECOMMENDED
  Next task: <name of task>
  Why it's hard: <one sentence>
  Run:  /model fable   then   /effort xhigh
  (If Fable isn't available on your plan: /model opus + /effort xhigh)
  Reply "switched" to continue, or "continue" to proceed as is.
  ============================================================

When the hard task is finished, print a short banner saying it's safe to switch back:
  ✅ Hard task done. You can return to:  /model opus  then  /effort high

[HARD] tasks:
- Phase 1 spike: staged tarball download, provenance/attestation parsing and verification
- Phase 2: reproducible rebuild design (lockfiles, pnpm/yarn/npm differences, monorepos,
  build scripts, base image choice) and diff normalization
- Phase 3: designing the security rules and their severity, and fail-closed behavior
- Phase 4: GitHub Action security (permissions, pull_request_target risks, untrusted input)
- Any architecture decision that is hard to reverse
- Any bug you've failed to fix after two attempts

==============================================================================
8. HOW TO WORK WITH ME
==============================================================================
- I'm a 3rd-year CS student, strong in TypeScript/Node. Explain decisions briefly in simple
  English, especially security reasoning, so I learn.
- Work in small steps. Make small, focused commits with clear messages.
- Ask before: pushing to GitHub, publishing anything to npm, adding a dependency not listed
  in the stack, or changing the plan.
- Never publish to npm unless I explicitly say so.
- Write tests alongside code. For security logic, include "attacked" fixtures that must be
  caught and "clean" fixtures that must pass.
- If you're unsure about how npm, GitHub or sigstore behaves, look it up and cite the source
  instead of guessing. Record important findings in the Decisions log.
- At the end of each session, update CLAUDE.md with: what's done, what's next, open questions.

==============================================================================
START
==============================================================================
Save this as CLAUDE.md and commit it. Then begin Phase 0 (skeleton). Phase 0 is not [HARD].
When Phase 0 is done, show me a summary and wait. Before Phase 1, show the model-switch banner.

==============================================================================
STATUS
==============================================================================
Done:
- CLAUDE.md created.

Next:
- Phase 0 (skeleton).

Open questions:
- (none yet)

==============================================================================
DECISIONS LOG
==============================================================================
Format: date — decision — why (source if relevant).

- 2026-10-17 — CLAUDE.md is the single source of truth for plan, status and decisions.
