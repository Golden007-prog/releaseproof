import type { EntryKind, TarballContents, TarEntry } from "./tarball.js";
import { classifyText, isProbablyText, unifiedDiff } from "./text.js";

export interface EntrySummary {
  kind: EntryKind;
  size: number;
  mode: number | undefined;
  executable: boolean;
  sha256: string | undefined;
  /** Whether the content looks like text; undefined when the bytes were not kept. */
  text: boolean | undefined;
}

export interface PathEntry extends EntrySummary {
  path: string;
}

/**
 * `content`: bytes differ. `whitespace`: only line endings or trailing whitespace differ.
 * `type`: file vs link vs directory. `mode`: same bytes, different permission bits.
 */
export type ChangeKind = "content" | "whitespace" | "type" | "mode";

export interface FileChange {
  path: string;
  kind: ChangeKind;
  release: EntrySummary;
  rebuild: EntrySummary;
  /** Unified diff for text changes under the size cap. */
  patch?: string | undefined;
}

export interface TarballSummary {
  files: number;
  bytes: number;
  prefix: string | undefined;
}

export interface DiffResult {
  /** True only when nothing differs and neither archive had problems. */
  matches: boolean;
  identical: string[];
  onlyInRelease: PathEntry[];
  onlyInRebuild: PathEntry[];
  changed: FileChange[];
  /** Differences that are normalized away (permission bits). Shown, never blocking. */
  info: FileChange[];
  problems: { release: string[]; rebuild: string[] };
  release: TarballSummary;
  rebuild: TarballSummary;
}

export interface CompareOptions {
  /** Largest text file (bytes) that still gets a unified diff. */
  maxPatchBytes?: number | undefined;
  /** Lines of context in unified diffs. */
  context?: number | undefined;
}

export const DEFAULT_MAX_PATCH_BYTES = 1024 * 1024;

function summarize(entry: TarEntry): EntrySummary {
  return {
    kind: entry.kind,
    size: entry.size,
    mode: entry.mode,
    executable: entry.mode !== undefined && (entry.mode & 0o111) !== 0,
    sha256: entry.sha256,
    text: entry.content ? isProbablyText(entry.content) : undefined,
  };
}

function summarizeArchive(contents: TarballContents): TarballSummary {
  let files = 0;
  let bytes = 0;
  for (const entry of contents.entries.values()) {
    if (entry.kind !== "directory") {
      files += 1;
      bytes += entry.size;
    }
  }
  return { files, bytes, prefix: contents.prefix };
}

/**
 * Compares the release tarball with the rebuilt one. Timestamps, ownership and entry order
 * are never looked at; permission bits are reported as info only.
 */
export function compareTarballs(
  release: TarballContents,
  rebuild: TarballContents,
  options: CompareOptions = {},
): DiffResult {
  const maxPatchBytes = options.maxPatchBytes ?? DEFAULT_MAX_PATCH_BYTES;
  const context = options.context ?? 3;
  const result: DiffResult = {
    matches: false,
    identical: [],
    onlyInRelease: [],
    onlyInRebuild: [],
    changed: [],
    info: [],
    problems: { release: [...release.problems], rebuild: [...rebuild.problems] },
    release: summarizeArchive(release),
    rebuild: summarizeArchive(rebuild),
  };

  const paths = [...new Set([...release.entries.keys(), ...rebuild.entries.keys()])].sort();
  for (const path of paths) {
    const a = release.entries.get(path);
    const b = rebuild.entries.get(path);
    if (a && !b) {
      if (a.kind !== "directory") {
        result.onlyInRelease.push({ path, ...summarize(a) });
      }
      continue;
    }
    if (b && !a) {
      if (b.kind !== "directory") {
        result.onlyInRebuild.push({ path, ...summarize(b) });
      }
      continue;
    }
    if (!a || !b) {
      continue;
    }
    const sa = summarize(a);
    const sb = summarize(b);
    if (a.kind === "directory" && b.kind === "directory") {
      continue; // directory entries carry nothing worth comparing
    }
    if (a.kind !== b.kind) {
      result.changed.push({ path, kind: "type", release: sa, rebuild: sb });
      continue;
    }
    if (a.kind === "symlink" || a.kind === "hardlink") {
      if (a.linkTarget === b.linkTarget) {
        result.identical.push(path);
      } else {
        result.changed.push({ path, kind: "content", release: sa, rebuild: sb });
      }
      continue;
    }
    if (a.sha256 !== b.sha256) {
      let kind: ChangeKind = "content";
      let patch: string | undefined;
      if (a.content && b.content && sa.text && sb.text) {
        if (classifyText(a.content, b.content) === "whitespace") {
          kind = "whitespace";
        }
        if (a.content.length <= maxPatchBytes && b.content.length <= maxPatchBytes) {
          patch = unifiedDiff(
            path,
            a.content.toString("utf8"),
            b.content.toString("utf8"),
            context,
          );
        }
      }
      result.changed.push({ path, kind, release: sa, rebuild: sb, patch });
      continue;
    }
    if (a.mode !== b.mode && a.mode !== undefined && b.mode !== undefined) {
      result.info.push({ path, kind: "mode", release: sa, rebuild: sb });
      continue;
    }
    result.identical.push(path);
  }

  result.matches =
    result.onlyInRelease.length === 0 &&
    result.onlyInRebuild.length === 0 &&
    result.changed.length === 0 &&
    result.problems.release.length === 0 &&
    result.problems.rebuild.length === 0;
  return result;
}
