import { createTwoFilesPatch } from "diff";

const SAMPLE_BYTES = 8 * 1024;

/** Heuristic used by git and others: a NUL byte near the start means binary. */
export function isProbablyText(bytes: Buffer): boolean {
  const end = Math.min(bytes.length, SAMPLE_BYTES);
  for (let i = 0; i < end; i += 1) {
    if (bytes[i] === 0) {
      return false;
    }
  }
  return true;
}

/** LF line endings, no trailing whitespace on lines, exactly one trailing newline. */
export function normalizeWhitespace(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }
  return `${lines.map((line) => line.replace(/[ \t]+$/, "")).join("\n")}\n`;
}

export type TextDifference = "identical" | "whitespace" | "content";

/** `whitespace` means only line endings or trailing whitespace differ. */
export function classifyText(a: Buffer, b: Buffer): TextDifference {
  if (a.equals(b)) {
    return "identical";
  }
  return normalizeWhitespace(a.toString("utf8")) === normalizeWhitespace(b.toString("utf8"))
    ? "whitespace"
    : "content";
}

/**
 * Unified diff from the rebuilt (expected) file to the released (actual) one, so lines an
 * attacker added show up as `+` and lines they removed as `-`.
 */
export function unifiedDiff(path: string, release: string, rebuild: string, context = 3): string {
  return createTwoFilesPatch(
    `rebuild/${path}`,
    `release/${path}`,
    rebuild,
    release,
    undefined,
    undefined,
    { context },
  );
}
