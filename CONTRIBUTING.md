# Contributing

Thanks for helping. A few rules keep this tool trustworthy; please follow them.

## Setup

Node 22+, Corepack and Docker. Then:

```sh
corepack enable pnpm
pnpm install
pnpm check            # lint + typecheck + tests (offline, hermetic)
pnpm build
```

Opt-in tests that talk to the real world: `RELEASEPROOF_NET_TESTS=1` (registry, Sigstore)
and `RELEASEPROOF_DOCKER_TESTS=1` (real rebuilds). CI runs them weekly.

## Principles that every change must keep

- **Deterministic.** No LLMs, no heuristics that depend on time or environment. Same input,
  same verdict.
- **Fail closed.** Anything that cannot be verified is "could not verify", never "safe".
- **Untrusted by default.** Tarballs, manifests, attestations and repository contents are
  data. Never execute them on the host; validate before they touch a shell, a URL or a path.
- **No telemetry.** Nothing about the user's package leaves their machine.

## Adding a rule

Rules live in `packages/core/src/rules/` and are pure functions of the release tarball, the
rebuild, the diff and the provenance result. Every rule needs:

1. a stable kebab-case id and a severity with a one-line justification in
   `docs/rules.md`;
2. an "attacked" fixture in `fixtures/` that must trigger it and the `clean` fixture that
   must not;
3. a finding whose `detail` explains, in plain English, what was seen and why it matters.

## Changing the rebuild

`docs/design-rebuild.md` records the decisions and why. Changes to the stage scripts, the
Docker flags or the planner need a unit test and, when they affect real packages, a row in
`docs/real-world-results.md`.

## Pull requests

- Small, focused commits with conventional messages (`feat(core): …`, `fix(action): …`).
- `pnpm check` and `pnpm build` must pass. The Action bundle in `action/dist` is committed:
  run `pnpm build` and commit it with any change under `action/` or `packages/core/`.
- Add a changeset for user-visible changes: `pnpm changeset`.
- Third-party actions in workflows are pinned to full commit SHAs.
