import { describe, it, expect, afterAll } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readImageBase64 } from "./attachments.ts";

const dir = await mkdtemp(join(tmpdir(), "nexus-img-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("readImageBase64", () => {
  it("reads a png and returns base64 + mime type", async () => {
    const path = join(dir, "a.png");
    await writeFile(path, Buffer.from([1, 2, 3, 4]));
    const { data, mediaType } = await readImageBase64(path);
    expect(mediaType).toBe("image/png");
    expect(Buffer.from(data, "base64")).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("rejects an unsupported extension", async () => {
    const path = join(dir, "a.svg");
    await writeFile(path, "<svg/>");
    await expect(readImageBase64(path)).rejects.toThrow(/Unsupported image type/);
  });

  it("rejects a file over the size cap", async () => {
    const path = join(dir, "big.jpg");
    await writeFile(path, Buffer.alloc(9 * 1024 * 1024));
    await expect(readImageBase64(path)).rejects.toThrow(/too large/);
  });
});
