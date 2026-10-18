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

All runs used `nodeMajor: 22` to reuse one image on a slow connection; their release
workflows name Node 26 and 24 respectively. Neither package's output depends on the Node
major, but routine runs follow the workflow's version and pull one image per major.

Environment: Docker Desktop 4.95.0 (engine 29.8.2, WSL 2) on Windows 11, image digest
`node@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8`.
