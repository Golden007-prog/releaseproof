---
"releaseproof": minor
---

First release. `releaseproof check <name>@<version>` fetches a published (or, with
`--stage`, a staged) npm version, verifies its provenance against the Sigstore trust root,
rebuilds it from the certified commit in a hardened Docker container, compares the two
tarballs file by file, and reports a verdict with graded findings: MATCHES SOURCE (0),
DIFFERS FROM SOURCE (1) or COULD NOT VERIFY (2).
