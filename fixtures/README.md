# Test fixtures

Tiny npm packages used by the test suite. None of them is ever published or installed.

- `clean/` — the reference package.
- `attacked-*/` — the same package with one change an attacker might make. Every variant
  must be caught by the diff and rules; `clean` compared with itself must be silent.

The "attacked" files are harmless stand-ins: they print a line or export a string. They are
here so tests can assert on paths and diffs, not to exercise any behaviour.
