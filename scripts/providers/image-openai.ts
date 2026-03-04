/**
 * OpenAI DALL-E Image Generation Provider.
 * Uses the DALL-E 3 API for generating chapter illustrations.
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./image.js";
import { retryWithBackoff } from "./llm.js";

export interface OpenAIImageConfig {
  apiKey: string;
  model?: string;      // "dall-e-3" (default) or "dall-e-2"
  quality?: "standard" | "hd";
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai-dalle";
  private apiKey: string;
  private model: string;
  private quality: "standard" | "hd";

  constructor(config: OpenAIImageConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || "dall-e-3";
    this.quality = config.quality || "standard";
  }

  async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    return retryWithBackoff(
      () => this.doGenerate(options),
      { label: "openai-dalle", maxRetries: 2 },
    );
  }

  private async doGenerate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    // DALL-E 3 only supports specific sizes
    const size = this.resolveSize(options.width ?? 1024, options.height ?? 768);

    const body: Record<string, unknown> = {
      model: this.model,
      prompt: this.buildPrompt(options),
      n: 1,
      size,
      quality: this.quality,
      response_format: "b64_json",
    };

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI DALL-E API error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      data: Array<{
        b64_json?: string;
        url?: string;
        revised_prompt?: string;
      }>;
    };

    const imageData = data.data?.[0];
    if (!imageData?.b64_json) {
      throw new Error("OpenAI DALL-E API returned no image data");
    }

    const imageBuffer = Buffer.from(imageData.b64_json, "base64");
    const [w, h] = size.split("x").map(Number);

    return {
      imageBuffer,
      format: "png",
      width: w,
      height: h,
      revisedPrompt: imageData.revised_prompt,
    };
  }

  /**
   * DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
   * DALL-E 2 supports: 256x256, 512x512, 1024x1024
   * Map requested dimensions to nearest supported size.
   */
  private resolveSize(width: number, height: number): string {
    if (this.model === "dall-e-2") {
      return "1024x1024";
    }

    const ratio = width / height;
    if (ratio > 1.3) return "1792x1024";    // landscape
    if (ratio < 0.77) return "1024x1792";   // portrait
    return "1024x1024";                      // square
  }

  private buildPrompt(options: ImageGenerationOptions): string {
    const stylePrefix: Record<string, string> = {
      conceptual: "Clean, modern conceptual illustration in flat design style with subtle gradients. Professional technical editorial style.",
      diagram: "Technical system diagram with clean lines, labeled components, and professional color scheme. Isometric 3D perspective.",
      infographic: "Data visualization infographic with clear visual hierarchy, charts, icons, and branded color scheme.",
      illustration: "Professional technical illustration with modern flat design aesthetic, suitable for a premium technical ebook.",
    };

    const prefix = stylePrefix[options.style || "illustration"];
    return `${prefix} ${options.prompt}. Brand colors: cyan (#0891b2) and green (#16a34a). Clean off-white background. No text, no watermarks, no logos. High contrast, sharp edges.`;
  }
}
