import { createHash } from "node:crypto";
import { Parser, type ReadEntry } from "tar";
import { errorMessage } from "../errors.js";

export interface TarballLimits {
  maxEntries: number;
  maxTotalBytes: number;
  /** Files larger than this are hashed but their bytes are not kept. */
  maxFileBytesInMemory: number;
}

export const DEFAULT_TARBALL_LIMITS: TarballLimits = {
  maxEntries: 20_000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxFileBytesInMemory: 64 * 1024 * 1024,
};

export type EntryKind = "file" | "directory" | "symlink" | "hardlink" | "other";

export interface TarEntry {
  /** Path inside the package with the top-level prefix removed, "/"-separated. */
  path: string;
  /** The header path as written in the archive. */
  rawPath: string;
  kind: EntryKind;
  size: number;
  /** Permission bits (mode & 0o777), undefined when the header has none. */
  mode: number | undefined;
  /** Hex SHA-256 of the content; files only. */
  sha256: string | undefined;
  /** The bytes, kept for files up to `maxFileBytesInMemory`. */
  content: Buffer | undefined;
  linkTarget: string | undefined;
}

export interface TarballContents {
  /** The top-level directory every entry shared, normally "package". */
  prefix: string | undefined;
  entries: Map<string, TarEntry>;
  /** Anything suspicious or unreadable. Each one is reported, never silently skipped. */
  problems: string[];
  /** Unpacked size of all entries that were read. */
  totalBytes: number;
}

function kindOf(type: string): EntryKind {
  switch (type) {
    case "File":
    case "OldFile":
    case "ContiguousFile":
      return "file";
    case "Directory":
      return "directory";
    case "SymbolicLink":
      return "symlink";
    case "Link":
      return "hardlink";
    default:
      return "other";
  }
}

function splitPath(raw: string): { segments: string[] } | { problem: string } {
  const slashed = raw.replace(/\\/g, "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) {
    return { problem: `absolute path "${raw}"` };
  }
  const segments = slashed.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    return { problem: `path traversal in "${raw}"` };
  }
  if (segments.length === 0) {
    return { problem: `empty path "${raw}"` };
  }
  return { segments };
}

interface RawEntry {
  segments: string[];
  entry: Omit<TarEntry, "path">;
}

/**
 * Reads a (gzipped or plain) tarball from untrusted bytes into a path-keyed map.
 * Nothing is written to disk and no link is followed; limits stop runaway archives.
 */
export function readTarball(
  bytes: Buffer,
  limits: TarballLimits = DEFAULT_TARBALL_LIMITS,
): TarballContents {
  const problems: string[] = [];
  const raw: RawEntry[] = [];
  let totalBytes = 0;
  let count = 0;
  let stopped = false;

  const parser = new Parser({
    strict: false,
    onReadEntry(entry: ReadEntry) {
      count += 1;
      if (stopped) {
        entry.resume();
        return;
      }
      if (count > limits.maxEntries) {
        stopped = true;
        problems.push(`more than ${limits.maxEntries} entries; stopped reading`);
        entry.resume();
        return;
      }
      const split = splitPath(entry.path);
      if ("problem" in split) {
        problems.push(split.problem);
        entry.resume();
        return;
      }
      const kind = kindOf(entry.type);
      if (kind === "other") {
        problems.push(`unsupported entry type ${entry.type} at "${entry.path}"`);
      }
      if (kind === "symlink" || kind === "hardlink") {
        problems.push(`${kind} "${entry.path}" -> "${entry.linkpath ?? ""}"`);
      }
      totalBytes += entry.size;
      if (totalBytes > limits.maxTotalBytes) {
        stopped = true;
        problems.push(`unpacked size exceeds ${limits.maxTotalBytes} bytes; stopped reading`);
        entry.resume();
        return;
      }
      const keep = kind === "file" && entry.size <= limits.maxFileBytesInMemory;
      const hash = createHash("sha256");
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        if (keep) {
          chunks.push(chunk);
        }
      });
      entry.on("end", () => {
        raw.push({
          segments: split.segments,
          entry: {
            rawPath: entry.path,
            kind,
            size: entry.size,
            mode: entry.mode === undefined ? undefined : entry.mode & 0o777,
            sha256: kind === "file" ? hash.digest("hex") : undefined,
            content: keep ? Buffer.concat(chunks) : undefined,
            linkTarget: entry.linkpath,
          },
        });
      });
    },
  });
  parser.on("warn", (code: string, message: string) => {
    problems.push(`${code}: ${message}`);
  });
  parser.on("error", (error: unknown) => {
    problems.push(`unreadable archive: ${errorMessage(error)}`);
  });
  try {
    parser.end(bytes);
  } catch (error) {
    problems.push(`unreadable archive: ${errorMessage(error)}`);
  }

  if (raw.length === 0 && problems.length === 0) {
    problems.push("archive has no entries");
  }

  // npm always packs under "package/"; strip whatever single top-level directory exists.
  const topLevel = new Set(raw.map((item) => item.segments[0]));
  let prefix: string | undefined;
  if (topLevel.size === 1) {
    [prefix] = topLevel;
  } else if (topLevel.size > 1) {
    problems.push(
      `entries do not share one top-level directory (${[...topLevel].slice(0, 5).join(", ")})`,
    );
  }

  const entries = new Map<string, TarEntry>();
  for (const { segments, entry } of raw) {
    const relative = prefix === undefined ? segments : segments.slice(1);
    if (relative.length === 0) {
      continue; // the prefix directory itself
    }
    const path = relative.join("/");
    if (entries.has(path)) {
      problems.push(`duplicate entry "${path}"`);
    }
    entries.set(path, { ...entry, path });
  }
  return { prefix, entries, problems, totalBytes };
}
