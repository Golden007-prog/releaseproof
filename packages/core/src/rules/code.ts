export interface CodeSignals {
  minified: boolean;
  obfuscated: boolean;
  reasons: string[];
}

const CODE_EXTENSIONS = new Set([
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "mts",
  "cts",
  "tsx",
  "sh",
  "bash",
  "ps1",
  "py",
  "rb",
]);

export function isCodePath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return CODE_EXTENSIONS.has(extension);
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Cheap, deterministic heuristics. Minified code is normal in a build output; it only
 * matters when the rebuild did not produce the same file. Obfuscation signals are the
 * patterns real npm malware uses: hex-named identifiers, hex/unicode escapes, dynamic
 * evaluation combined with encoded payloads.
 */
export function analyzeCode(text: string): CodeSignals {
  const reasons: string[] = [];
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const average = lines.length === 0 ? 0 : text.length / lines.length;
  const minified = longest > 2000 || (text.length > 1000 && average > 400);
  if (minified) {
    reasons.push(`very long lines (longest ${longest} chars)`);
  }

  let score = 0;
  const hexIdentifiers = count(text, /\b_0x[0-9a-f]{4,}\b/g);
  if (hexIdentifiers >= 5) {
    reasons.push(`${hexIdentifiers} hex-named identifiers (_0x…)`);
    score += 2;
  }
  const hexEscapes = count(text, /\\x[0-9a-fA-F]{2}/g) + count(text, /\\u00[0-9a-fA-F]{2}/g);
  if (hexEscapes >= 20) {
    reasons.push(`${hexEscapes} hex or unicode escape sequences`);
    score += 1;
  }
  const dynamicEval = /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*["'`]/.test(text);
  if (dynamicEval) {
    reasons.push("dynamic code evaluation (eval / Function)");
    score += 1;
  }
  const encodedPayload =
    count(text, /String\.fromCharCode/g) >= 3 ||
    /(?:atob|Buffer\.from)\s*\(\s*["'`][A-Za-z0-9+/=]{200,}["'`]/.test(text) ||
    /["'`][A-Za-z0-9+/=]{500,}["'`]/.test(text);
  if (encodedPayload) {
    reasons.push("encoded payload (long base64 / fromCharCode)");
    score += 1;
  }
  const obfuscated = score >= 2;
  return { minified, obfuscated, reasons };
}
