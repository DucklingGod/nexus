// vision_analyze — analyze images using the vision-capable model.
// Reads an image (URL, file path, or data URL) and asks the model to analyze it.

import { registerTool } from "./registry.ts";
import { readFile } from "node:fs/promises";

export function registerVisionAnalyzeTool(): void {
  registerTool(
    {
      name: "vision_analyze",
      category: "knowledge" as const,
      description:
        "Analyze an image using a vision-capable model. Accepts a URL, local file path, or data URL. " +
        "Returns the image as a base64 attachment that the agent can describe in its response. " +
        "Use when the user references an image, shares a screenshot, or asks about visual content.",
      parameters: [
        {
          name: "image_url",
          type: "string",
          description: "Image URL (http/https), local file path, or data: URL to analyze",
          required: true,
        },
        {
          name: "question",
          type: "string",
          description: "What to analyze or describe in the image (e.g., 'What text is shown?', 'Describe this chart')",
        },
      ],
    },
    async (args) => {
      const imageUrl = String(args.image_url || "").trim();
      const question = String(args.question || "Describe this image in detail.").trim();

      if (!imageUrl) return { output: "Error: image_url is required." };

      try {
        let base64Data: string;
        let mediaType = "image/png";

        if (imageUrl.startsWith("data:")) {
          const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
          if (!match) return { output: "Error: invalid data URL format." };
          mediaType = match[1];
          base64Data = match[2];
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          const resp = await fetch(imageUrl);
          if (!resp.ok) return { output: `Error: failed to fetch image (${resp.status}).` };
          const ct = resp.headers.get("content-type") || "";
          if (ct.includes("jpeg") || ct.includes("jpg")) mediaType = "image/jpeg";
          else if (ct.includes("webp")) mediaType = "image/webp";
          else if (ct.includes("gif")) mediaType = "image/gif";
          const buf = Buffer.from(await resp.arrayBuffer());
          base64Data = buf.toString("base64");
        } else {
          const buf = await readFile(imageUrl);
          if (imageUrl.endsWith(".jpg") || imageUrl.endsWith(".jpeg")) mediaType = "image/jpeg";
          else if (imageUrl.endsWith(".webp")) mediaType = "image/webp";
          else if (imageUrl.endsWith(".gif")) mediaType = "image/gif";
          base64Data = buf.toString("base64");
        }

        // Return the image as context — the agent's next message will include it
        // and the vision-capable model can describe it
        return {
          output: `[Image loaded: ${imageUrl}]\nQuestion: ${question}\n\nThe image has been loaded as a ${mediaType} attachment. Describe what you see in the image and answer the question above.`,
          image: { data: base64Data, mediaType },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Vision analysis failed: ${msg}` };
      }
    }
  );
}
