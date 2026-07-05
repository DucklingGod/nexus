// Reads a local image file and returns it as base64 + a mime type, for
// attaching to a chat message sent to a vision-capable model (Task 58). Pure
// local file I/O — no API key needed, unlike the OpenAI-backed tools in
// media.ts.

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Most vision APIs cap request images in the single-digit-MB range after
// base64 inflation (~33%); reject early with a clear message rather than
// letting a huge upload fail cryptically at the provider.
const MAX_BYTES = 8 * 1024 * 1024;

export async function readImageBase64(path: string): Promise<{ data: string; mediaType: string }> {
  const mediaType = MIME_BY_EXT[extname(path).toLowerCase()];
  if (!mediaType) throw new Error(`Unsupported image type: ${path} (supported: ${Object.keys(MIME_BY_EXT).join(", ")})`);
  const buf = await readFile(path);
  if (buf.byteLength > MAX_BYTES) throw new Error(`Image too large (${Math.round(buf.byteLength / 1024 / 1024)}MB) — max ${MAX_BYTES / 1024 / 1024}MB`);
  return { data: buf.toString("base64"), mediaType };
}
