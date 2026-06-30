// Media tools: image generation and text-to-speech via OpenAI-compatible APIs.
//
// API keys are brokered from the OS keychain by Rust (chat_send / connector_start)
// and stashed here per request via setMediaKeys — same pattern as web keys.

import { registerTool } from "./registry.ts";
import { getSetting } from "../db/settings.ts";

let mediaKeys: { openai?: string } = {};
export function setMediaKeys(keys: { openai?: string } | undefined): void {
  mediaKeys = keys ?? {};
}

function getOpenAIKey(): string | undefined {
  // Prefer brokered key from keychain; fall back to env for local dev.
  return mediaKeys.openai || process.env.OPENAI_API_KEY;
}

function getOpenAIBaseURL(): string {
  return getSetting("media.openaiBaseUrl")?.trim() || "https://api.openai.com/v1";
}

export function registerMediaTools(): void {
  registerTool(
    {
      name: "image_generate",
      category: "media" as const,
      description:
        "Generate an image from a text description using DALL-E. " +
        "Returns the image URL. Use detailed, descriptive prompts for best results.",
      parameters: [
        { name: "prompt", type: "string", description: "Detailed text description of the desired image", required: true },
        {
          name: "size",
          type: "string",
          description: 'Image size: "256x256", "512x512", or "1024x1024" (default)',
        },
        {
          name: "quality",
          type: "string",
          description: '"standard" (default) or "hd"',
        },
      ],
    },
    async (args) => {
      const key = getOpenAIKey();
      if (!key) {
        return {
          output:
            "No OpenAI API key set. Add it in Settings → API Keys → OpenAI, " +
            "or set the OPENAI_API_KEY environment variable.",
        };
      }

      const prompt = String(args.prompt);
      const size = String(args.size || "1024x1024");
      const quality = String(args.quality || "standard");
      const base = getOpenAIBaseURL();

      try {
        const res = await fetch(`${base}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt,
            n: 1,
            size,
            quality,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return { output: `OpenAI image generation failed (HTTP ${res.status}): ${errText.slice(0, 500)}` };
        }

        const data = (await res.json()) as {
          data?: { url?: string; revised_prompt?: string }[];
        };

        const img = data.data?.[0];
        if (!img?.url) return { output: "Image generation succeeded but no image URL was returned." };

        let output = `Image generated successfully!\nURL: ${img.url}`;
        if (img.revised_prompt) output += `\nRevised prompt: ${img.revised_prompt}`;
        return { output };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Image generation error: ${msg}` };
      }
    },
  );

  registerTool(
    {
      name: "text_to_speech",
      category: "media" as const,
      description:
        "Convert text to natural-sounding speech audio using OpenAI TTS. " +
        "Returns the audio file path.",
      parameters: [
        { name: "text", type: "string", description: "The text to convert to speech (max ~4000 chars)", required: true },
        {
          name: "voice",
          type: "string",
          description: 'Voice: "alloy", "echo", "fable", "onyx", "nova", or "shimmer" (default: alloy)',
        },
        {
          name: "speed",
          type: "number",
          description: "Speech speed factor (0.25–4.0, default 1.0)",
        },
      ],
    },
    async (args) => {
      const key = getOpenAIKey();
      if (!key) {
        return {
          output:
            "No OpenAI API key set. Add it in Settings → API Keys → OpenAI, " +
            "or set the OPENAI_API_KEY environment variable.",
        };
      }

      const text = String(args.text).slice(0, 4096);
      const voice = String(args.voice || "alloy");
      const speed = Number(args.speed) || 1.0;
      const base = getOpenAIBaseURL();

      try {
        const res = await fetch(`${base}/audio/speech`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "tts-1",
            input: text,
            voice,
            speed,
            response_format: "mp3",
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return { output: `OpenAI TTS failed (HTTP ${res.status}): ${errText.slice(0, 500)}` };
        }

        // Save the audio to a temp file
        const buf = new Uint8Array(await res.arrayBuffer());
        const tmpDir = process.env.TEMP || process.env.TMP || "/tmp";
        const filename = `tts_${Date.now()}.mp3`;
        const filepath = `${tmpDir}${process.platform === "win32" ? "\\" : "/"}${filename}`;
        const { writeFileSync } = await import("node:fs");
        writeFileSync(filepath, buf);

        const sizeKB = Math.round(buf.length / 1024);
        return {
          output:
            `Speech generated successfully!\nFile: ${filepath}\nSize: ${sizeKB} KB\nVoice: ${voice}\n` +
            `The audio file is ready to play at the path above.`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Text-to-speech error: ${msg}` };
      }
    },
  );
}
