import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { create, Header } from "tar";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function fixtureDir(name: string): string {
  return path.join(repoRoot, "fixtures", name);
}

/** Relative, "/"-separated paths of every file under a directory, sorted. */
export function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const normalized = entry.replace(/\\/g, "/");
    if (statSync(path.join(dir, entry)).isFile()) {
      files.push(normalized);
    }
  }
  return files.sort();
}

export interface PackOptions {
  prefix?: string | undefined;
  /** Default: the 1985 timestamp npm uses. */
  mtime?: Date | undefined;
  /** `portable: true` (default) drops uid/gid/uname like npm does. */
  portable?: boolean | undefined;
  gzip?: boolean | undefined;
  /** Reorders the entries, to prove order does not matter. */
  reverse?: boolean | undefined;
}

/** Packs a directory the way `npm pack` would (prefix "package", fixed mtime), in memory. */
export async function packDirectory(dir: string, options: PackOptions = {}): Promise<Buffer> {
  const files = listFiles(dir);
  if (options.reverse) {
    files.reverse();
  }
  const pack = create(
    {
      cwd: dir,
      gzip: options.gzip ?? true,
      portable: options.portable ?? true,
      prefix: options.prefix ?? "package",
      mtime: options.mtime ?? new Date("1985-10-26T08:15:00.000Z"),
    },
    files,
  );
  return pack.concat();
}

export function packFixture(name: string, options?: PackOptions): Promise<Buffer> {
  return packDirectory(fixtureDir(name), options);
}

export interface RawTarEntry {
  path: string;
  content?: Buffer | string | undefined;
  type?: "File" | "Directory" | "SymbolicLink" | "Link" | "FIFO" | undefined;
  linkpath?: string | undefined;
  mode?: number | undefined;
}

/**
 * Builds an uncompressed tar from explicit headers, including ones `tar.create` would
 * refuse to write (absolute paths, "..", links). For testing the reader's defences.
 */
export function rawTar(entries: RawTarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content ?? "", "utf8");
    const type = entry.type ?? "File";
    const header = new Header({
      path: entry.path,
      type,
      size: type === "File" ? content.length : 0,
      mode: entry.mode ?? (type === "Directory" ? 0o755 : 0o644),
      mtime: new Date("1985-10-26T08:15:00.000Z"),
      ...(entry.linkpath === undefined ? {} : { linkpath: entry.linkpath }),
    });
    const block = Buffer.alloc(512);
    header.encode(block, 0);
    blocks.push(block);
    if (type === "File" && content.length > 0) {
      const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512);
      content.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}
