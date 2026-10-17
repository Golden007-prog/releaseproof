/**
 * Decodes a DER-encoded ASN.1 UTF8String (tag 0x0C). Fulcio writes certificate extensions
 * 1.3.6.1.4.1.57264.1.8 and above this way. Returns undefined for anything malformed so the
 * caller treats the field as absent and fails closed.
 */
export function decodeDerUtf8String(bytes: Uint8Array): string | undefined {
  if (bytes.length < 2 || bytes[0] !== 0x0c) {
    return undefined;
  }
  let offset = 1;
  let length = bytes[offset] ?? 0;
  offset += 1;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || bytes.length < offset + count) {
      return undefined;
    }
    length = 0;
    for (let i = 0; i < count; i += 1) {
      length = length * 256 + (bytes[offset] ?? 0);
      offset += 1;
    }
  }
  if (offset + length !== bytes.length) {
    return undefined;
  }
  return Buffer.from(bytes.subarray(offset)).toString("utf8");
}

/** Encodes a string as a DER UTF8String. Used by tests to build certificate fixtures. */
export function encodeDerUtf8String(value: string): Uint8Array {
  const body = Buffer.from(value, "utf8");
  let header: number[];
  if (body.length < 0x80) {
    header = [0x0c, body.length];
  } else {
    const lengthBytes: number[] = [];
    let remaining = body.length;
    while (remaining > 0) {
      lengthBytes.unshift(remaining & 0xff);
      remaining = Math.floor(remaining / 256);
    }
    header = [0x0c, 0x80 | lengthBytes.length, ...lengthBytes];
  }
  return Buffer.concat([Buffer.from(header), body]);
}
