# Real-world results

Rebuilds of real published packages, compared against the registry tarball. "Match" means
every file is byte-identical after normalization (timestamps, ownership, entry order and
permission bits are ignored; see `docs/design-rebuild.md` section 5).

| Date | Package | Source (from provenance) | Manager | Node image | Build | Result | Wall time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | `semver@7.8.5` | `npm/node-semver@6e05b76` | npm 10.9.9 (no lockfile in repo) | `node:22-bookworm` | none; packed as checked out | **match**, 53/53 files | 9.9 min | Almost all time is `npm install` of dev dependencies that `npm pack` never uses. Follow-up: skip the install stage when there is no build, prepack or prepare script. |
| 2026-10-17 | `sigstore@5.0.0` | `sigstore/sigstore-js@7d2900e` | npm 10.9.9, workspaces | `node:22-bookworm` | root `npm run build` (tsc) | **match**, 9/9 files | 2.2 min | Workspace package `packages/client`. |

| 2026-10-18 | `sigstore@5.0.0` (via `releaseproof check`) | `sigstore/sigstore-js@7d2900e` | npm 10.9.9, workspaces | `node:22-bookworm` | `packages/client` build script, run from the root | **MATCHES SOURCE**, exit 0, 9/9 files, no findings | 4.1 min | Full CLI path: fetch → provenance → rebuild → diff → verdict. Concurrent with another run, hence slower. |
| 2026-10-18 | `commander@15.0.0` (via `releaseproof check`) | none (no provenance) | — | — | — | **COULD NOT VERIFY**, exit 2, finding `provenance-missing` | 4 s | No Docker involved: nothing to rebuild from without `--repo`/`--commit`. |
| 2026-10-18 | `commander@15.0.0` with `--repo https://github.com/tj/commander.js --commit ba6d13d…` | named by the user (the manifest's `gitHead`) | npm 10.9.9, no lockfile | `node:22-bookworm` | none; packed as checked out | **MATCHES SOURCE** "(named by you, not certified by provenance)", exit 0, 12/12 files, 1 medium note | 3.1 min | Again almost all install time for a package that needs no build. |

| 2026-10-18 | `express@5.3.0` | `expressjs/express@cf6722b` | npm (no lockfile) | `node:22-bookworm` | none; install stage skipped | **MATCHES SOURCE**, 10/10 files, low `no-lockfile` | 61 s | Skipping the install stage works: a minute instead of ten. |
| 2026-10-18 | `axios@1.20.0` | `axios/axios@84a9f3b` | npm 10.9.9 | `node:22-bookworm` | `build` script | **MATCHES SOURCE**, 89/89 files | 2.7 min | |
| 2026-10-18 | `tsx@4.23.15` (first attempt) | `privatenumber/tsx@ca66105` | pnpm 10.9.0 (root package) | `node:22-bookworm` | `build` script | **COULD NOT VERIFY**: build stage failed | 4.2 min | Three gaps found: `pnpm --filter` does not match the workspace root; `prepack` calls `pnpm` by name (not on PATH); the commit's version is `0.0.0-semantic-release`. All three fixed; rerun below. |
| 2026-10-18 | `zod@4.6.7` (first attempt) | `colinhacks/zod@b500a2e` | pnpm 10 (workspace) | `node:22-bookworm` | — | **COULD NOT VERIFY**: install stage failed | 31 s | `packageManager: "nub@0.8.3"` makes Corepack refuse to run anything; fixed with `COREPACK_ENABLE_PROJECT_SPEC=0`; rerun below. |
| 2026-10-18 | `@tanstack/query-core@5.104.3` | `TanStack/query@ee47993` | pnpm 12.4.2 (workspace) | `node:22-bookworm` | `build` script of `packages/query-core`, run from the root | **MATCHES SOURCE**, 365/365 files | 12.3 min | First pnpm monorepo rebuilt bit-for-bit. |

| 2026-10-18 | `@actions/core@3.0.1` (first attempt) | `actions/toolkit@cf80afb` | npm (Lerna monorepo, no npm workspaces) | `node:22-bookworm` | none chosen | **DIFFERS**: 24 files only in the release (`lib/*.js`, `.d.ts`, maps) | 49 s | Planner gap: the package's build script is `tsc`, the root build is `lerna run tsc`, and `lerna.json` (not `workspaces`) defines the workspace. Fixed: Lerna marker, `lerna run <script>` parsing, per-package install; rerun below. |
| 2026-10-18 | `tsup@9.0.0` | `egoist/tsup@198479b` (signed by `sxzz/workflows`) | pnpm 10.34.7 (root package) | `node:22-bookworm` | `build` script | **COULD NOT VERIFY**: build stage failed | 10.5 min | The JS build succeeded; the `.d.ts` worker died with `ERR_WORKER_OUT_OF_MEMORY` in this machine's 3.9 GB Docker VM. Environment limit, not a tool gap; `--memory` now exposed. Also the first `provenance-signer-outside-repository` (medium) in the wild. |
| 2026-10-18 | `tar@7.5.22` with `--repo isaacs/node-tar --commit 2a22bfc…` | named by the user | npm 10.9.9 | `node:22-bookworm` | none; `prepare` (tshy) runs inside `npm pack` | **MATCHES SOURCE** (named source), 249/249 files | 6.6 min | The pack-time `prepare` script correctly kept the install stage. |
| 2026-10-18 | `execa@10.1.1` with `--repo sindresorhus/execa --commit cc7bcab…` | named by the user | npm (no lockfile) | `node:22-bookworm` | none; install skipped | **MATCHES SOURCE** (named source), 147/147 files | 13 s | |
| 2026-10-18 | `chalk@6.0.1` with `--repo chalk/chalk --commit 47fc05a…` | named by the user | npm (no lockfile) | `node:22-bookworm` | none; install skipped | **MATCHES SOURCE** (named source), 12/12 files | 12 s | |

| 2026-10-18 | `@actions/core@3.0.1` (rerun) | `actions/toolkit@cf80afb` | npm 10.9.9 (Lerna, per-package lockfile) | `node:22-bookworm` | `tsc` script of `packages/core`, named by the root `lerna run tsc` | **MATCHES SOURCE**, 27/27 files, no findings | 3.5 min | After the Lerna support. |

| 2026-10-18 | `tsx@4.23.15` (rerun) | `privatenumber/tsx@ca66105` | pnpm 10.9.0 (root package) | `node:22-bookworm` | `build` script (pkgroll), `prepack` builds again | **MATCHES SOURCE**, 30/30 files, low `version-not-in-source` | 3 min | Needed all four fixes: plain `pnpm run build` for a root package, Corepack shims so `prepack` can call `pnpm`, and the released version applied *before* the first build (otherwise a stale `dist/package-<hash>.mjs` chunk from the placeholder version survives into the pack). |
| 2026-10-18 | `zod@4.6.7` (rerun) | `colinhacks/zod@b500a2e` | `nub@0.8.3` (unsupported) | — | — | **COULD NOT VERIFY**: package manager "nub@0.8.3" is not supported | 19 s | zod uses its own package manager; releaseproof now says so instead of falling back to pnpm and failing later. |

| 2026-10-18 | `releaseproof@0.1.1` **staged** (stage id 98c0aec6…), checked with `--stage --repo ujjwalv01/releaseproof --commit a75606a…` | named by the user (staged items expose no attestations before approval) | pnpm 12.14.0 (workspace, `packages/cli`) | `node:22-bookworm` | `build` script of `packages/cli`, run from the root | **MATCHES SOURCE** (named source), 3/3 files, medium `provenance-missing` | 1.5 min | releaseproof checking its own staged release before the maintainer approved it. Tarball SHA-512 64380e5d… equals the integrity npm printed at stage time. |

| 2026-10-18 | `releaseproof@0.1.1` (published, after `npm stage approve`) | `ujjwalv01/releaseproof@a75606a`, ref `main`, workflow `release.yml` (verified) | pnpm 12.14.0 (workspace, `packages/cli`) | `node:22-bookworm` | `build` script of `packages/cli`, run from the root | **MATCHES SOURCE**, 3/3 files, no findings; publish attestation verified | 48 s | Same tarball as the staged check above (shasum 2829f503…), now with certified provenance from the trusted-publisher workflow. The release flow releaseproof recommends, applied to itself. |

**Tally after this batch:** 11 real packages rebuilt bit-for-bit (sigstore, semver, express,
axios, @tanstack/query-core, tar, execa, chalk, @actions/core, tsx, and commander with a
named source), 0 false DIFFERS verdicts, 2 honest COULD NOT VERIFY (tsup: this machine's
Docker memory; zod: unsupported package manager).

All runs used `nodeMajor: 22` to reuse one image on a slow connection; their release
workflows name Node 26 and 24 respectively. Neither package's output depends on the Node
major, but routine runs follow the workflow's version and pull one image per major.

Environment: Docker Desktop 4.95.0 (engine 29.8.2, WSL 2) on Windows 11, image digest
`node@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8`.
