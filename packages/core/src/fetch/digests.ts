import { createHash } from "node:crypto";

export interface Digests {
  /** Hex SHA-512, the form used in attestation subjects. */
  sha512Hex: string;
  /** Base64 SHA-512, the form used in `dist.integrity` (`sha512-…`). */
  sha512Base64: string;
  /** Hex SHA-1, the form used in `dist.shasum` and staged items. */
  sha1Hex: string;
}

export function computeDigests(bytes: Uint8Array): Digests {
  const sha512 = createHash("sha512").update(bytes).digest();
  return {
    sha512Hex: sha512.toString("hex"),
    sha512Base64: sha512.toString("base64"),
    sha1Hex: createHash("sha1").update(bytes).digest("hex"),
  };
}

/**
 * Returns the base64 digest of the `sha512-…` entry in an SRI string, or undefined when the
 * string has no well-formed sha512 entry. Other algorithms are ignored on purpose.
 */
export function sha512FromIntegrity(integrity: string): string | undefined {
  for (const entry of integrity.trim().split(/\s+/)) {
    if (!entry.startsWith("sha512-")) {
      continue;
    }
    const base64 = entry.slice("sha512-".length).split("?")[0] ?? "";
    if (Buffer.from(base64, "base64").length === 64) {
      return base64;
    }
  }
  return undefined;
}

export function base64ToHex(base64: string): string {
  return Buffer.from(base64, "base64").toString("hex");
}
