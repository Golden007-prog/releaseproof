## What

<!-- One or two sentences: what changes for a user or a contributor. -->

## Why

<!-- The problem or issue this solves. "Closes #123" when it resolves an issue. -->

## How it was tested

<!-- pnpm check output, new tests, a real package you ran it against (with the verdict). -->

## Checklist

- [ ] `pnpm check` and `pnpm build` pass locally
- [ ] Tests added or updated next to the code (attacked and clean cases for security logic)
- [ ] `action/dist` rebuilt and committed if `action/` or `packages/core/` changed
- [ ] Changeset added (`pnpm changeset`) if users will notice the change
- [ ] No new runtime dependency, or an issue discussed it first
- [ ] Fail-closed behaviour kept: nothing turns "could not verify" into "matches"
