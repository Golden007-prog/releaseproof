# releaseproof

**Verify every npm release matches its source before you approve it.**

> 🚧 Work in progress. Not ready for use yet.

## The problem

In 2026, attackers started publishing malware through package maintainers' own
release pipelines. In the TanStack incident (May 2026), a stolen publish token
was used to release 84 malicious versions across 42 packages, and those
versions carried valid provenance. The maintainers learned about it from an
outside security company.

npm's answer is **staged publishing**: a release waits until a maintainer
approves it with 2FA. From January 2027, tokens that bypass 2FA can only stage
releases, not publish them. That puts every serious maintainer in front of an
**Approve** button, but npm shows no diff and no scan there. The maintainer has
to decide, on their own, whether the tarball is really theirs.

## What releaseproof does

1. **Watches** for a new release (staged or published) of your package.
2. **Rebuilds** the package from the tagged git commit in a clean container.
3. **Compares** the release with the rebuild, file by file.
4. **Checks** the things attackers add: new install scripts, new dependencies,
   unexpected files (such as `.vscode/` or `.claude/`), binaries, and
   provenance pointing to the wrong repository or workflow.
5. **Reports** a clear verdict before you click Approve:
   - ✅ Matches your source
   - 🚨 Differs from your source, with exactly what changed

No LLM, no API key, no server. Same input, same answer, every time.

## Planned packages

| Package | What it is |
| --- | --- |
| `releaseproof` (CLI) | `npx releaseproof check <package>@<version>` |
| GitHub Action | Runs on every release and posts the verdict as an issue |

## Status

Early development. Follow the repository for progress.

## License

[MIT](./LICENSE) © 2026 Ujjwal Verma
