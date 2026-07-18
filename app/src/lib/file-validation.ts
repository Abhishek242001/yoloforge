/**
 * File type allowlist enforcement.
 *
 * Extension checks alone are NOT security — a file named "photo.jpg" can
 * contain anything. We check magic bytes (the actual file signature) as
 * the authoritative gate; extension is only used for a fast client-side
 * pre-check and for choosing the stored filename.
 *
 * Explicitly blocked regardless of what's claimed: PDF, MP4, and anything
 * not in the allowlist below (executables, scripts, archives, etc).
 */

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/tiff",
  "text/plain", // YOLO .txt label files
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// Magic byte signatures for each allowed image type. .txt label files have
// no reliable magic bytes (plain text), so they're validated separately
// by confirming the content is parseable as YOLO-format lines.
const MAGIC_BYTES: Array<{ mime: AllowedMimeType; signature: number[]; offset?: number }> = [
  { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/bmp", signature: [0x42, 0x4d] },
  { mime: "image/tiff", signature: [0x49, 0x49, 0x2a, 0x00] }, // little-endian TIFF
  { mime: "image/tiff", signature: [0x4d, 0x4d, 0x00, 0x2a] }, // big-endian TIFF
];

function bytesMatch(buffer: Uint8Array, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[offset + i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Inspects the first ~16 bytes of a file to determine its real type.
 * Returns the detected MIME type if it's in the allowlist, or null if
 * it's not an image we recognize (caller should then check if it's a
 * valid .txt label file via validateYoloLabelContent).
 */
export function detectImageMimeType(headerBytes: Uint8Array): AllowedMimeType | null {
  for (const { mime, signature } of MAGIC_BYTES) {
    if (bytesMatch(headerBytes, signature)) return mime;
  }
  return null;
}

/** Returns a human-readable label if the bytes match a blocked format, else null. */
export function detectBlockedFormat(headerBytes: Uint8Array): string | null {
  if (bytesMatch(headerBytes, [0x25, 0x50, 0x44, 0x46])) return "PDF";
  if (bytesMatch(headerBytes, [0x66, 0x74, 0x79, 0x70], 4)) return "MP4/MOV video";
  if (bytesMatch(headerBytes, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(headerBytes, [0x41, 0x56, 0x49, 0x20], 8))
    return "AVI video";
  if (bytesMatch(headerBytes, [0x50, 0x4b, 0x03, 0x04])) return "ZIP (nested archive — extract before uploading)";
  return null;
}

/**
 * A .txt file has no magic bytes, so we validate it's plausibly a YOLO
 * label file: every non-empty line must be `class_id x y w h` with 5
 * whitespace-separated numeric tokens, class_id an integer, and the four
 * coordinates in [0,1]. Rejects anything else (scripts, random text, etc.)
 * from silently entering the pipeline as a "label" file.
 */
export function validateYoloLabelContent(text: string): { valid: boolean; reason?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { valid: true }; // empty label file (no boxes) is legitimate
  }
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 5) {
      return { valid: false, reason: `Expected 5 values per line, got ${parts.length}: "${line.slice(0, 60)}"` };
    }
    const [cls, x, y, w, h] = parts;
    if (!/^\d+$/.test(cls)) {
      return { valid: false, reason: `class_id must be a non-negative integer: "${cls}"` };
    }
    for (const [name, val] of [
      ["x_center", x],
      ["y_center", y],
      ["width", w],
      ["height", h],
    ] as const) {
      const n = Number(val);
      if (Number.isNaN(n) || n < 0 || n > 1) {
        return { valid: false, reason: `${name} must be a number in [0,1]: "${val}"` };
      }
    }
  }
  return { valid: true };
}

/** Extension allowlist for the fast client-side pre-check (not the security boundary). */
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".txt"];
