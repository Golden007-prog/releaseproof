import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureDir, listFiles, packFixture, rawTar } from "../../test/tarballs.js";
import { readTarball } from "./tarball.js";

describe("readTarball", () => {
  it("reads the clean fixture: paths, hashes, content, prefix", async () => {
    const contents = readTarball(await packFixture("clean"));
    expect(contents.problems).toEqual([]);
    expect(contents.prefix).toBe("package");
    expect([...contents.entries.keys()].sort()).toEqual(listFiles(fixtureDir("clean")));

    const index = contents.entries.get("index.js");
    const bytes = readFileSync(path.join(fixtureDir("clean"), "index.js"));
    expect(index?.kind).toBe("file");
    expect(index?.size).toBe(bytes.length);
    expect(index?.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(index?.content?.equals(bytes)).toBe(true);
    expect(index?.mode).toBe(0o644);
    expect(contents.totalBytes).toBeGreaterThan(0);
  });

  it("reads uncompressed archives too and strips any single top-level directory", () => {
    const contents = readTarball(
      rawTar([
        { path: "pkg/a.txt", content: "a" },
        { path: "pkg/b/c.txt", content: "c" },
      ]),
    );
    expect(contents.prefix).toBe("pkg");
    expect([...contents.entries.keys()]).toEqual(["a.txt", "b/c.txt"]);
    expect(contents.problems).toEqual([]);
  });

  it("reports absolute paths and path traversal instead of using them", () => {
    const contents = readTarball(
      rawTar([
        { path: "package/ok.txt", content: "ok" },
        { path: "/etc/passwd", content: "x" },
        { path: "package/../../escape.txt", content: "x" },
      ]),
    );
    expect([...contents.entries.keys()]).toEqual(["ok.txt"]);
    expect(contents.problems).toEqual([
      'absolute path "/etc/passwd"',
      'path traversal in "package/../../escape.txt"',
    ]);
  });

  it("keeps links as entries but flags them; npm never packs links", () => {
    const contents = readTarball(
      rawTar([
        { path: "package/real.txt", content: "x" },
        { path: "package/link.txt", type: "SymbolicLink", linkpath: "/etc/passwd" },
        { path: "package/hard.txt", type: "Link", linkpath: "package/real.txt" },
      ]),
    );
    expect(contents.entries.get("link.txt")).toMatchObject({
      kind: "symlink",
      linkTarget: "/etc/passwd",
    });
    expect(contents.entries.get("hard.txt")?.kind).toBe("hardlink");
    expect(contents.problems).toEqual([
      'symlink "package/link.txt" -> "/etc/passwd"',
      'hardlink "package/hard.txt" -> "package/real.txt"',
    ]);
  });

  it("flags unsupported entry types, duplicates and mixed top-level directories", () => {
    const contents = readTarball(
      rawTar([
        { path: "package/a.txt", content: "1" },
        { path: "package/a.txt", content: "2" },
        { path: "other/b.txt", content: "3" },
        { path: "package/fifo", type: "FIFO" },
      ]),
    );
    expect(contents.prefix).toBeUndefined();
    expect(contents.problems).toEqual(
      expect.arrayContaining([
        'unsupported entry type FIFO at "package/fifo"',
        "entries do not share one top-level directory (package, other)",
        'duplicate entry "package/a.txt"',
      ]),
    );
    // The later duplicate wins, as tar extraction would do.
    expect(contents.entries.get("package/a.txt")?.content?.toString()).toBe("2");
  });

  it("stops at the entry and size limits and says so", () => {
    const many = rawTar(
      Array.from({ length: 5 }, (_, i) => ({ path: `package/${i}.txt`, content: "x" })),
    );
    const limited = readTarball(many, {
      maxEntries: 3,
      maxTotalBytes: 1024,
      maxFileBytesInMemory: 1024,
    });
    expect(limited.entries.size).toBe(3);
    expect(limited.problems).toEqual(["more than 3 entries; stopped reading"]);

    const big = rawTar([
      { path: "package/a.bin", content: Buffer.alloc(600) },
      { path: "package/b.bin", content: Buffer.alloc(600) },
    ]);
    const sized = readTarball(big, {
      maxEntries: 100,
      maxTotalBytes: 1000,
      maxFileBytesInMemory: 1024,
    });
    expect([...sized.entries.keys()]).toEqual(["a.bin"]);
    expect(sized.problems).toEqual(["unpacked size exceeds 1000 bytes; stopped reading"]);
  });

  it("hashes but does not keep files above the in-memory limit", () => {
    const content = Buffer.alloc(2000, 7);
    const contents = readTarball(rawTar([{ path: "package/big.bin", content }]), {
      maxEntries: 100,
      maxTotalBytes: 1_000_000,
      maxFileBytesInMemory: 1000,
    });
    const entry = contents.entries.get("big.bin");
    expect(entry?.content).toBeUndefined();
    expect(entry?.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(contents.problems).toEqual([]);
  });

  it("reports garbage or empty input as a problem with no entries", () => {
    for (const bytes of [Buffer.from("definitely not a tarball, just text"), Buffer.alloc(0)]) {
      const contents = readTarball(bytes);
      expect(contents.entries.size).toBe(0);
      expect(contents.problems).toEqual(["TAR_BAD_ARCHIVE: Unrecognized archive format"]);
    }
  });
});
