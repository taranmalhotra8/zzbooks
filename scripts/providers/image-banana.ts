/**
 * Banana Pro Image Generation Provider.
 * Uses the Banana Pro API for generating chapter illustrations and inline images.
 */

import type { ImageProvider, ImageGenerationOptions, ImageGenerationResult } from "./image.js";
import { retryWithBackoff } from "./llm.js";

export interface BananaProConfig {
  apiKey: string;
  modelId?: string;
}

export class BananaProProvider implements ImageProvider {
  readonly name = "banana";
  private apiKey: string;
  private modelId: string;

  constructor(config: BananaProConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || "default";
  }

  async generate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    return retryWithBackoff(
      () => this.doGenerate(options),
      { label: "banana-pro", maxRetries: 2 },
    );
  }

  private async doGenerate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const width = options.width ?? 1024;
    const height = options.height ?? 768;

    const body: Record<string, unknown> = {
      prompt: this.buildPrompt(options),
      negative_prompt: options.negativePrompt || "blurry, low quality, text, watermark, logo",
      width,
      height,
      num_inference_steps: 30,
    };

    if (options.seed !== undefined) {
      body.seed = options.seed;
    }

    const response = await fetch("https://api.banana.pro/v1/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model_id: this.modelId,
        ...body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Banana Pro API error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      image?: string; // base64 encoded
      images?: string[]; // some endpoints return array
      revised_prompt?: string;
    };

    const base64Image = data.image || data.images?.[0];
    if (!base64Image) {
      throw new Error("Banana Pro API returned no image data");
    }

    const imageBuffer = Buffer.from(base64Image, "base64");

    return {
      imageBuffer,
      format: "png",
      width,
      height,
      revisedPrompt: data.revised_prompt,
    };
  }

  private buildPrompt(options: ImageGenerationOptions): string {
    const stylePrefix = {
      conceptual: "Clean, modern conceptual illustration in flat design style with subtle gradients.",
      diagram: "Technical diagram with clean lines, labeled components, professional color scheme.",
      infographic: "Data visualization infographic with charts, icons, and clear hierarchy.",
      illustration: "Professional technical illustration with clean lines and modern aesthetic.",
    };

    const prefix = stylePrefix[options.style || "illustration"];
    return `${prefix} ${options.prompt}. Brand colors: cyan (#0891b2), green (#16a34a). Off-white background. No text overlays.`;
  }
}
