---
"releaseproof": patch
---

First release through npm staged publishing: built in GitHub Actions, staged with
provenance by a stage-only trusted publisher, checked by releaseproof's own action
against the staged tarball, then approved with 2FA. No code changes; the README now
documents `npx releaseproof check <name>@<version>`.
